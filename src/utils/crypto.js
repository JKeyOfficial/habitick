let cachedSalt = null;

async function getSalt() {
  if (cachedSalt) return cachedSalt;
  try {
    const res = await fetch("/api/get-salt");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.salt) {
      cachedSalt = data.salt;
      console.log("[HabiTick Crypto] Salt fetched dynamically.");
      return cachedSalt;
    }
    throw new Error("Invalid response format");
  } catch (e) {
    console.error("[HabiTick Crypto] Failed to fetch dynamic salt, using fallback:", e);
    return "HabiTick_Frontend_Secure_Salt_2026"; // Return fallback but do not cache it
  }
}

async function getKey(userId, version) {
  const enc = new TextEncoder();
  
  let salt;
  if (version === 2) {
    salt = await getSalt();
  } else {
    salt = "HabiTick_Frontend_Secure_Salt_2026"; // V1 Fallback
  }

  const keyData = enc.encode(userId + salt);
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
  console.log("[HabiTick Crypto] Starting encryption for user (Version 2):", userId);
  try {
    const key = await getKey(userId, 2);
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
    return "htv2:" + encrypted;
  } catch (e) {
    console.error("[HabiTick Crypto] Encryption failed:", e);
    return text;
  }
}

export async function decryptText(encryptedBase64, userId) {
  if (!encryptedBase64) return "";
  
  try {
    let cleanCiphertext = encryptedBase64;
    let version = 1;
    
    if (encryptedBase64.startsWith("htv2:")) {
      cleanCiphertext = encryptedBase64.substring(5);
      version = 2;
    }
    
    const key = await getKey(userId, version);
    const binaryString = atob(cleanCiphertext);
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
    console.log(`[HabiTick Crypto] Decrypted successfully (Version ${version}).`);
    return dec.decode(decrypted);
  } catch (e) {
    // If decryption fails, it's plaintext
    console.log("[HabiTick Crypto] Decryption failed (treating as plaintext):", e.message);
    return encryptedBase64;
  }
}
