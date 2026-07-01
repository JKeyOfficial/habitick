const CRYPTO_SALT = "HabiTick_Frontend_Secure_Salt_2026"; // Frontend-only salt

async function getKey(userId) {
  const enc = new TextEncoder();
  const keyData = enc.encode(userId + CRYPTO_SALT);
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(text, userId) {
  if (!text) return "";
  console.log("[HabiTick Crypto] Starting encryption for user:", userId);
  try {
    const key = await getKey(userId);
    const enc = new TextEncoder();
    const encoded = enc.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoded
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    // Safely convert binary to base64
    let binary = "";
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const encrypted = btoa(binary);
    console.log("[HabiTick Crypto] Encryption successful.");
    return encrypted;
  } catch (e) {
    console.error("[HabiTick Crypto] Encryption failed:", e);
    return text;
  }
}

export async function decryptText(encryptedBase64, userId) {
  if (!encryptedBase64) return "";
  // Check if it looks like encrypted base64 (encrypted base64 will typically be raw binary encoded, not normal English sentences)
  // We can log decrypt attempt
  try {
    const key = await getKey(userId);
    const binaryString = atob(encryptedBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const dec = new TextDecoder();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    console.log("[HabiTick Crypto] Decrypted successfully.");
    return dec.decode(decrypted);
  } catch (e) {
    // If decryption fails, it's plaintext
    console.log("[HabiTick Crypto] Decryption failed (treating as plaintext):", e.message);
    return encryptedBase64;
  }
}
