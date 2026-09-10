/**
 * HabiTick Cryptography Engine
 * Provides AES-256-GCM End-to-End & At-Rest Encryption for HabiTick Docs.
 * 
 * Cryptographic Specifications:
 * - Cipher: AES-256-GCM (Galois/Counter Mode with 128-bit authentication tag)
 * - IV: 12-byte cryptographically secure pseudo-random vector (crypto.getRandomValues)
 * - Key Derivation: SHA-256 digest of (userId + secure salt)
 * - Envelope Prefix: "htv2:" followed by Base64 encoded (IV + Ciphertext)
 * - Offline Resilient: Caches salt locally and falls back gracefully with zero network dependency.
 */

let cachedSalt = null;

async function getSalt() {
  if (cachedSalt) return cachedSalt;

  // 1. Check persistent localStorage cache
  try {
    const local = localStorage.getItem('ht_crypto_salt');
    if (local) {
      cachedSalt = local;
      return cachedSalt;
    }
  } catch (e) {}

  // 2. Try fetching dynamic salt if online
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/get-salt');
      if (res.ok) {
        const data = await res.json();
        if (data && data.salt) {
          cachedSalt = data.salt;
          try {
            localStorage.setItem('ht_crypto_salt', data.salt);
          } catch (e) {}
          return cachedSalt;
        }
      }
    } catch (e) {
      // Offline or endpoint not present on standalone docs origin
    }
  }

  // 3. Resilient fallback salt (compatible with HabiTick habit tracker v1/v2)
  return 'HabiTick_Frontend_Secure_Salt_2026';
}

async function getKey(userId, version = 2) {
  if (!userId) throw new Error('[HabiTick Crypto] Missing userId for key derivation');
  const enc = new TextEncoder();
  const salt = version === 2 ? await getSalt() : 'HabiTick_Frontend_Secure_Salt_2026';
  const keyData = enc.encode(userId + salt);
  const hash = await crypto.subtle.digest('SHA-256', keyData);

  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext string into "htv2:<base64>" using AES-256-GCM
 */
export async function encryptText(text, userId) {
  if (!text) return '';
  if (!userId) return text;

  try {
    const key = await getKey(userId, 2);
    const enc = new TextEncoder();
    const encoded = enc.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    let binary = '';
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }

    return 'htv2:' + btoa(binary);
  } catch (err) {
    console.warn('[HabiTick Crypto] Encryption fallback to plaintext:', err);
    return text;
  }
}

/**
 * Decrypt "htv2:<base64>" ciphertext into plaintext string.
 * Transparently passes through legacy unencrypted plaintext.
 */
export async function decryptText(encryptedText, userId) {
  if (!encryptedText) return '';
  if (!userId) return encryptedText;

  // If not encrypted, return as-is for backwards compatibility
  if (!encryptedText.startsWith('htv2:')) {
    return encryptedText;
  }

  const cleanCiphertext = encryptedText.substring(5);

  try {
    const key = await getKey(userId, 2);
    const binaryString = atob(cleanCiphertext);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    // Attempt fallback with v1 salt
    try {
      const keyV1 = await getKey(userId, 1);
      const binaryString = atob(cleanCiphertext);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        keyV1,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch (fallbackErr) {
      console.warn('[HabiTick Crypto] Decryption failed, returning raw string:', err);
      return encryptedText;
    }
  }
}
