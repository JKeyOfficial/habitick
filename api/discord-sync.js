import {
  authenticateBearerUser,
  getDiscordConfig,
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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, discord_id, discord_username, is_premium, is_lifetime")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({ error: "Could not load account profile" });
  }

  const config = getDiscordConfig();

  if (!profile?.discord_id) {
    return res.status(200).json({
      linked: false,
      discordUsername: null,
      inGuild: null,
      synced: false,
      botConfigured: Boolean(config.botToken && config.guildId),
      inviteUrl: config.inviteUrl || null,
    });
  }

  const result = await syncDiscordRolesForProfile({
    discordId: profile.discord_id,
    profile,
    supabaseAdmin,
  });

  return res.status(200).json({
    linked: true,
    discordUsername: result.discordUsername || profile.discord_username,
    inGuild: result.inGuild,
    synced: result.synced,
    botConfigured: result.configured,
    added: result.added,
    removed: result.removed,
    activeLabels: result.activeLabels,
    inviteUrl: result.inviteUrl || null,
    reason: result.reason || null,
  });
}

