import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { DragSheet } from '../components/DragSheet.jsx';
import { BillingTab } from '../screens/BillingTab.jsx';
import { NotificationManager } from '../utils/notifications.js';
import { VAPID_PUBLIC_KEY } from '../utils/constants.js';
import { calcXp, calcStats, getLevel, getXpForLevelStart } from '../utils/helpers.js';


export function ProfileModal({ session, profile, habits = [], todos = [], goals = [], journalEntries = {}, showTodayOnly, onChangeShowTodayOnly, onUpdate, onClose }) {
  const [tab, setTab] = useState("account");
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
  const [purchasingShield, setPurchasingShield] = useState(false);

  // Compute XP and Shield Stats
  const { totalEarned, habitXp, taskXp, journalXp, perfectDayXp, goalsXp } = calcXp(habits, todos, journalEntries, goals);
  const { shields } = calcStats(habits, [], profile?.is_premium, profile);
  const maxShields = profile?.is_premium ? 5 : 3;
  const remainingXp = Math.max(totalEarned - ((profile?.purchased_shields || 0) * 500), 0);

  const currentLvl = getLevel(totalEarned);
  const currentLvlStart = getXpForLevelStart(currentLvl);
  const nextLvlStart = getXpForLevelStart(currentLvl + 1);
  const xpInCurrentLvl = totalEarned - currentLvlStart;
  const xpNeededForCurrentLvl = nextLvlStart - currentLvlStart;
  const levelProgressPct = (xpInCurrentLvl / xpNeededForCurrentLvl) * 100;

  const buyShield = async () => {
    if (remainingXp < 500) return;
    const currentStats = calcStats(habits, [], profile?.is_premium, profile);
    if (currentStats.shields >= maxShields) {
      showToast(`Max shields reached (${maxShields})`, "error");
      return;
    }

    setPurchasingShield(true);
    const newPurchasedCount = (profile?.purchased_shields || 0) + 1;

    const { data, error } = await supabase
      .from("profiles")
      .update({
        purchased_shields: newPurchasedCount,
        updated_at: new Date().toISOString()
      })
      .eq("id", session.user.id)
      .select()
      .single();

    if (error) {
      showToast(error.message, "error");
    } else {
      showToast("Shield purchased successfully! 🛡️");
      onUpdate(prev => ({ ...prev, purchased_shields: newPurchasedCount }));
    }
    setPurchasingShield(false);
  };


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
                {profile?.is_lifetime ? `FOUNDER #${profile?.user_number || "?"} ✦` : "PRO"}
              </span>
            )}
          </div>
          <div style={{ fontSize: "14px", color: "#4b5563", marginTop: "4px", marginBottom: "8px" }}>{session.user.email}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
            <span style={{ 
              fontSize: "11px", 
              fontWeight: 800, 
              color: "#3b82f6", 
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              padding: "2px 8px", 
              borderRadius: "6px"
            }}>
              Lvl {currentLvl}
            </span>
            <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
              {remainingXp.toLocaleString()} / {totalEarned.toLocaleString()} XP
            </span>
          </div>
          {avatarUrl && <button onClick={removeAvatar} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "12px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Remove photo</button>}
        </div>
      </div>

      {/* Tab bar — 4 clean tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px", flexWrap: "wrap" }}>
        <button style={tabStyle("account")} onClick={() => setTab("account")}>Account</button>
        <button style={tabStyle("xp")} onClick={() => setTab("xp")}>XP & Shop</button>
        <button style={tabStyle("notifications")} onClick={() => setTab("notifications")}>Notifications</button>
        <button style={tabStyle("billing")} onClick={() => setTab("billing")}>Billing</button>
      </div>

      {/* ── ACCOUNT TAB: Username + Email + Password in one place ── */}
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
        </div>
      )}

      {/* ── XP & SHOP TAB ── */}
      {tab === "xp" && (
        <div style={{ animation: "fadeUp 0.2s ease-out" }}>
          {/* Level Progress Card */}
          <div style={{ 
            background: "linear-gradient(135deg, rgba(168, 85, 247, 0.04) 0%, rgba(59, 130, 246, 0.04) 100%)", 
            border: "1px solid rgba(255, 255, 255, 0.04)", 
            borderRadius: "20px", 
            padding: "24px", 
            marginBottom: "20px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
              <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 800, color: "#3b82f6" }}>
                Level {currentLvl}
              </h3>
              <span style={{ fontSize: "12px", color: "#9ca3af", fontWeight: 700, fontFamily: "'Syne', sans-serif", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
                {xpInCurrentLvl} / {xpNeededForCurrentLvl} XP to next level
              </span>
            </div>
            
            {/* Progress bar */}
            <div style={{ height: "3px", background: "rgba(255, 255, 255, 0.05)", borderRadius: "999px", margin: "14px 0 6px", overflow: "hidden" }}>
              <div style={{ 
                height: "100%", 
                background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)", 
                width: `${levelProgressPct}%`,
                borderRadius: "999px"
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#4b5563", fontWeight: 600 }}>
              <span>Level {currentLvl}</span>
              <span>Level {currentLvl + 1}</span>
            </div>
          </div>

          {/* XP Status Panel */}
          <div style={{ 
            display: "flex", 
            background: "rgba(255, 255, 255, 0.01)", 
            border: "1px solid rgba(255, 255, 255, 0.03)", 
            borderRadius: "16px", 
            padding: "16px 0",
            marginBottom: "24px" 
          }}>
            <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid rgba(255, 255, 255, 0.05)" }}>
              <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Spendable XP</div>
              <div style={{ fontSize: "24px", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#3b82f6", display: "inline-flex", alignItems: "center", gap: "6px", justifyContent: "center", width: "100%" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
                {remainingXp}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Total Earned</div>
              <div style={{ fontSize: "24px", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#e5e7eb" }}>
                {totalEarned}
              </div>
            </div>
          </div>

          {/* Shield Shop Section */}
          <span style={sectionLbl}>XP Shield Shop</span>
          <div style={{ 
            background: "linear-gradient(135deg, rgba(59, 130, 246, 0.01) 0%, rgba(37, 99, 235, 0.01) 100%)", 
            border: "1px solid rgba(255, 255, 255, 0.03)", 
            borderRadius: "20px", 
            padding: "20px", 
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)"
          }}>
            <div style={{ 
              width: "56px", 
              height: "56px", 
              borderRadius: "14px", 
              background: "rgba(59, 130, 246, 0.04)", 
              border: "1px solid rgba(59, 130, 246, 0.12)",
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              flexShrink: 0
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: "15px", display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Syne', sans-serif" }}>
                Streak Shield
                <span style={{ fontSize: "11px", color: "#60a5fa", background: "rgba(96, 165, 250, 0.08)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(96, 165, 250, 0.12)", fontWeight: 700 }}>
                  {shields} / {maxShields} held
                </span>
              </div>
              <p style={{ margin: "6px 0 14px", fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>
                Protects your streak for one missed day. Max capacity is {maxShields} shields {profile?.is_premium ? "(Pro Limit)" : "(Upgrade to Pro for max 5)"}.
              </p>
              
              <button 
                onClick={buyShield}
                disabled={remainingXp < 500 || shields >= maxShields || purchasingShield}
                style={{ 
                  padding: "9px 18px", 
                  borderRadius: "10px", 
                  border: remainingXp >= 500 && shields < maxShields ? "none" : "1px solid rgba(255, 255, 255, 0.05)", 
                  background: remainingXp >= 500 && shields < maxShields ? "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)" : "rgba(255, 255, 255, 0.01)", 
                  color: remainingXp >= 500 && shields < maxShields ? "#fff" : "#4b5563", 
                  fontWeight: 700, 
                  fontSize: "12px", 
                  cursor: remainingXp >= 500 && shields < maxShields ? "pointer" : "default", 
                  fontFamily: "inherit",
                  transition: "all 0.2s ease",
                  boxShadow: remainingXp >= 500 && shields < maxShields ? "0 4px 14px rgba(168, 85, 247, 0.25)" : "none"
                }}
                onMouseEnter={e => {
                  if (remainingXp >= 500 && shields < maxShields) e.currentTarget.style.filter = "brightness(1.1)";
                }}
                onMouseLeave={e => {
                  if (remainingXp >= 500 && shields < maxShields) e.currentTarget.style.filter = "none";
                }}
              >
                {purchasingShield ? "Buying..." : shields >= maxShields ? "Max capacity reached" : `Buy Shield (500 XP)`}
              </button>
            </div>
          </div>

          {/* XP Earned Breakdown */}
          <span style={sectionLbl}>XP Breakdown</span>
          <div style={{ 
            background: "rgba(255, 255, 255, 0.005)", 
            border: "1px solid rgba(255, 255, 255, 0.02)", 
            borderRadius: "16px", 
            padding: "20px", 
            display: "flex", 
            flexDirection: "column", 
            gap: "14px", 
            fontSize: "13.5px" 
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📋</span> Habit Completions (+10 XP)
              </span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{habitXp} XP</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "12px" }}>
              <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>✅</span> Task Completions (+5 XP)
              </span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{taskXp} XP</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "12px" }}>
              <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📓</span> Journal Entries (+25 XP)
              </span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{journalXp} XP</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "12px" }}>
              <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🔥</span> Perfect Day Bonuses (+50 XP)
              </span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{perfectDayXp} XP</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "12px" }}>
              <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🏅</span> Completed Goals (+100 XP)
              </span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{goalsXp} XP</span>
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
      {tab === "billing" && <BillingTab profile={profile} session={session} showToast={showToast} />}

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
    </DragSheet>
  );
}