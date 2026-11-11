import {
  authenticateBearerUser,
  getSupabaseAdmin,
  syncDiscordRolesForProfile,
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

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, discord_id, discord_username")
    .eq("id", user.id)
    .maybeSingle();

  // Best-effort remove HabiTick-managed roles in Discord before clearing DB fields
  if (profile?.discord_id) {
    try {
      await syncDiscordRolesForProfile({
        discordId: profile.discord_id,
        profile,
        unlink: true,
      });
    } catch (err) {
      console.warn("[discord-unlink] Role cleanup warning:", err?.message || err);
    }
  }

  const { error: clearErr } = await supabaseAdmin
    .from("profiles")
    .update({
      discord_id: null,
      discord_username: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (clearErr) {
    return res.status(500).json({ error: "Failed to unlink Discord account" });
  }

  return res.status(200).json({ success: true });
}

