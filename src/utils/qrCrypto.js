/**
 * End-to-End Encryption (E2EE) helper for QR Code authentication.
 * Uses native browser Web Crypto API (RSA-OAEP + AES-256-GCM).
 */

// ArrayBuffer <-> Base64 helpers
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate ephemeral RSA-OAEP key pair for receiving encrypted session payload
 */
export async function generateQrKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    privateKey: keyPair.privateKey,
    publicKeyJwk,
  };
}

/**
 * Encrypt data payload using hybrid encryption (AES-256-GCM encrypted with RSA-OAEP public key)
 */
export async function encryptQrPayload(publicKeyJwk, data) {
  // 1. Import RSA public key
  const rsaPublicKey = await window.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

  // 2. Generate random AES-256-GCM key & IV
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // 3. Encrypt payload with AES-GCM
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));
  const encryptedPayloadBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext
  );

  // 4. Export & encrypt AES key with RSA public key
  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedAesKeyBuffer = await window.crypto.subtle.encrypt(
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
  const { encryptedKey, iv, ciphertext } = encryptedPackage;

  // 1. Decrypt AES key using RSA private key
  const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedKey);
  const rawAesKey = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedAesKeyBuffer
  );

  // 2. Import AES key
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // 3. Decrypt ciphertext using AES key & IV
  const ivBuffer = base64ToArrayBuffer(iv);
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
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
