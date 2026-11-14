import handler from "../api/get-salt.js";

// Mock environment variables
process.env.SUPABASE_URL = "https://mock-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "mock_service_role_key_12345";
process.env.CRYPTO_SALT = "HabiTick_Secure_Salt_V2_5e82f1b402cf8da7a66b5c00e1291c6e";

function createMockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
    json(data) {
      this.data = data;
      return this;
    }
  };
}

console.log("=== RUNNING GET-SALT SECURITY TESTS ===");

// 1. Test unauthenticated request (must reject with 401)
console.log("\n1. Testing unauthenticated request...");
const unauthReq = { method: "GET", headers: {} };
const unauthRes = createMockRes();
await handler(unauthReq, unauthRes);
console.log("Status Code:", unauthRes.statusCode);
console.log("Body:", unauthRes.data);
if (unauthRes.statusCode !== 401) {
  console.error("✗ Failure: Unauthenticated request was not rejected with 401!");
  process.exit(1);
}
console.log("✓ Success: Unauthenticated access blocked.");

// 2. Test disallowed method (e.g. DELETE)
console.log("\n2. Testing unsupported HTTP method...");
const deleteReq = { method: "DELETE", headers: {} };
const deleteRes = createMockRes();
await handler(deleteReq, deleteRes);
if (deleteRes.statusCode !== 405) {
  console.error("✗ Failure: Method not allowed check failed!");
  process.exit(1);
}
console.log("✓ Success: Invalid HTTP method rejected with 405.");

console.log("\nAll get-salt API security tests passed!");
