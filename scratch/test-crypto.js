import { encryptText, decryptText } from "../src/utils/crypto.js";

// Mock global fetch for Node.js environment to simulate the Vercel API
globalThis.fetch = async (url, options) => {
  if (url === "/api/get-salt") {
    return {
      ok: true,
      status: 200,
      json: async () => ({ salt: "HabiTick_Secure_Salt_V3_5e82f1b402cf8da7a66b5c00e1291c6e", v: 3 })
    };
  }
  throw new Error(`Unexpected fetch URL: ${url}`);
};

const mockUserId = "user-12345678-abcd-1234-abcd-1234567890ab";
const testPlaintext = "This is a super secret journal entry!";

console.log("=== CRYPTO TEST: PBKDF2 (V3) & Backward Compatibility ===");

// 1. Test Version 3 encryption (should prepend htv3:)
console.log("\n1. Testing encryption (V3 - PBKDF2)...");
const encryptedV3 = await encryptText(testPlaintext, mockUserId);
console.log("Encrypted V3 string:", encryptedV3);
if (encryptedV3.startsWith("htv3:")) {
  console.log("✓ Success: Output starts with 'htv3:' prefix.");
} else {
  console.error("✗ Failure: Output does not start with 'htv3:' prefix.");
  process.exit(1);
}

// 2. Test Version 3 decryption
console.log("\n2. Testing decryption (V3)...");
const decryptedV3 = await decryptText(encryptedV3, mockUserId);
console.log("Decrypted V3 string:", decryptedV3);
if (decryptedV3 === testPlaintext) {
  console.log("✓ Success: Decrypted plaintext matches original plaintext.");
} else {
  console.error("✗ Failure: Decrypted plaintext does not match.");
  process.exit(1);
}

// 3. Test Version 2 decryption (Backward Compatibility with htv2:)
console.log("\n3. Testing backward compatibility (V2 decryption)...");
async function encryptV2Raw(text, userId) {
  const salt = "HabiTick_Secure_Salt_V3_5e82f1b402cf8da7a66b5c00e1291c6e";
  const enc = new TextEncoder();
  const keyData = enc.encode(userId + salt);
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  const key = await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt"]);
  const encoded = enc.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) binary += String.fromCharCode(combined[i]);
  return "htv2:" + btoa(binary);
}

const encryptedV2 = await encryptV2Raw(testPlaintext, mockUserId);
const decryptedV2 = await decryptText(encryptedV2, mockUserId);
if (decryptedV2 === testPlaintext) {
  console.log("✓ Success: Decrypted legacy V2 (htv2:) data successfully!");
} else {
  console.error("✗ Failure: Failed to decrypt legacy V2 data.");
  process.exit(1);
}

// 4. Test Version 1 decryption (Backward Compatibility with unprefixed base64)
console.log("\n4. Testing backward compatibility (V1 decryption)...");
async function encryptV1Raw(text, userId) {
  const oldSalt = "HabiTick_Frontend_Secure_Salt_2026";
  const enc = new TextEncoder();
  const keyData = enc.encode(userId + oldSalt);
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  const key = await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt"]);
  const encoded = enc.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

const encryptedV1 = await encryptV1Raw(testPlaintext, mockUserId);
const decryptedV1 = await decryptText(encryptedV1, mockUserId);
if (decryptedV1 === testPlaintext) {
  console.log("✓ Success: Decrypted legacy V1 data successfully!");
} else {
  console.error("✗ Failure: Failed to decrypt legacy V1 data.");
  process.exit(1);
}

// 5. Test Plaintext pass-through
console.log("\n5. Testing plaintext pass-through...");
const plain = "Hello world!";
const decryptedPlain = await decryptText(plain, mockUserId);
if (decryptedPlain === plain) {
  console.log("✓ Success: Plaintext pass-through working correctly!");
} else {
  console.error("✗ Failure: Plaintext corrupted.");
  process.exit(1);
}

console.log("\nAll crypto tests passed successfully with full PBKDF2 standard security and backward compatibility!");
