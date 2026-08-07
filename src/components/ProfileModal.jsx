import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { DragSheet } from '../components/DragSheet.jsx';
import { BillingTab } from '../screens/BillingTab.jsx';
import { NotificationManager } from '../utils/notifications.js';
import { VAPID_PUBLIC_KEY } from '../utils/constants.js';
import { calcXp, calcStats, getLevel, getXpForLevelStart } from '../utils/helpers.js';
import { QrScannerModal } from '../components/QrScannerModal.jsx';


export function ProfileModal({ initialTab = "account", session, profile, habits = [], todos = [], goals = [], journalEntries = {}, showTodayOnly, onChangeShowTodayOnly, routines = [], onOpenRoutineModal, onUpdate, onClose, onUpgrade }) {
  const [tab, setTab] = useState(initialTab);
  const [username, setUsername] = useState(profile?.username || "");
  const [usernameMsg, setUsernameMsg] = useState("");
  const [usernameErr, setUsernameErr] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile?.notifications_enabled || false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [toast, setToast] = useState(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  // Compute Streak and Shield Stats
  const { currentStreak, shields, maxShields, perfectDaysCount, progressToNextShield } = calcStats(habits, [], profile?.is_premium, profile);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const avatarLetter = (profile?.username || session.user.email || "?")[0].toUpperCase();

  const uploadAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast("Image must be under 2MB", "error"); return; }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { showToast("Upload failed", "error"); setUploadingAvatar(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl + "?t=" + Date.now();
    await supabase.from("profiles").upsert({ id: session.user.id, avatar_url: url, updated_at: new Date().toISOString() });
    setAvatarUrl(url);
    onUpdate(prev => ({ ...prev, avatar_url: url }));
    showToast("Profile photo updated!");
    setUploadingAvatar(false);
  };

  const removeAvatar = async () => {
    await supabase.storage.from("avatars").remove([`${session.user.id}/avatar.jpg`, `${session.user.id}/avatar.png`, `${session.user.id}/avatar.jpeg`, `${session.user.id}/avatar.webp`]);
    await supabase.from("profiles").upsert({ id: session.user.id, avatar_url: null, updated_at: new Date().toISOString() });
    setAvatarUrl(null);
    onUpdate(prev => ({ ...prev, avatar_url: null }));
    showToast("Photo removed");
  };

  const saveUsername = async () => {
    setUsernameMsg(""); setUsernameErr("");
    if (!username.trim()) return;
    if (username.length < 3) { setUsernameErr("Must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setUsernameErr("Letters, numbers and underscores only"); return; }
    setSavingUsername(true);
    const { error } = await supabase.from("profiles").upsert({ id: session.user.id, username: username.trim(), updated_at: new Date().toISOString() });
    if (error) setUsernameErr(error.message.includes("unique") ? "Username already taken" : error.message);
    else { onUpdate(prev => ({ ...prev, username: username.trim() })); showToast("Username saved!"); }
    setSavingUsername(false);
  };

  const saveEmail = async () => {
    setEmailMsg(""); setEmailErr("");
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) setEmailErr(error.message);
    else { showToast("Confirmation sent — check your inbox"); setEmailMsg("Confirmation sent to both addresses."); }
    setSavingEmail(false);
  };

  const savePassword = async () => {
    setPwMsg(""); setPwErr("");
    if (!newPw) return;
    if (newPw.length < 8) { setPwErr("Must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwErr("Passwords don't match"); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) setPwErr(error.message);
    else { showToast("Password updated!"); setNewPw(""); setConfirmPw(""); }
    setSavingPw(false);
  };

  const sendResetLink = async () => {
    setResetSent(true);
    await supabase.auth.resetPasswordForEmail(session.user.email);
    showToast("Reset link sent to " + session.user.email);
    setTimeout(() => setResetSent(false), 4000);
  };

  const handleToggleNotifications = async () => {
    setSavingNotifications(true);
    const newVal = !notificationsEnabled;

    if (newVal) {
      const granted = await NotificationManager.requestPermission();
      if (!granted) {
        showToast("Notification permission denied", "error");
        setSavingNotifications(false);
        return;
      }
      const subbed = await NotificationManager.subscribeUser(session.user.id, VAPID_PUBLIC_KEY);
      if (!subbed) {
        showToast("Failed to subscribe to push notifications", "error");
        setSavingNotifications(false);
        return;
      }
    } else {
      await NotificationManager.unsubscribeUser(session.user.id);
    }

    const { error } = await supabase
      .from("profiles")
      .update({ notifications_enabled: newVal, updated_at: new Date().toISOString() })
      .eq("id", session.user.id);

    if (error) {
      showToast(error.message, "error");
    } else {
      setNotificationsEnabled(newVal);
      onUpdate(prev => ({ ...prev, notifications_enabled: newVal }));
      showToast(newVal ? "Notifications enabled!" : "Notifications disabled");
    }
    setSavingNotifications(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeletingAccount(true);
    try {
      const uid = session.user.id;
      await supabase.from("habit_completions").delete().eq("user_id", uid);
      await supabase.from("habits").delete().eq("user_id", uid);
      await supabase.from("todos").delete().eq("user_id", uid);
      await supabase.from("goals").delete().eq("user_id", uid);
      await supabase.from("pause_periods").delete().eq("user_id", uid);
      await supabase.from("journal_entries").delete().eq("user_id", uid);
      await supabase.from("profiles").delete().eq("id", uid);
      await fetch("https://app.habitick.app/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      await supabase.auth.signOut();
    } catch (err) {
      showToast("Something went wrong. Please try again.", "error");
      setDeletingAccount(false);
    }
  };

  const inp = { width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #1f2937", background: "#0d1117", color: "#f9fafb", fontSize: "16px", boxSizing: "border-box", fontFamily: "inherit", outline: "none", marginBottom: "16px" };
  const lbl = { color: "#6b7280", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "8px" };
  const sectionLbl = { color: "#9ca3af", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: "12px" };
  const tabStyle = (key) => ({ flex: 1, padding: "10px 8px", borderRadius: "10px", border: "1px solid", borderColor: tab === key ? "#2563eb" : "#1f2937", background: tab === key ? "#2563eb" : "transparent", color: tab === key ? "#fff" : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "14px", fontFamily: "inherit", transition: "all 0.15s" });
  const divider = { borderTop: "1px solid #1f2937", margin: "20px 0" };

  return (
    <DragSheet onClose={onClose}>
      {toast && (
        <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#7f1d1d" : "#064e3b", border: `1px solid ${toast.type === "error" ? "#f87171" : "#10b981"}`, borderRadius: "10px", padding: "10px 20px", color: toast.type === "error" ? "#fca5a5" : "#6ee7b7", fontWeight: 600, fontSize: "14px", zIndex: 30000, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {toast.type !== "error" && "✓ "}{toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
        <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "24px", color: "#f9fafb", letterSpacing: "-0.02em" }}>Your Profile</h2>
        <button onClick={onClose} style={{ background: "#1f2937", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "18px", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "28px" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "2px solid #2563eb" }} />
            : <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "32px", color: "#fff" }}>{avatarLetter}</div>
          }
          <label style={{ position: "absolute", bottom: "0px", right: "0px", width: "26px", height: "26px", background: "#374151", border: "2px solid #111827", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>
            {uploadingAvatar ? "⏳" : "📷"}
            <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "20px", color: "#f9fafb", display: "flex", alignItems: "center", gap: "10px" }}>
            {profile?.username || "No username yet"}
            {profile?.is_premium && (
              <span style={{
                fontSize: "9px",
                padding: "3px 9px",
                borderRadius: "999px",
                background: profile?.is_lifetime ? "linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)" : "#1f2937",
                color: "#fff",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                boxShadow: profile?.is_lifetime ? "0 2px 10px rgba(37, 99, 235, 0.4)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                border: profile?.is_lifetime ? "1px solid #60a5fa" : "1px solid #374151"
              }}>
                {profile?.is_lifetime ? `FOUNDER #${profile?.user_number || "?"} ✦` : "PREMIUM"}
              </span>
            )}
          </div>
          <div style={{ fontSize: "14px", color: "#4b5563", marginTop: "4px", marginBottom: "8px" }}>{session.user.email}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
            <span style={{ 
              fontSize: "11px", 
              fontWeight: 700, 
              color: "#f97316", 
              background: "rgba(249, 115, 22, 0.08)",
              border: "1px solid rgba(249, 115, 22, 0.2)",
              padding: "3px 9px", 
              borderRadius: "6px",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px"
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#f97316", flexShrink: 0 }}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
              {currentStreak} Day Streak
            </span>
            <span style={{ 
              fontSize: "11px", 
              color: "#60a5fa", 
              fontWeight: 600, 
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              padding: "3px 9px", 
              borderRadius: "6px",
              display: "inline-flex", 
              alignItems: "center", 
              gap: "5px" 
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#60a5fa", flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              {shields} / {maxShields} Shields
            </span>
          </div>
          {avatarUrl && <button onClick={removeAvatar} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "12px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Remove photo</button>}
        </div>
      </div>

      {/* Tab bar — 4 clean tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px", flexWrap: "wrap" }}>
        <button style={tabStyle("account")} onClick={() => setTab("account")}>Account</button>
        <button style={tabStyle("shields")} onClick={() => setTab("shields")}>Shields</button>
        <button style={tabStyle("notifications")} onClick={() => setTab("notifications")}>Notifications</button>
        <button style={tabStyle("billing")} onClick={() => setTab("billing")}>Billing</button>
      </div>

      {/* ── ACCOUNT TAB: Username + Email + Password + QR Pairing ── */}
      {tab === "account" && (
        <div style={{ animation: "fadeUp 0.2s ease-out" }}>
          {/* Username */}
          <span style={sectionLbl}>Username</span>
          <input value={username} onChange={e => setUsername(e.target.value)} style={inp} placeholder="e.g. john_doe" onKeyDown={e => e.key === "Enter" && saveUsername()} />
          <div style={{ fontSize: "11px", color: "#374151", marginTop: "-10px", marginBottom: "12px" }}>Letters, numbers and underscores · min 3 chars</div>
          {usernameErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{usernameErr}</div>}
          <button onClick={saveUsername} disabled={savingUsername} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingUsername ? 0.7 : 1 }}>
            {savingUsername ? "Saving..." : "Save Username"}
          </button>

          <div style={divider} />

          {/* Habits Display Preference */}
          <span style={sectionLbl}>Habit List View</span>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <button
              onClick={() => onChangeShowTodayOnly(false)}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: !showTodayOnly ? "#3b82f6" : "#1f2937",
                background: !showTodayOnly ? "rgba(59, 130, 246, 0.08)" : "transparent",
                color: !showTodayOnly ? "#60a5fa" : "#6b7280",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: "inherit"
              }}
            >
              All Habits
            </button>
            <button
              onClick={() => onChangeShowTodayOnly(true)}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: showTodayOnly ? "#3b82f6" : "#1f2937",
                background: showTodayOnly ? "rgba(59, 130, 246, 0.08)" : "transparent",
                color: showTodayOnly ? "#60a5fa" : "#6b7280",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: "inherit"
              }}
            >
              Scheduled Only
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: 1.4, marginBottom: "12px" }}>
            Choose whether to display all habits on the dashboard, or filter to show only habits scheduled for today.
          </div>

          <div style={divider} />

          {/* Routine View & Management */}
          <span style={sectionLbl}>Routines Management</span>
          <div style={{
            background: "rgba(167, 139, 250, 0.05)",
            border: "1px solid rgba(167, 139, 250, 0.15)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "12px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#f9fafb", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>⚡ Routines</span>
                  <span style={{ fontSize: "11px", color: "#a78bfa", background: "rgba(167, 139, 250, 0.15)", padding: "2px 7px", borderRadius: "999px", fontWeight: 700 }}>
                    {routines.length} {routines.length === 1 ? "routine" : "routines"}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                  Group your habits into morning, workout, or evening routines.
                </div>
              </div>
              <button
                onClick={() => onOpenRoutineModal?.(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#a78bfa",
                  color: "#0f172a",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
              >
                + New Routine
              </button>
            </div>

            {routines.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "12px" }}>
                {routines.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0, 0, 0, 0.2)", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "16px" }}>{r.emoji || "📋"}</span>
                      <span style={{ fontWeight: 600, fontSize: "13px", color: "#f3f4f6" }}>{r.name}</span>
                    </div>
                    <button
                      onClick={() => onOpenRoutineModal?.(r)}
                      style={{
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.25)",
                        borderRadius: "6px",
                        color: "#60a5fa",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: "5px 12px"
                      }}
                    >
                      View / Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={divider} />

          {/* Email */}
          <span style={sectionLbl}>Email Address</span>
          <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: "#4b5563" }}>
            Current: <span style={{ color: "#9ca3af", fontWeight: 600 }}>{session.user.email}</span>
          </div>
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" style={inp} placeholder="New email address" />
          {emailErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{emailErr}</div>}
          {emailMsg && <div style={{ color: "#10b981", fontSize: "13px", marginBottom: "10px" }}>{emailMsg}</div>}
          <button onClick={saveEmail} disabled={savingEmail} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingEmail ? 0.7 : 1 }}>
            {savingEmail ? "Sending..." : "Update Email"}
          </button>

          <div style={divider} />

          {/* Password */}
          <span style={sectionLbl}>Password</span>
          <input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" style={inp} placeholder="New password (min. 8 chars)" />
          <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type="password" style={inp} placeholder="Confirm new password" />
          {pwErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{pwErr}</div>}
          <button onClick={savePassword} disabled={savingPw} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingPw ? 0.7 : 1, marginBottom: "8px" }}>
            {savingPw ? "Updating..." : "Update Password"}
          </button>
          <button onClick={sendResetLink} disabled={resetSent} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #1f2937", background: resetSent ? "#064e3b" : "transparent", color: resetSent ? "#6ee7b7" : "#6b7280", fontWeight: 600, fontSize: "13px", cursor: resetSent ? "default" : "pointer", fontFamily: "inherit" }}>
            {resetSent ? "✓ Reset link sent to your email!" : "Send password reset link instead"}
          </button>

          <div style={divider} />

          {/* Quick Device Linking / QR Login */}
          <span style={sectionLbl}>Device Pairing</span>
          <div style={{
            background: "rgba(37, 99, 235, 0.05)",
            border: "1px solid rgba(59, 130, 246, 0.15)",
            borderRadius: "12px",
            padding: "16px"
          }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#f9fafb", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>QR Code Login</span>
              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", fontWeight: 700 }}>🔒 E2EE Encrypted</span>
            </div>
            <div style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.4, marginBottom: "12px" }}>
              Log into Habitick on a laptop or new browser by scanning the QR code shown on their sign-in page.
            </div>
            <button
              onClick={() => setShowQrScanner(true)}
              style={{
                width: "100%",
                padding: "11px",
                borderRadius: "8px",
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              Scan QR Code to Log In Device
            </button>
          </div>
        </div>
      )}

      {/* ── STREAK & SHIELDS TAB ── */}
      {tab === "shields" && (
        <div style={{ animation: "fadeUp 0.2s ease-out" }}>
          {/* Shields Summary Card */}
          <div style={{ 
            background: "rgba(22, 31, 48, 0.4)", 
            border: "1px solid rgba(255, 255, 255, 0.05)", 
            borderRadius: "20px", 
            padding: "24px", 
            marginBottom: "20px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
              <div style={{ 
                width: "48px", 
                height: "48px", 
                borderRadius: "12px", 
                background: "rgba(59, 130, 246, 0.08)", 
                border: "1px solid rgba(59, 130, 246, 0.15)",
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                flexShrink: 0
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#fff" }}>Streak Shields</h3>
                <div style={{ fontSize: "12px", color: "#60a5fa", fontWeight: 600, marginTop: "2px" }}>
                  {shields} / {maxShields} Shields {profile?.is_premium ? "(Premium Max 5)" : "(Max 3 — Upgrade for 5)"}
                </div>
              </div>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>
              Streak Shields protect your active habit streak when you miss a day. Shields are automatically awarded every <strong>5 perfect days</strong>.
            </p>

            {/* Next shield progress */}
            <div style={{ background: "rgba(0, 0, 0, 0.2)", borderRadius: "12px", padding: "14px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db", fontWeight: 600, marginBottom: "8px" }}>
                <span>Progress to Next Shield</span>
                <span style={{ color: "#3b82f6", fontWeight: 700 }}>{progressToNextShield} / 5 Perfect Days</span>
              </div>
              <div style={{ height: "6px", background: "rgba(255, 255, 255, 0.06)", borderRadius: "999px", overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#2563eb", width: `${(progressToNextShield / 5) * 100}%`, borderRadius: "999px", transition: "width 0.4s ease" }} />
              </div>
            </div>
          </div>

          {/* How Shields Work Rules */}
          <span style={sectionLbl}>How Shields Work</span>
          <div style={{ 
            background: "rgba(255, 255, 255, 0.01)", 
            border: "1px solid rgba(255, 255, 255, 0.04)", 
            borderRadius: "16px", 
            padding: "20px", 
            display: "flex", 
            flexDirection: "column", 
            gap: "14px", 
            fontSize: "13px" 
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#60a5fa", marginTop: "6px", flexShrink: 0 }} />
              <div style={{ color: "#9ca3af", lineHeight: 1.4 }}>
                <strong style={{ color: "#f3f4f6" }}>Automated Rewards:</strong> Complete all scheduled habits on any day (with at least 1 habit scheduled) to earn a perfect day. Every 5 total perfect days awards 1 shield.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "12px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#60a5fa", marginTop: "6px", flexShrink: 0 }} />
              <div style={{ color: "#9ca3af", lineHeight: 1.4 }}>
                <strong style={{ color: "#f3f4f6" }}>Non-Consecutive Count:</strong> Perfect days do not need to be in order. Missed days between perfect days won't reset your 5-day counter!
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "12px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#60a5fa", marginTop: "6px", flexShrink: 0 }} />
              <div style={{ color: "#9ca3af", lineHeight: 1.4 }}>
                <strong style={{ color: "#f3f4f6" }}>Automatic Streak Protection:</strong> If you miss a scheduled day, an available shield is automatically used so your streak continues uninterrupted.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ── */}
      {tab === "notifications" && (
        <div style={{ animation: "fadeUp 0.2s ease-out" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#f9fafb" }}>Push Notifications</h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.4 }}>Get reminders for habits and tasks directly on your device.</p>
              </div>
              <button
                onClick={handleToggleNotifications}
                disabled={savingNotifications}
                style={{
                  width: "48px",
                  height: "26px",
                  borderRadius: "999px",
                  background: notificationsEnabled ? "#2563eb" : "#374151",
                  position: "relative",
                  cursor: "pointer",
                  border: "none",
                  transition: "background 0.2s",
                  opacity: savingNotifications ? 0.7 : 1,
                  flexShrink: 0
                }}
              >
                <div style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: "3px",
                  left: notificationsEnabled ? "25px" : "3px",
                  transition: "left 0.2s"
                }} />
              </button>
            </div>

            {!('serviceWorker' in navigator) && (
              <div style={{ marginTop: "16px", padding: "10px", borderRadius: "8px", background: "#7f1d1d20", border: "1px solid #f8717130", color: "#f87171", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12" y1="17" y2="17" /></svg>
                <span>Your browser doesn't support service workers. Notifications may not work.</span>
              </div>
            )}

            {notificationsEnabled && Notification.permission === 'denied' && (
              <div style={{ marginTop: "16px", padding: "10px", borderRadius: "8px", background: "#7f1d1d20", border: "1px solid #f8717130", color: "#f87171", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12" y1="17" y2="17" /></svg>
                <span>Notifications are blocked by your browser. Please enable them in settings.</span>
              </div>
            )}
          </div>

          <div style={{ padding: "0 10px", color: "#4b5563", fontSize: "12px", lineHeight: 1.5 }}>
            <p>• Notifications work even when the app is closed (TWA/PWA mode).</p>
            <p>• You can set specific reminder times for each habit in the habit editor.</p>
            <p style={{ marginTop: "8px" }}>Note: If you're on iOS, you must add HabiTick to your home screen first to enable push notifications.</p>
          </div>
        </div>
      )}

      {/* ── BILLING TAB ── */}
      {tab === "billing" && <BillingTab profile={profile} session={session} showToast={showToast} onUpgrade={onUpgrade} />}

      {/* Sign out + Delete — always visible at bottom */}
      <div style={{ borderTop: "1px solid #1f2937", marginTop: "24px", paddingTop: "16px", paddingBottom: "24px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
        <button onClick={() => setShowDeleteConfirm1(true)} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Delete account</button>
      </div>

      {showDeleteConfirm1 && (
        <div style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "360px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", color: "#ef4444", marginBottom: "16px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12" y1="17" y2="17" /></svg>
            </div>
            <h2 style={{ margin: "0 0 10px", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "19px", color: "#f9fafb" }}>Delete your account?</h2>
            <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, marginBottom: "24px" }}>This will permanently delete all your habits, todos, journal entries and account data. <strong style={{ color: "#f87171" }}>This cannot be undone.</strong></p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={() => { setShowDeleteConfirm1(false); setShowDeleteConfirm2(true); }} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "1px solid #7f1d1d", background: "#7f1d1d30", color: "#f87171", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Yes, I want to delete my account</button>
              <button onClick={() => setShowDeleteConfirm1(false)} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Cancel, keep my account</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm2 && (
        <div style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "360px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", color: "#ef4444", marginBottom: "16px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" /></svg>
            </div>
            <h2 style={{ margin: "0 0 10px", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "19px", color: "#f9fafb" }}>Are you absolutely sure?</h2>
            <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, marginBottom: "20px" }}>Type <strong style={{ color: "#f87171" }}>DELETE</strong> below to confirm.</p>
            <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="Type DELETE here"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: `1px solid ${deleteConfirmText === "DELETE" ? "#f87171" : "#374151"}`, background: "#0d1117", color: "#f9fafb", fontSize: "15px", fontFamily: "inherit", textAlign: "center", boxSizing: "border-box", outline: "none", letterSpacing: "0.05em", marginBottom: "16px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: deleteConfirmText === "DELETE" ? "#dc2626" : "#374151", color: deleteConfirmText === "DELETE" ? "#fff" : "#6b7280", fontWeight: 700, fontSize: "14px", cursor: deleteConfirmText === "DELETE" ? "pointer" : "default", fontFamily: "inherit", opacity: deletingAccount ? 0.7 : 1 }}>
                {deletingAccount ? "Deleting..." : "Permanently delete everything"}
              </button>
              <button onClick={() => { setShowDeleteConfirm2(false); setDeleteConfirmText(""); }} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showQrScanner && (
        <QrScannerModal
          onClose={() => setShowQrScanner(false)}
          showToast={showToast}
        />
      )}
    </DragSheet>
  );
}