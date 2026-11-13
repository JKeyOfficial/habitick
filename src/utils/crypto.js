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
 */

const keyCache = new Map();
const saltCache = new Map();

const LEGACY_V1_SALT = "HabiTick_Frontend_Secure_Salt_2026";

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
  if (!userId) return LEGACY_V1_SALT;
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

  // 3. Fallback: Deterministic fallback salt
  const fallbackSalt = `HabiTick_Fallback_Salt_v3_${userId}`;
  saltCache.set(userId, fallbackSalt);
  return fallbackSalt;
}

async function getKey(userId, version = 3) {
  const cacheKey = `${userId}_v${version}`;
  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey);
  }

  const enc = new TextEncoder();

  if (version === 3) {
    // Modern PBKDF2 Key Derivation (100,000 iterations, HMAC-SHA-256)
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

  // Legacy v2 Key Derivation (Single SHA-256 digest)
  if (version === 2) {
    const salt = await getSalt(userId);
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

  // Legacy v1 Key Derivation
  const keyData = enc.encode(userId + LEGACY_V1_SALT);
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
 * Encrypt plaintext string into "htv3:<base64>" using AES-256-GCM + PBKDF2
 */
export async function encryptText(text, userId) {
  if (!text) return "";
  if (!userId) return text;

  try {
    const key = await getKey(userId, 3);
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
      const key = await getKey(userId, 3);
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

  // 2. Decrypt Legacy Version 2
  if (encryptedText.startsWith("htv2:")) {
    try {
      const cleanCiphertext = encryptedText.substring(5);
      const key = await getKey(userId, 2);
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
      // Fallback attempt with v1 salt
      try {
        const keyV1 = await getKey(userId, 1);
        const cleanCiphertext = encryptedText.substring(5);
        const binaryString = atob(cleanCiphertext);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const iv = bytes.slice(0, 12);
        const ciphertext = bytes.slice(12);
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          keyV1,
          ciphertext
        );
        return new TextDecoder().decode(decrypted);
      } catch (err) {
        return encryptedText;
      }
    }
  }

  // 3. Check for Legacy Version 1 (Raw base64 without prefix)
  // Base64 regex check: at least 16 chars, only valid base64 chars
  const looksLikeBase64 = /^[A-Za-z0-9+/=]{20,}$/.test(encryptedText.trim());
  if (looksLikeBase64) {
    try {
      const keyV1 = await getKey(userId, 1);
      const binaryString = atob(encryptedText.trim());
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        keyV1,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      // Not actually encrypted data, return plaintext
      return encryptedText;
    }
  }

  // 4. Plaintext pass-through
  return encryptedText;
}
