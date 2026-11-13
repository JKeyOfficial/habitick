export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Prevent caching of the salt response
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const salt = process.env.CRYPTO_SALT || "HabiTick_Secure_Salt_V2_5e82f1b402cf8da7a66b5c00e1291c6e";
  return res.status(200).json({ salt });
}
