import { createClient } from "@supabase/supabase-js";
import { syncDiscordRolesForProfile } from "./_discord.js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Authenticate the caller via Bearer JWT token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[delete-account] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // 2. Validate token against Supabase Auth to identify the true caller
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
  }

  const { userId } = req.body;

  // 3. Strict ownership check: Users can ONLY delete their own account
  if (!userId || user.id !== userId) {
    return res.status(403).json({ error: "Forbidden: You cannot delete another user's account" });
  }

  // Best-effort cleanup of Discord roles if profile still holds a linked discord_id
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, discord_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.discord_id) {
      await syncDiscordRolesForProfile({
        discordId: profile.discord_id,
        profile,
        unlink: true,
      });
    }
  } catch (err) {
    console.warn("[delete-account] Discord role cleanup warning:", err?.message || err);
  }

  // 4. Delete the authenticated user from Supabase Auth
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[delete-account] Failed to delete user:", deleteError);
    return res.status(500).json({ error: deleteError.message });
  }

  return res.status(200).json({ success: true });
}
