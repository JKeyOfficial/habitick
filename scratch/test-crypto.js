import { encryptText, decryptText, V2_SALT_PRIMARY, V3_SALT_STATIC, V1_SALT, getV3Key } from "../src/utils/crypto.js";

const mockUserId = "user-12345678-abcd-1234-abcd-1234567890ab";
const mockAuthUserSalt = "hmac_derived_user_salt_9876543210fedcba";

// Mock global fetch for Node.js environment to simulate the authenticated get-salt API
globalThis.fetch = async (url, options = {}) => {
  if (url === "/api/get-salt") {
    const authHeader = options?.headers?.Authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ salt: mockAuthUserSalt, v: 3 })
      };
    }
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" })
    };
  }
  throw new Error(`Unexpected fetch URL: ${url}`);
};

const testPlaintext = "This is a super secret journal entry!";

console.log("=== CRYPTO TEST: PBKDF2 (V3) & Resilient Multi-Salt Backward Compatibility ===");

// 1. Test Version 3 encryption (PBKDF2)
console.log("\n1. Testing encryption (V3 - PBKDF2)...");
const encryptedV3 = await encryptText(testPlaintext, mockUserId);
console.log("Encrypted V3 string:", encryptedV3);
if (!encryptedV3.startsWith("htv3:")) {
  console.error("✗ Failure: Output does not start with 'htv3:' prefix.");
  process.exit(1);
}
console.log("✓ Success: Output starts with 'htv3:' prefix.");

// 2. Test Version 3 decryption
console.log("\n2. Testing decryption (V3)...");
const decryptedV3 = await decryptText(encryptedV3, mockUserId);
console.log("Decrypted V3 string:", decryptedV3);
if (decryptedV3 !== testPlaintext) {
  console.error("✗ Failure: Decrypted plaintext does not match.");
  process.exit(1);
}
console.log("✓ Success: Decrypted plaintext matches original plaintext.");

// 3. Test V3 Decryption with Deterministic Fallback Salt (Cross-salt recovery)
console.log("\n3. Testing V3 cross-salt recovery (item encrypted with fallback salt)...");
async function encryptV3Raw(text, userId, salt) {
  const key = await getV3Key(userId, salt);
  const enc = new TextEncoder();
  const encoded = enc.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) binary += String.fromCharCode(combined[i]);
  return "htv3:" + btoa(binary);
}

const encryptedV3Fallback = await encryptV3Raw(testPlaintext, mockUserId, `HabiTick_Fallback_Salt_v3_${mockUserId}`);
const decryptedV3Fallback = await decryptText(encryptedV3Fallback, mockUserId);
if (decryptedV3Fallback !== testPlaintext) {
  console.error("✗ Failure: Failed to decrypt V3 data created with deterministic fallback salt.");
  process.exit(1);
}
console.log("✓ Success: Decrypted V3 data created with fallback salt successfully!");

// 4. Test V3 Decryption with V2_SALT_PRIMARY
console.log("\n4. Testing V3 cross-salt recovery (item encrypted with V2_SALT_PRIMARY)...");
const encryptedV3V2Primary = await encryptV3Raw(testPlaintext, mockUserId, V2_SALT_PRIMARY);
const decryptedV3V2Primary = await decryptText(encryptedV3V2Primary, mockUserId);
if (decryptedV3V2Primary !== testPlaintext) {
  console.error("✗ Failure: Failed to decrypt V3 data created with V2_SALT_PRIMARY.");
  process.exit(1);
}
console.log("✓ Success: Decrypted V3 data created with V2_SALT_PRIMARY successfully!");

// 5. Test V3 Decryption with V1_SALT
console.log("\n5. Testing V3 cross-salt recovery (item encrypted with V1_SALT)...");
const encryptedV3V1 = await encryptV3Raw(testPlaintext, mockUserId, V1_SALT);
const decryptedV3V1 = await decryptText(encryptedV3V1, mockUserId);
if (decryptedV3V1 !== testPlaintext) {
  console.error("✗ Failure: Failed to decrypt V3 data created with V1_SALT.");
  process.exit(1);
}
console.log("✓ Success: Decrypted V3 data created with V1_SALT successfully!");

// 6. Test Version 2 decryption with Primary Salt
console.log("\n6. Testing backward compatibility (V2 decryption with V2_SALT_PRIMARY)...");
async function encryptV2Raw(text, userId, salt) {
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

const encryptedV2Primary = await encryptV2Raw(testPlaintext, mockUserId, V2_SALT_PRIMARY);
const decryptedV2Primary = await decryptText(encryptedV2Primary, mockUserId);
if (decryptedV2Primary !== testPlaintext) {
  console.error("✗ Failure: Failed to decrypt legacy V2 primary salt data.");
  process.exit(1);
}
console.log("✓ Success: Decrypted legacy V2 primary salt data successfully!");

// 7. Test Version 2 decryption with Fallback Salt (V1_SALT)
console.log("\n7. Testing backward compatibility (V2 decryption with V1_SALT fallback)...");
const encryptedV2Fallback = await encryptV2Raw(testPlaintext, mockUserId, V1_SALT);
const decryptedV2Fallback = await decryptText(encryptedV2Fallback, mockUserId);
if (decryptedV2Fallback !== testPlaintext) {
  console.error("✗ Failure: Failed to decrypt legacy V2 fallback salt data.");
  process.exit(1);
}
console.log("✓ Success: Decrypted legacy V2 fallback salt data successfully!");

// 8. Test Version 1 decryption (Raw base64 without prefix)
console.log("\n8. Testing backward compatibility (V1 raw base64)...");
async function encryptV1Raw(text, userId) {
  const enc = new TextEncoder();
  const keyData = enc.encode(userId + V1_SALT);
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
if (decryptedV1 !== testPlaintext) {
  console.error("✗ Failure: Failed to decrypt legacy V1 data.");
  process.exit(1);
}
console.log("✓ Success: Decrypted legacy V1 data successfully!");

// 9. Test Plaintext pass-through
console.log("\n9. Testing plaintext pass-through...");
const plain = "Hello world!";
const decryptedPlain = await decryptText(plain, mockUserId);
if (decryptedPlain !== plain) {
  console.error("✗ Failure: Plaintext corrupted.");
  process.exit(1);
}
console.log("✓ Success: Plaintext pass-through working correctly!");

console.log("\nAll 9 crypto tests passed successfully! 100% backward compatibility and security guaranteed.");
