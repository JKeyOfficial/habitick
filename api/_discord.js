/* global process, Buffer */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DISCORD_API_BASE = "https://discord.com/api/v10";
export const DISCORD_STATE_COOKIE = "ht_discord_state";

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export function getDiscordConfig() {
  return {
    clientId: (process.env.DISCORD_CLIENT_ID || "").trim(),
    clientSecret: (process.env.DISCORD_CLIENT_SECRET || "").trim(),
    stateSecret: (process.env.DISCORD_STATE_SECRET || process.env.DISCORD_CLIENT_SECRET || "").trim(),
    botToken: (process.env.DISCORD_BOT_TOKEN || "").trim(),
    guildId: (process.env.DISCORD_GUILD_ID || "").trim(),
    inviteUrl: (process.env.DISCORD_INVITE_URL || process.env.VITE_DISCORD_INVITE_URL || "").trim(),
    roles: {
      member: (process.env.DISCORD_ROLE_MEMBER_ID || "").trim(),
      premium: (process.env.DISCORD_ROLE_PREMIUM_ID || "").trim(),
      founder: (process.env.DISCORD_ROLE_FOUNDER_ID || "").trim(),
    },
  };
}

export function getAppUrl(req) {
  const rawHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawHost)) {
    return `http://${rawHost}`;
  }

  const configured = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }

  if (/^([a-z0-9-]+\.)*habitick\.app$/i.test(rawHost) || /^[a-z0-9-]+\.vercel\.app$/i.test(rawHost)) {
    return `https://${rawHost}`;
  }

  return "https://app.habitick.app";
}

export function getDiscordRedirectUri(req) {
  const explicit = (process.env.DISCORD_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  return `${getAppUrl(req)}/api/discord-callback`;
}

export async function authenticateBearerUser(req, supabaseAdmin) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null, error: "Unauthorized: Missing authentication token" };
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    console.error("[discord-auth] Supabase getUser error:", error?.message || error);
    return { user: null, error: `Unauthorized: ${error?.message || "Invalid or expired session"}` };
  }
  return { user, error: null };
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signOAuthState(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(stateStr, secret) {
  if (typeof stateStr !== "string" || !secret) return null;
  const parts = stateStr.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!timingSafeEqualStr(sig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.uid !== "string" || typeof parsed.nonce !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.end();
}

export function computeRolePlan(profile, rolesConfig, unlink = false) {
  const managedRoleIds = new Set(
    [rolesConfig.member, rolesConfig.premium, rolesConfig.founder].filter(Boolean)
  );
  const desiredRoleIds = new Set();
  const activeLabels = [];

  if (!unlink && profile) {
    const isPremium = profile.is_premium === true || profile.is_lifetime === true;
    const isFounder = profile.is_lifetime === true;

    if (rolesConfig.member) {
      desiredRoleIds.add(rolesConfig.member);
      activeLabels.push("Member");
    }
    if (isPremium && rolesConfig.premium) {
      desiredRoleIds.add(rolesConfig.premium);
      activeLabels.push("Premium");
    }
    if (isFounder && rolesConfig.founder) {
      desiredRoleIds.add(rolesConfig.founder);
      activeLabels.push("Founder");
    }
  }

  return { managedRoleIds, desiredRoleIds, activeLabels };
}

export async function syncDiscordRolesForProfile({ discordId, profile, unlink = false, supabaseAdmin = null }) {
  const config = getDiscordConfig();

  if (!discordId) {
    return {
      synced: false,
      configured: Boolean(config.botToken && config.guildId),
      inGuild: false,
      added: [],
      removed: [],
      failed: [],
      activeLabels: [],
      inviteUrl: config.inviteUrl || null,
      reason: "not_linked",
    };
  }

  if (!config.botToken || !config.guildId) {
    return {
      synced: false,
      configured: false,
      inGuild: null,
      added: [],
      removed: [],
      failed: [],
      activeLabels: [],
      inviteUrl: config.inviteUrl || null,
      reason: "bot_not_configured",
    };
  }

  const botHeaders = {
    Authorization: `Bot ${config.botToken}`,
    "X-Audit-Log-Reason": "HabiTick automatic role sync",
  };

  let memberRes;
  try {
    memberRes = await fetch(
      `${DISCORD_API_BASE}/guilds/${encodeURIComponent(config.guildId)}/members/${encodeURIComponent(discordId)}`,
      { headers: { Authorization: `Bot ${config.botToken}` } }
    );
  } catch (err) {
    console.warn("[discord] Failed to reach Discord API:", err?.message || err);
    return {
      synced: false,
      configured: true,
      inGuild: null,
      added: [],
      removed: [],
      failed: [],
      activeLabels: [],
      inviteUrl: config.inviteUrl || null,
      reason: "network_error",
    };
  }

  if (memberRes.status === 404) {
    return {
      synced: false,
      configured: true,
      inGuild: false,
      added: [],
      removed: [],
      failed: [],
      activeLabels: [],
      inviteUrl: config.inviteUrl || null,
      reason: "not_in_guild",
    };
  }

  if (!memberRes.ok) {
    console.warn(`[discord] Guild member lookup returned HTTP ${memberRes.status}`);
    return {
      synced: false,
      configured: true,
      inGuild: null,
      added: [],
      removed: [],
      failed: [],
      activeLabels: [],
      inviteUrl: config.inviteUrl || null,
      reason: `discord_http_${memberRes.status}`,
    };
  }

  const member = await memberRes.json();
  const latestUsername = member?.user?.username || profile?.discord_username || null;

  // Keep minimal username handle fresh on sync without storing any OAuth tokens
  if (
    supabaseAdmin &&
    !unlink &&
    profile?.id &&
    latestUsername &&
    latestUsername !== profile.discord_username
  ) {
    try {
      await supabaseAdmin
        .from("profiles")
        .update({ discord_username: latestUsername, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
    } catch {
      // Non-fatal
    }
  }

  const { managedRoleIds, desiredRoleIds, activeLabels } = computeRolePlan(profile, config.roles, unlink);
  const currentRoles = new Set(Array.isArray(member.roles) ? member.roles : []);

  const toAdd = [...desiredRoleIds].filter((id) => !currentRoles.has(id));
  const toRemove = [...managedRoleIds].filter((id) => !desiredRoleIds.has(id) && currentRoles.has(id));

  const added = [];
  const removed = [];
  const failed = [];

  for (const roleId of toAdd) {
    try {
      const r = await fetch(
        `${DISCORD_API_BASE}/guilds/${encodeURIComponent(config.guildId)}/members/${encodeURIComponent(discordId)}/roles/${encodeURIComponent(roleId)}`,
        { method: "PUT", headers: botHeaders }
      );
      if (r.ok) {
        added.push(roleId);
      } else {
        console.warn(`[discord] Failed to add role ${roleId}: HTTP ${r.status}`);
        failed.push(roleId);
      }
    } catch {
      failed.push(roleId);
    }
  }

  for (const roleId of toRemove) {
    try {
      const r = await fetch(
        `${DISCORD_API_BASE}/guilds/${encodeURIComponent(config.guildId)}/members/${encodeURIComponent(discordId)}/roles/${encodeURIComponent(roleId)}`,
        { method: "DELETE", headers: botHeaders }
      );
      if (r.ok || r.status === 404) {
        removed.push(roleId);
      } else {
        console.warn(`[discord] Failed to remove role ${roleId}: HTTP ${r.status}`);
        failed.push(roleId);
      }
    } catch {
      failed.push(roleId);
    }
  }

  return {
    synced: failed.length === 0,
    configured: true,
    inGuild: true,
    added,
    removed,
    failed,
    activeLabels,
    discordUsername: latestUsername,
    inviteUrl: config.inviteUrl || null,
  };
}

export async function syncDiscordRolesByUserId(supabaseAdmin, userId) {
  if (!supabaseAdmin || !userId) return { synced: false, reason: "invalid_args" };

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, discord_id, discord_username, is_premium, is_lifetime")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile?.discord_id) {
    return { synced: false, reason: "not_linked" };
  }

  return syncDiscordRolesForProfile({
    discordId: profile.discord_id,
    profile,
    supabaseAdmin,
  });
}

