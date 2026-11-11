import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

function getInitialCallbackNotice(callbackInfo) {
  if (!callbackInfo) return null;
  if (callbackInfo.status === "linked" && callbackInfo.inGuild === false) {
    return {
      type: "info",
      text: "Discord linked. Join the Discord server and tap Sync Roles to receive your roles.",
    };
  }
  if (callbackInfo.status === "already_linked") {
    return {
      type: "error",
      text: "That Discord account is already linked to another HabiTick account.",
    };
  }
  if (callbackInfo.status === "invalid_state" || callbackInfo.status === "error") {
    return {
      type: "error",
      text: "Could not complete Discord linking. Please try again.",
    };
  }
  return null;
}

function DiscordGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function DiscordLinkCard({
  session,
  profile,
  isPremium,
  isLifetime,
  onUpdate,
  showToast,
  discordCallbackInfo,
  onClearDiscordCallback,
}) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [inGuild, setInGuild] = useState(() => discordCallbackInfo?.inGuild ?? null);
  const [inviteUrl, setInviteUrl] = useState(import.meta.env.VITE_DISCORD_INVITE_URL || null);
  const [notice, setNotice] = useState(() => getInitialCallbackNotice(discordCallbackInfo));
  const [finishingLink, setFinishingLink] = useState(
    () => discordCallbackInfo?.status === "linked" && !profile?.discord_id
  );
  const handledCallbackRef = useRef(false);

  const isLinked = Boolean(profile?.discord_id);
  const isWaitingForLinkHydration = finishingLink && !isLinked;

  // Process OAuth return side effects (toast + profile refresh + clearing transient callback state)
  useEffect(() => {
    if (!discordCallbackInfo || handledCallbackRef.current) return;
    handledCallbackRef.current = true;

    const { status, inGuild: callbackInGuild } = discordCallbackInfo;

    if (status === "linked") {
      if (callbackInGuild === false) {
        showToast?.("Discord linked — join server to receive roles");
      } else {
        showToast?.("Discord linked & roles synced!");
      }

      // Refresh minimal Discord columns immediately in case offline cache rendered first
      if (session?.user?.id) {
        (async () => {
          try {
            const { data } = await supabase
              .from("profiles")
              .select("discord_id, discord_username")
              .eq("id", session.user.id)
              .single();
            if (data) {
              onUpdate?.((prev) => (prev ? { ...prev, ...data } : prev));
            }
          } catch {
            // Non-fatal: loadAll() will also refresh profile
          } finally {
            setFinishingLink(false);
          }
        })();
      }
    } else if (status === "already_linked") {
      showToast?.("That Discord account is already linked to another HabiTick account.", "error");
    } else if (status === "cancelled") {
      showToast?.("Discord linking cancelled", "error");
    } else if (status === "invalid_state" || status === "error") {
      showToast?.("Could not complete Discord linking. Please try again.", "error");
    }

    onClearDiscordCallback?.();
  }, [discordCallbackInfo, onClearDiscordCallback, onUpdate, session?.user?.id, showToast]);

  const getAccessToken = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || session?.access_token || "";
    } catch {
      return session?.access_token || "";
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/discord-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        throw new Error("Discord OAuth requires Vercel API routes (use `npx vercel dev` locally).");
      }
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Could not start Discord linking.");
      }
      window.location.href = data.url;
    } catch (err) {
      const msg = err?.message || "Could not start Discord linking.";
      setNotice({ type: "error", text: msg });
      showToast?.(msg, "error");
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/discord-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to sync Discord roles.");
      }
      if (data.inviteUrl) setInviteUrl(data.inviteUrl);

      if (!data.linked) {
        onUpdate?.((prev) => (prev ? { ...prev, discord_id: null, discord_username: null } : prev));
        setInGuild(null);
        showToast?.("Discord account is not linked.", "error");
        return;
      }

      if (data.discordUsername) {
        onUpdate?.((prev) => (prev ? { ...prev, discord_username: data.discordUsername } : prev));
      }

      setInGuild(data.inGuild ?? null);

      if (data.inGuild === false) {
        setNotice({
          type: "info",
          text: "You're not in the Discord server yet. Join the server, then tap Sync Roles.",
        });
        showToast?.("Join the Discord server first", "error");
      } else if (data.botConfigured === false) {
        showToast?.("Linked! Role sync bot is not configured yet.");
      } else if (data.synced) {
        showToast?.("Discord roles synced!");
      } else {
        setNotice({
          type: "error",
          text: "Could not update all roles. Check that the HabiTick bot role is positioned above target roles.",
        });
        showToast?.("Role sync partially failed", "error");
      }
    } catch (err) {
      const msg = err?.message || "Failed to sync Discord roles.";
      setNotice({ type: "error", text: msg });
      showToast?.(msg, "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    setNotice(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/discord-unlink", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to unlink Discord.");
      }
      onUpdate?.((prev) => (prev ? { ...prev, discord_id: null, discord_username: null } : prev));
      setConfirmUnlink(false);
      setInGuild(null);
      showToast?.("Discord unlinked");
    } catch (err) {
      const msg = err?.message || "Failed to unlink Discord.";
      setNotice({ type: "error", text: msg });
      showToast?.(msg, "error");
    } finally {
      setUnlinking(false);
    }
  };

  // Account-derived role badges (minimal, clear, non-promotional)
  const accountRoles = [
    { label: "Member", bg: "rgba(88, 101, 242, 0.12)", border: "rgba(88, 101, 242, 0.28)", color: "#818cf8" },
    ...(isPremium
      ? [{ label: "Premium", bg: "rgba(37, 99, 235, 0.12)", border: "rgba(59, 130, 246, 0.3)", color: "#60a5fa" }]
      : []),
    ...(isLifetime
      ? [{ label: "Founder", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.3)", color: "#10b981" }]
      : []),
  ];

  return (
    <div className="pm-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        {/* Left: Brand Icon + Description */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", flex: 1, minWidth: "min(240px, 100%)" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "11px",
              background: "rgba(88, 101, 242, 0.12)",
              border: "1px solid rgba(88, 101, 242, 0.25)",
              color: "#5865F2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: "1px",
            }}
          >
            <DiscordGlyph size={20} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <span style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--ht-text-primary)" }}>
                Discord Roles
              </span>
              {isLinked ? (
                <span
                  style={{
                    fontSize: "10.5px",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.28)",
                    color: "#10b981",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                  Connected
                </span>
              ) : (
                <span
                  style={{
                    fontSize: "10.5px",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: "var(--ht-bg-card)",
                    border: "1px solid var(--ht-border-card)",
                    color: "var(--ht-text-muted)",
                    fontWeight: 600,
                  }}
                >
                  Optional
                </span>
              )}
            </div>

            {isLinked ? (
              <div>
                <div style={{ fontSize: "13px", color: "var(--ht-text-secondary)", marginBottom: "8px" }}>
                  Linked as{" "}
                  <strong style={{ color: "var(--ht-text-primary)", fontWeight: 700 }}>
                    {profile?.discord_username ? `@${profile.discord_username}` : "Discord user"}
                  </strong>
                </div>

                {/* Synced Role Pills */}
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: "var(--ht-text-muted)", fontWeight: 600, marginRight: "2px" }}>
                    Auto roles:
                  </span>
                  {accountRoles.map((r) => (
                    <span
                      key={r.label}
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: r.bg,
                        border: `1px solid ${r.border}`,
                        color: r.color,
                      }}
                    >
                      {r.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "12.5px", color: "var(--ht-text-secondary)", lineHeight: 1.45, margin: "0 0 6px" }}>
                  Link your Discord account to automatically receive roles matching your HabiTick membership.
                </p>
                <div style={{ fontSize: "11.5px", color: "var(--ht-text-muted)" }}>
                  Minimal data only — stores only your Discord ID &amp; username.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flexShrink: 0 }}>
          {!isLinked ? (
            <button
              onClick={handleConnect}
              disabled={connecting || isWaitingForLinkHydration}
              style={{
                height: "40px",
                padding: "0 16px",
                borderRadius: "10px",
                border: "none",
                background: "#5865F2",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "13px",
                cursor: connecting || isWaitingForLinkHydration ? "default" : "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                opacity: connecting || isWaitingForLinkHydration ? 0.75 : 1,
                transition: "opacity 0.15s, transform 0.1s",
                whiteSpace: "nowrap",
              }}
            >
              <DiscordGlyph size={16} />
              {isWaitingForLinkHydration ? "Linking..." : connecting ? "Connecting..." : "Link Discord"}
            </button>
          ) : (
            <>
              <button
                onClick={handleSync}
                disabled={syncing || unlinking}
                style={{
                  height: "36px",
                  padding: "0 13px",
                  borderRadius: "9px",
                  border: "1px solid var(--ht-border-card)",
                  background: "var(--ht-bg-card)",
                  color: "var(--ht-text-primary)",
                  fontWeight: 600,
                  fontSize: "12.5px",
                  cursor: syncing || unlinking ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: syncing ? 0.7 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {syncing ? "Syncing..." : "Sync Roles"}
              </button>

              {!confirmUnlink ? (
                <button
                  onClick={() => setConfirmUnlink(true)}
                  disabled={syncing || unlinking}
                  style={{
                    height: "36px",
                    padding: "0 12px",
                    borderRadius: "9px",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    background: "transparent",
                    color: "#f87171",
                    fontWeight: 600,
                    fontSize: "12.5px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  Unlink
                </button>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <button
                    onClick={handleUnlink}
                    disabled={unlinking}
                    style={{
                      height: "36px",
                      padding: "0 12px",
                      borderRadius: "9px",
                      border: "none",
                      background: "#dc2626",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: unlinking ? "default" : "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {unlinking ? "Unlinking..." : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmUnlink(false)}
                    disabled={unlinking}
                    style={{
                      height: "36px",
                      padding: "0 10px",
                      borderRadius: "9px",
                      border: "1px solid var(--ht-border-card)",
                      background: "transparent",
                      color: "var(--ht-text-secondary)",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Contextual Notice (e.g., not in server yet or error) */}
      {(notice || (isLinked && inGuild === false)) && (
        <div
          style={{
            marginTop: "14px",
            padding: "10px 14px",
            borderRadius: "10px",
            background: notice?.type === "error" ? "rgba(239, 68, 68, 0.08)" : "rgba(88, 101, 242, 0.08)",
            border: `1px solid ${notice?.type === "error" ? "rgba(239, 68, 68, 0.25)" : "rgba(88, 101, 242, 0.22)"}`,
            color: notice?.type === "error" ? "#f87171" : "var(--ht-text-secondary)",
            fontSize: "12.5px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            lineHeight: 1.4,
          }}
        >
          <span>
            {notice?.text || "Join the Discord server, then tap Sync Roles to receive your roles."}
          </span>
          {inGuild === false && inviteUrl && (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#5865F2",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Join Server ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
