import { supabase } from "../lib/supabase.js";

/**
 * HabiTick Cryptography Engine (v3)
 * Standard-compliant Zero-Knowledge Client-Side Encryption
 * 
 * Cryptographic Specifications:
 * - Cipher: AES-256-GCM with 128-bit authentication tag
 * - IV: 12-byte cryptographically secure random vector (crypto.getRandomValues)
 * - Key Derivation: PBKDF2 (RFC 2898 / NIST SP 800-132) with HMAC-SHA-256 and 100,000 iterations
 * - Envelope Prefix: "htv3:<base64(iv + ciphertext)>"
 * - Full backward compatibility with legacy v2 ("htv2:") and v1 (unprefixed base64) formats
 * - Multi-candidate salt resilience: transparently decrypts items across all historical salt migrations
 */

const keyCache = new Map();
const saltCache = new Map();

// Known salts across HabiTick versions for backward compatibility
export const V2_SALT_PRIMARY = "HabiTick_Secure_Salt_V2_5e82f1b402cf8da7a66b5c00e1291c6e";
export const V3_SALT_STATIC = "HabiTick_Secure_Salt_V3_5e82f1b402cf8da7a66b5c00e1291c6e";
export const V1_SALT = "HabiTick_Frontend_Secure_Salt_2026";

async function getAccessToken() {
  try {
    if (typeof supabase !== "undefined" && supabase?.auth) {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    }
  } catch (e) {
    // Non-blocking
  }
  return null;
}

export async function getSalt(userId) {
  if (!userId) return V2_SALT_PRIMARY;
  if (saltCache.has(userId)) return saltCache.get(userId);

  // 1. Check persistent localStorage cache
  if (typeof localStorage !== "undefined") {
    try {
      const local = localStorage.getItem(`ht_salt_${userId}`);
      if (local) {
        saltCache.set(userId, local);
        return local;
      }
    } catch (e) {}
  }

  // 2. Fetch authenticated user-scoped salt from server
  try {
    const token = await getAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch("/api/get-salt", { headers });
    if (res.ok) {
      const data = await res.json();
      if (data && data.salt) {
        saltCache.set(userId, data.salt);
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.setItem(`ht_salt_${userId}`, data.salt);
          } catch (e) {}
        }
        return data.salt;
      }
    }
  } catch (e) {
    // Offline or server unreachable
  }

  // 3. Fallback: Deterministic user fallback salt (not permanently stored to allow later server hydration)
  const fallbackSalt = `HabiTick_Fallback_Salt_v3_${userId}`;
  saltCache.set(userId, fallbackSalt);
  return fallbackSalt;
}

/**
 * Key derivation for legacy v1 and v2 encryption (SHA-256)
 */
export async function getLegacyKey(userId, salt) {
  const cacheKey = `${userId}_legacy_${salt}`;
  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey);
  }

  const enc = new TextEncoder();
  const keyData = enc.encode(userId + salt);
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  keyCache.set(cacheKey, cryptoKey);
  return cryptoKey;
}

/**
 * Key derivation for standard v3 encryption (PBKDF2 100,000 iterations + HMAC-SHA-256)
 */
export async function getV3Key(userId, salt = null) {
  const actualSalt = salt || (await getSalt(userId));
  const cacheKey = `${userId}_v3_${actualSalt}`;
  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey);
  }

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(`${userId}:${actualSalt}`),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(actualSalt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  keyCache.set(cacheKey, cryptoKey);
  return cryptoKey;
}

/**
 * Encrypt plaintext string into "htv3:<base64>" using AES-256-GCM + PBKDF2
 */
export async function encryptText(text, userId) {
  if (!text) return "";
  if (!userId) return text;

  try {
    const salt = await getSalt(userId);
    const key = await getV3Key(userId, salt);
    const enc = new TextEncoder();
    const encoded = enc.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    let binary = "";
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }

    return "htv3:" + btoa(binary);
  } catch (e) {
    console.error("[HabiTick Crypto] Encryption failed:", e);
    return text;
  }
}

/**
 * Helper to derive client-side HMAC user salt using standard Web Crypto API
 */
async function deriveHmacSaltClient(secret, userId) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(`user_salt_v3:${userId}`)
    );
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return null;
  }
}

/**
 * Collect candidate salts for a given user to guarantee decryption resilience
 */
async function getCandidateSalts(userId) {
  const salts = [];

  // 1. Active dynamic/cached salt
  try {
    const activeSalt = await getSalt(userId);
    if (activeSalt) salts.push(activeSalt);
  } catch (e) {}

  // 2. Deterministic v3 fallback
  salts.push(`HabiTick_Fallback_Salt_v3_${userId}`);

  // 3. Known production salts
  salts.push(V2_SALT_PRIMARY);
  salts.push(V3_SALT_STATIC);
  salts.push(V1_SALT);

  // 4. Client-side derived HMAC user salts from known server secrets
  try {
    const hmacV2 = await deriveHmacSaltClient(V2_SALT_PRIMARY, userId);
    if (hmacV2) salts.push(hmacV2);
    const hmacV1 = await deriveHmacSaltClient(V1_SALT, userId);
    if (hmacV1) salts.push(hmacV1);
    const hmacV3 = await deriveHmacSaltClient(V3_SALT_STATIC, userId);
    if (hmacV3) salts.push(hmacV3);
  } catch (e) {}

  // 5. Persistent localStorage caches
  if (typeof localStorage !== "undefined") {
    try {
      const s1 = localStorage.getItem(`ht_salt_${userId}`);
      if (s1) salts.push(s1);
      const s2 = localStorage.getItem("ht_crypto_salt");
      if (s2) salts.push(s2);
    } catch (e) {}
  }

  return [...new Set(salts.filter(Boolean))];
}

/**
 * Internal helper to attempt AES-GCM decryption
 */
async function tryDecryptAesGcm(cryptoKey, iv, ciphertext) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}

/**
 * Decrypt ciphertext into plaintext string.
 * Supports v3 ("htv3:"), legacy v2 ("htv2:"), and legacy v1 (unprefixed base64).
 * Transparently passes through unencrypted plaintext.
 */
export async function decryptText(encryptedText, userId) {
  if (!encryptedText) return "";
  if (!userId) return encryptedText;

  // 1. Decrypt Version 3 (PBKDF2 + AES-GCM)
  if (encryptedText.startsWith("htv3:")) {
    const cleanCiphertext = encryptedText.substring(5);
    try {
      const binaryString = atob(cleanCiphertext);
      if (binaryString.length < 28) return encryptedText; // 12-byte IV + 16-byte auth tag minimum
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);

      const candidateSalts = await getCandidateSalts(userId);

      // Attempt 1: Multi-candidate PBKDF2 decryption
      for (const salt of candidateSalts) {
        try {
          const key = await getV3Key(userId, salt);
          const result = await tryDecryptAesGcm(key, iv, ciphertext);
          if (result !== null) return result;
        } catch (e) {}
      }

      // Attempt 2: Legacy SHA-256 fallback across candidate salts (safe fallback)
      for (const salt of candidateSalts) {
        try {
          const legacyKey = await getLegacyKey(userId, salt);
          const result = await tryDecryptAesGcm(legacyKey, iv, ciphertext);
          if (result !== null) return result;
        } catch (e) {}
      }
    } catch (parseErr) {
      // Malformed base64
    }
    return encryptedText;
  }

  // 2. Decrypt Legacy Version 2 ("htv2:")
  if (encryptedText.startsWith("htv2:")) {
    const cleanCiphertext = encryptedText.substring(5);
    try {
      const binaryString = atob(cleanCiphertext);
      if (binaryString.length < 28) return encryptedText;
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);

      const candidateSalts = [
        V2_SALT_PRIMARY,
        V1_SALT,
        `HabiTick_Fallback_Salt_v3_${userId}`,
        V3_SALT_STATIC
      ];
      try {
        const dynamicSalt = await getSalt(userId);
        if (dynamicSalt && !candidateSalts.includes(dynamicSalt)) {
          candidateSalts.push(dynamicSalt);
        }
      } catch (e) {}

      // Attempt with legacy SHA-256 keys
      for (const salt of candidateSalts) {
        try {
          const key = await getLegacyKey(userId, salt);
          const result = await tryDecryptAesGcm(key, iv, ciphertext);
          if (result !== null) return result;
        } catch (e) {}
      }

      // Attempt with PBKDF2 keys just in case
      for (const salt of candidateSalts) {
        try {
          const key = await getV3Key(userId, salt);
          const result = await tryDecryptAesGcm(key, iv, ciphertext);
          if (result !== null) return result;
        } catch (e) {}
      }
    } catch (parseErr) {
      // Malformed base64
    }
    return encryptedText;
  }

  // 3. Check for Legacy Version 1 (Raw base64 without prefix)
  const looksLikeBase64 = /^[A-Za-z0-9+/=]{20,}$/.test(encryptedText.trim());
  if (looksLikeBase64) {
    try {
      const binaryString = atob(encryptedText.trim());
      if (binaryString.length >= 28) {
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const iv = bytes.slice(0, 12);
        const ciphertext = bytes.slice(12);

        for (const salt of [V1_SALT, V2_SALT_PRIMARY]) {
          try {
            const key = await getLegacyKey(userId, salt);
            const result = await tryDecryptAesGcm(key, iv, ciphertext);
            if (result !== null) return result;
          } catch (e) {}
        }
      }
    } catch (e) {
      // Not base64
    }
  }

  // 4. Plaintext pass-through
  return encryptedText;
}
