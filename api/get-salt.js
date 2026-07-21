export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Prevent caching of the dynamic salt response
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const salt = process.env.CRYPTO_SALT || "HabiTick_Frontend_Secure_Salt_2026";
  return res.status(200).json({ salt });
}
