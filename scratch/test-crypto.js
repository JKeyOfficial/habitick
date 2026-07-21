import { encryptText, decryptText } from "../src/utils/crypto.js";

// Mock global fetch for Node.js environment to simulate the Vercel API
globalThis.fetch = async (url) => {
  if (url === "/api/get-salt") {
    return {
      ok: true,
      status: 200,
      json: async () => ({ salt: "HabiTick_Secure_Salt_V2_5e82f1b402cf8da7a66b5c00e1291c6e" })
    };
  }
  throw new Error(`Unexpected fetch URL: ${url}`);
};

const mockUserId = "user-12345678-abcd-1234-abcd-1234567890ab";
const testPlaintext = "This is a super secret journal entry!";

console.log("=== CRYPTO TEST: Dynamic Salt & Migration ===");

// 1. Test Version 2 encryption (should prepend htv2:)
console.log("\n1. Testing encryption (V2)...");
const encryptedV2 = await encryptText(testPlaintext, mockUserId);
console.log("Encrypted V2 string:", encryptedV2);
if (encryptedV2.startsWith("htv2:")) {
  console.log("✓ Success: Output starts with 'htv2:' prefix.");
} else {
  console.error("✗ Failure: Output does not start with 'htv2:' prefix.");
  process.exit(1);
}

// 2. Test Version 2 decryption
console.log("\n2. Testing decryption (V2)...");
const decryptedV2 = await decryptText(encryptedV2, mockUserId);
console.log("Decrypted V2 string:", decryptedV2);
if (decryptedV2 === testPlaintext) {
  console.log("✓ Success: Decrypted plaintext matches original plaintext.");
} else {
  console.error("✗ Failure: Decrypted plaintext does not match.");
  process.exit(1);
}

// 3. Test Version 1 decryption (Backwards Compatibility)
// We will encrypt using the old hardcoded salt algorithm (V1)
console.log("\n3. Testing backward compatibility (V1 decryption)...");

// Re-implement raw V1 encryption for testing purposes:
async function encryptV1Raw(text, userId) {
  const oldSalt = "HabiTick_Frontend_Secure_Salt_2026";
  const enc = new TextEncoder();
  const keyData = enc.encode(userId + oldSalt);
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  const key = await crypto.subtle.importKey(
    "raw", hash, { name: "AES-GCM" }, false, ["encrypt"]
  );
  
  const encoded = enc.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv }, key, encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

const encryptedV1 = await encryptV1Raw(testPlaintext, mockUserId);
console.log("Encrypted V1 string (without prefix):", encryptedV1);

// Decrypt using our updated module's decryptText (should automatically detect no prefix and use V1 salt)
const decryptedV1 = await decryptText(encryptedV1, mockUserId);
console.log("Decrypted V1 string via updated module:", decryptedV1);
if (decryptedV1 === testPlaintext) {
  console.log("✓ Success: Backwards compatibility working! Old encrypted data decrypted successfully.");
} else {
  console.error("✗ Failure: Failed to decrypt old data.");
  process.exit(1);
}

console.log("\nAll crypto tests passed successfully!");
