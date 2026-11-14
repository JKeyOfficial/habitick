import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const serverSecret = process.env.CRYPTO_SECRET || process.env.CRYPTO_SALT || "HabiTick_Frontend_Secure_Salt_2026";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Prevent caching of dynamic security credentials
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  // 1. Authenticate caller via Supabase Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token empty" });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[get-salt] Missing Supabase configuration");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
    }

    // 2. Generate deterministic, high-entropy user-specific salt via HMAC-SHA256
    // Ensures every user has a cryptographically distinct salt that cannot be derived
    // from database dumps without the server secret.
    const userSalt = crypto
      .createHmac("sha256", serverSecret)
      .update(`user_salt_v3:${user.id}`)
      .digest("hex");

    return res.status(200).json({
      salt: userSalt,
      v: 3
    });
  } catch (err) {
    console.error("[get-salt] Error deriving user salt:", err);
    return res.status(500).json({ error: "Failed to derive security credentials" });
  }
}
