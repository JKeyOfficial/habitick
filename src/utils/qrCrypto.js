/**
 * End-to-End Encryption (E2EE) helper for QR Code authentication.
 * Uses native browser Web Crypto API (RSA-OAEP + AES-256-GCM).
 */

const getWebCrypto = () => {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
  throw new Error("Web Crypto API is not supported in this environment");
};

// ArrayBuffer <-> Base64 helpers
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const btoaFn = typeof window !== 'undefined' && window.btoa ? window.btoa : globalThis.btoa;
  return btoaFn(binary);
}

function base64ToArrayBuffer(base64) {
  const atobFn = typeof window !== 'undefined' && window.atob ? window.atob : globalThis.atob;
  const binaryString = atobFn(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate cryptographically secure random challenge nonce
 */
export function generateChallenge() {
  const cryptoObj = getWebCrypto();
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Computes a deterministic SHA-256 fingerprint for an RSA-OAEP public key
 * Used to verify the authenticity of the public key out-of-band via QR code
 */
export async function computeKeyFingerprint(publicKeyJwk) {
  if (!publicKeyJwk || !publicKeyJwk.n) return '';
  const cryptoObj = getWebCrypto();
  const canonical = `${publicKeyJwk.kty || 'RSA'}:${publicKeyJwk.n}:${publicKeyJwk.e || 'AQAB'}`;
  const enc = new TextEncoder();
  const digest = await cryptoObj.subtle.digest('SHA-256', enc.encode(canonical));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.substring(0, 16);
}

/**
 * Generate ephemeral RSA-OAEP key pair for receiving encrypted session payload
 */
export async function generateQrKeyPair() {
  const cryptoObj = getWebCrypto();
  const keyPair = await cryptoObj.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyJwk = await cryptoObj.subtle.exportKey("jwk", keyPair.publicKey);
  const fingerprint = await computeKeyFingerprint(publicKeyJwk);

  return {
    privateKey: keyPair.privateKey,
    publicKeyJwk,
    fingerprint,
  };
}

/**
 * Encrypt data payload using hybrid encryption (AES-256-GCM encrypted with RSA-OAEP public key)
 */
export async function encryptQrPayload(publicKeyJwk, data) {
  const cryptoObj = getWebCrypto();

  // 1. Import RSA public key
  const rsaPublicKey = await cryptoObj.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

  // 2. Generate random AES-256-GCM key & IV
  const aesKey = await cryptoObj.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));

  // 3. Encrypt payload with AES-GCM
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));
  const encryptedPayloadBuffer = await cryptoObj.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext
  );

  // 4. Export & encrypt AES key with RSA public key
  const rawAesKey = await cryptoObj.subtle.exportKey("raw", aesKey);
  const encryptedAesKeyBuffer = await cryptoObj.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    rawAesKey
  );

  // 5. Package as base64 JSON
  return {
    encryptedKey: arrayBufferToBase64(encryptedAesKeyBuffer),
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(encryptedPayloadBuffer),
  };
}

/**
 * Decrypt hybrid encrypted payload using RSA private key
 */
export async function decryptQrPayload(privateKey, encryptedPackage) {
  const cryptoObj = getWebCrypto();
  const { encryptedKey, iv, ciphertext } = encryptedPackage;

  // 1. Decrypt AES key using RSA private key
  const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedKey);
  const rawAesKey = await cryptoObj.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedAesKeyBuffer
  );

  // 2. Import AES key
  const aesKey = await cryptoObj.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // 3. Decrypt ciphertext using AES key & IV
  const ivBuffer = base64ToArrayBuffer(iv);
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
  const decryptedBuffer = await cryptoObj.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
    aesKey,
    ciphertextBuffer
  );

  // 4. Parse JSON result
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decryptedBuffer));
}

/**
 * Generate 6-digit display shortcode from session string for manual pairing
 */
export function deriveShortCode(sessionID) {
  if (!sessionID || typeof sessionID !== "string") return "000-000";
  let hash = 0;
  for (let i = 0; i < sessionID.length; i++) {
    hash = ((hash << 5) - hash) + sessionID.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);
  const codeNum = (positiveHash % 900000) + 100000;
  const str = codeNum.toString();
  return `${str.slice(0, 3)}-${str.slice(3)}`;
}
