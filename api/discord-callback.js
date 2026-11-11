import {
  DISCORD_STATE_COOKIE,
  getAppUrl,
  getDiscordConfig,
  getDiscordRedirectUri,
  getSupabaseAdmin,
  parseCookies,
  redirect,
  syncDiscordRolesForProfile,
  timingSafeEqualStr,
  verifyOAuthState,
} from "./_discord.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";

function clearStateCookie(res, isHttps) {
  res.setHeader(
    "Set-Cookie",
    `${DISCORD_STATE_COOKIE}=; Path=/api/discord-callback; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isHttps ? "; Secure" : ""}`
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const appUrl = getAppUrl(req);
  const isHttps = appUrl.startsWith("https://");
  clearStateCookie(res, isHttps);

  const query = req.query || Object.fromEntries(new URL(req.url, appUrl).searchParams);
  const { code, state, error: oauthError } = query;

  if (oauthError) {
    const status = oauthError === "access_denied" ? "cancelled" : "error";
    return redirect(res, `${appUrl}/?discord=${status}`);
  }

  const config = getDiscordConfig();
  const supabaseAdmin = getSupabaseAdmin();
  if (!config.clientId || !config.clientSecret || !config.stateSecret || !supabaseAdmin) {
    return redirect(res, `${appUrl}/?discord=error`);
  }

  const verifiedState = verifyOAuthState(state, config.stateSecret);
  const cookies = parseCookies(req);
  const cookieNonce = cookies[DISCORD_STATE_COOKIE];

  if (!code || !verifiedState || !cookieNonce || !timingSafeEqualStr(cookieNonce, verifiedState.nonce)) {
    return redirect(res, `${appUrl}/?discord=invalid_state`);
  }

  const userId = verifiedState.uid;
  const redirectUri = getDiscordRedirectUri(req);

  try {
    // 1. Exchange authorization code for a short-lived token (never persisted)
    const tokenRes = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.warn(`[discord-callback] Token exchange failed with HTTP ${tokenRes.status}`);
      return redirect(res, `${appUrl}/?discord=error`);
    }

    const tokenData = await tokenRes.json();
    if (!tokenData?.access_token) {
      return redirect(res, `${appUrl}/?discord=error`);
    }

    // 2. Fetch minimal Discord identity only (id + username); token is discarded immediately
    const userRes = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.warn(`[discord-callback] /users/@me failed with HTTP ${userRes.status}`);
      return redirect(res, `${appUrl}/?discord=error`);
    }

    const discordUser = await userRes.json();
    const discordId = typeof discordUser?.id === "string" ? discordUser.id.trim() : "";
    const discordUsername = typeof discordUser?.username === "string"
      ? discordUser.username.trim()
      : (typeof discordUser?.global_name === "string" ? discordUser.global_name.trim() : "");

    if (!/^\d{15,25}$/.test(discordId)) {
      return redirect(res, `${appUrl}/?discord=error`);
    }

    // 3. Enforce 1-to-1 linking so one Discord account cannot be claimed by multiple HabiTick accounts
    const { data: existingOwner, error: lookupErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("discord_id", discordId)
      .neq("id", userId)
      .maybeSingle();

    if (lookupErr) {
      console.error("[discord-callback] Duplicate lookup error:", lookupErr.message);
      return redirect(res, `${appUrl}/?discord=error`);
    }

    if (existingOwner) {
      return redirect(res, `${appUrl}/?discord=already_linked`);
    }

    // 4. Persist minimal Discord fields on user's profile
    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          discord_id: discordId,
          discord_username: discordUsername || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, is_premium, is_lifetime, discord_id, discord_username")
      .single();

    if (updateErr) {
      if (updateErr.code === "23505") {
        return redirect(res, `${appUrl}/?discord=already_linked`);
      }
      console.error("[discord-callback] Profile update error:", updateErr.message);
      return redirect(res, `${appUrl}/?discord=error`);
    }

    // 5. Immediately assign/sync Discord roles based on HabiTick account status
    const syncResult = await syncDiscordRolesForProfile({
      discordId,
      profile: updatedProfile,
      supabaseAdmin,
    });

    const params = new URLSearchParams({ discord: "linked" });
    if (syncResult.inGuild === true) params.set("in_guild", "1");
    else if (syncResult.inGuild === false) params.set("in_guild", "0");

    return redirect(res, `${appUrl}/?${params.toString()}`);
  } catch (err) {
    console.error("[discord-callback] Unexpected error:", err?.message || err);
    return redirect(res, `${appUrl}/?discord=error`);
  }
}

