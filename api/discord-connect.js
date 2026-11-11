import crypto from "node:crypto";
import {
  DISCORD_STATE_COOKIE,
  authenticateBearerUser,
  getAppUrl,
  getDiscordConfig,
  getDiscordRedirectUri,
  getSupabaseAdmin,
  signOAuthState,
} from "./_discord.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const { user, error: authError } = await authenticateBearerUser(req, supabaseAdmin);
  if (authError || !user) {
    return res.status(401).json({ error: authError || "Unauthorized" });
  }

  const config = getDiscordConfig();
  if (!config.clientId || !config.clientSecret || !config.stateSecret) {
    return res.status(503).json({ error: "Discord linking is not configured on this server yet." });
  }

  const appUrl = getAppUrl(req);
  const redirectUri = getDiscordRedirectUri(req);
  const nonce = crypto.randomBytes(16).toString("hex");
  const exp = Date.now() + 10 * 60 * 1000; // 10 minutes
  const state = signOAuthState({ uid: user.id, nonce, exp }, config.stateSecret);

  const isHttps = appUrl.startsWith("https://");
  res.setHeader(
    "Set-Cookie",
    `${DISCORD_STATE_COOKIE}=${encodeURIComponent(nonce)}; Path=/api/discord-callback; HttpOnly; SameSite=Lax; Max-Age=600${isHttps ? "; Secure" : ""}`
  );
  res.setHeader("Cache-Control", "no-store, max-age=0");

  // Minimal OAuth scope: 'identify' only (never requests email, servers, or join permissions)
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });

  return res.status(200).json({
    url: `https://discord.com/oauth2/authorize?${params.toString()}`,
  });
}

