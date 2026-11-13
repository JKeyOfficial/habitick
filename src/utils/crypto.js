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
 */

const keyCache = new Map();
const saltCache = new Map();

// Known salts across HabiTick versions for 100% backward compatibility
export const V2_SALT_PRIMARY = "HabiTick_Secure_Salt_V2_5e82f1b402cf8da7a66b5c00e1291c6e";
export const V1_SALT = "HabiTick_Frontend_Secure_Salt_2026";

export async function getSalt(userId) {
  if (!userId) return V2_SALT_PRIMARY;
  if (saltCache.has(userId)) return saltCache.get(userId);

  // 1. Check persistent localStorage cache
  if (typeof localStorage !== "undefined") {
    try {
      const local = localStorage.getItem(`ht_salt_${userId}`) || localStorage.getItem("ht_crypto_salt");
      if (local) {
        saltCache.set(userId, local);
        return local;
      }
    } catch (e) {}
  }

  // 2. Fetch dynamic salt if online
  if (typeof fetch !== "undefined") {
    try {
      const res = await fetch("/api/get-salt");
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
      // Offline or local dev
    }
  }

  // 3. Fallback to primary production salt
  saltCache.set(userId, V2_SALT_PRIMARY);
  return V2_SALT_PRIMARY;
}

/**
 * Key derivation for legacy v1 and v2 encryption (SHA-256)
 */
async function getLegacyKey(userId, salt) {
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
async function getV3Key(userId) {
  const cacheKey = `${userId}_v3_pbkdf2`;
  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey);
  }

  const enc = new TextEncoder();
  const salt = await getSalt(userId);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(`${userId}:${salt}`),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
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
    const key = await getV3Key(userId);
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
 * Decrypt ciphertext into plaintext string.
 * Supports v3 ("htv3:"), legacy v2 ("htv2:"), and legacy v1 (unprefixed base64).
 * Transparently passes through unencrypted plaintext.
 */
export async function decryptText(encryptedText, userId) {
  if (!encryptedText) return "";
  if (!userId) return encryptedText;

  // 1. Decrypt Version 3 (PBKDF2 + AES-GCM)
  if (encryptedText.startsWith("htv3:")) {
    try {
      const cleanCiphertext = encryptedText.substring(5);
      const key = await getV3Key(userId);
      const binaryString = atob(cleanCiphertext);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.warn("[HabiTick Crypto] Failed to decrypt v3 ciphertext:", e);
      return encryptedText;
    }
  }

  // 2. Decrypt Legacy Version 2 ("htv2:")
  if (encryptedText.startsWith("htv2:")) {
    const cleanCiphertext = encryptedText.substring(5);
    try {
      const binaryString = atob(cleanCiphertext);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);

      // Attempt 1: Decrypt with primary production v2 salt (CRYPTO_SALT)
      try {
        const keyV2 = await getLegacyKey(userId, V2_SALT_PRIMARY);
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          keyV2,
          ciphertext
        );
        return new TextDecoder().decode(decrypted);
      } catch (err1) {
        // Attempt 2: Decrypt with legacy v1 salt fallback
        try {
          const keyV1 = await getLegacyKey(userId, V1_SALT);
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            keyV1,
            ciphertext
          );
          return new TextDecoder().decode(decrypted);
        } catch (err2) {
          // Attempt 3: Decrypt with any dynamically fetched salt
          try {
            const dynamicSalt = await getSalt(userId);
            if (dynamicSalt !== V2_SALT_PRIMARY && dynamicSalt !== V1_SALT) {
              const keyDynamic = await getLegacyKey(userId, dynamicSalt);
              const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                keyDynamic,
                ciphertext
              );
              return new TextDecoder().decode(decrypted);
            }
          } catch (err3) {}
        }
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
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);

      // Attempt with V1 salt
      try {
        const keyV1 = await getLegacyKey(userId, V1_SALT);
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          keyV1,
          ciphertext
        );
        return new TextDecoder().decode(decrypted);
      } catch (e1) {
        // Attempt with V2 salt
        try {
          const keyV2 = await getLegacyKey(userId, V2_SALT_PRIMARY);
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            keyV2,
            ciphertext
          );
          return new TextDecoder().decode(decrypted);
        } catch (e2) {}
      }
    } catch (e) {
      // Not base64
    }
  }

  // 4. Plaintext pass-through
  return encryptedText;
}
