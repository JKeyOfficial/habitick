import handler from "../api/get-salt.js";

// Mock req and res objects
const req = {
  method: "GET"
};

const headers = {};
const res = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  setHeader(name, value) {
    headers[name] = value;
  },
  json(data) {
    console.log("Status Code:", this.statusCode || 200);
    console.log("Headers:", headers);
    console.log("Response Body:", data);
  }
};

// Set environment variable mock
process.env.CRYPTO_SALT = "HabiTick_Secure_Salt_V2_5e82f1b402cf8da7a66b5c00e1291c6e";

console.log("Running get-salt API handler directly...");
await handler(req, res);
