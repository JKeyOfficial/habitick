import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { DragSheet } from '../components/DragSheet.jsx';
import { BillingTab } from '../screens/BillingTab.jsx';

export function ProfileModal({ session, profile, onUpdate, onClose }) {
  const [tab, setTab] = useState("profile");
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
  const [toast, setToast] = useState(null);

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

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeletingAccount(true);
    try {
      const uid = session.user.id;
      await supabase.from("habit_completions").delete().eq("user_id", uid);
      await supabase.from("habits").delete().eq("user_id", uid);
      await supabase.from("todos").delete().eq("user_id", uid);
      await supabase.from("pause_periods").delete().eq("user_id", uid);
      await supabase.from("journal_entries").delete().eq("user_id", uid);
      await supabase.from("profiles").delete().eq("id", uid);
      await fetch("https://app.habitick.pro/api/delete-account", {
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
  const lbl = { color: "#6b7280", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "8px" };
  const tabStyle = (key) => ({ flex: 1, padding: "10px 8px", borderRadius: "10px", border: "1px solid", borderColor: tab === key ? "#2563eb" : "#1f2937", background: tab === key ? "#2563eb" : "transparent", color: tab === key ? "#fff" : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "14px", fontFamily: "inherit", transition: "all 0.15s" });

  return (
    <DragSheet onClose={onClose}>
      {toast && (
        <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#7f1d1d" : "#064e3b", border: `1px solid ${toast.type === "error" ? "#f87171" : "#10b981"}`, borderRadius: "10px", padding: "10px 20px", color: toast.type === "error" ? "#fca5a5" : "#6ee7b7", fontWeight: 600, fontSize: "14px", zIndex: 300, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {toast.type !== "error" && "✓ "}{toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
        <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "24px", color: "#f9fafb", letterSpacing: "-0.02em" }}>Your Profile</h2>
        <button onClick={onClose} style={{ background: "#1f2937", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "18px", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "32px" }}>
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
          {avatarUrl && <button onClick={removeAvatar} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "12px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Remove photo</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
        <button style={tabStyle("profile")} onClick={() => setTab("profile")}>Username</button>
        <button style={tabStyle("email")} onClick={() => setTab("email")}>Email</button>
        <button style={tabStyle("password")} onClick={() => setTab("password")}>Password</button>
        <button style={tabStyle("billing")} onClick={() => setTab("billing")}>Billing</button>
      </div>

      {tab === "profile" && (
        <div>
          <label style={lbl}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} style={inp} placeholder="e.g. john_doe" onKeyDown={e => e.key === "Enter" && saveUsername()} />
          <div style={{ fontSize: "11px", color: "#374151", marginBottom: "14px" }}>Letters, numbers and underscores · min 3 chars</div>
          {usernameErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{usernameErr}</div>}
          <button onClick={saveUsername} disabled={savingUsername} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingUsername ? 0.7 : 1 }}>{savingUsername ? "Saving..." : "Save Username"}</button>
        </div>
      )}

      {tab === "email" && (
        <div>
          <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "13px", color: "#4b5563" }}>
            Current: <span style={{ color: "#9ca3af", fontWeight: 600 }}>{session.user.email}</span>
          </div>
          <label style={lbl}>New Email Address</label>
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" style={inp} placeholder="new@email.com" />
          {emailErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{emailErr}</div>}
          {emailMsg && <div style={{ color: "#10b981", fontSize: "13px", marginBottom: "10px" }}>{emailMsg}</div>}
          <button onClick={saveEmail} disabled={savingEmail} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingEmail ? 0.7 : 1 }}>{savingEmail ? "Sending..." : "Update Email"}</button>
        </div>
      )}

      {tab === "password" && (
        <div>
          <label style={lbl}>New Password</label>
          <input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" style={inp} placeholder="Min. 8 characters" />
          <label style={lbl}>Confirm Password</label>
          <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type="password" style={inp} placeholder="Repeat new password" />
          {pwErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{pwErr}</div>}
          <button onClick={savePassword} disabled={savingPw} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingPw ? 0.7 : 1, marginBottom: "10px" }}>{savingPw ? "Updating..." : "Update Password"}</button>
          <button onClick={sendResetLink} disabled={resetSent} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #1f2937", background: resetSent ? "#064e3b" : "transparent", color: resetSent ? "#6ee7b7" : "#6b7280", fontWeight: 600, fontSize: "13px", cursor: resetSent ? "default" : "pointer", fontFamily: "inherit" }}>
            {resetSent ? "✓ Link sent to your email!" : "Send reset link instead"}
          </button>
        </div>
      )}

      {tab === "billing" && <BillingTab profile={profile} session={session} showToast={showToast} />}

      <div style={{ borderTop: "1px solid #1f2937", marginTop: "24px", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
        <button onClick={() => setShowDeleteConfirm1(true)} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Delete account</button>
      </div>

      {showDeleteConfirm1 && (
        <div style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "360px", textAlign: "center" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
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
        <div style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "360px", textAlign: "center" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🗑️</div>
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