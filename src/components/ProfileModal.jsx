import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { BillingTab } from '../screens/BillingTab.jsx';
import { NotificationManager } from '../utils/notifications.js';
import { VAPID_PUBLIC_KEY } from '../utils/constants.js';
import { calcStats } from '../utils/helpers.js';
import { QrScannerModal } from '../components/QrScannerModal.jsx';

export function ProfileModal({ 
  initialTab = "account", 
  session, 
  profile, 
  habits = [], 
  todos = [], 
  goals = [], 
  journalEntries = {}, 
  showTodayOnly, 
  onChangeShowTodayOnly, 
  hideEmptyRoutines, 
  onChangeHideEmptyRoutines, 
  onUpdate, 
  onClose, 
  onUpgrade,
  onRedoOnboarding 
}) {
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
  const { currentStreak, shields, maxShields, progressToNextShield } = calcStats(habits, [], profile?.is_premium, profile);

  // Handle ESC key press & disable body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

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

  // Desktop Navigation Tabs (5 Tabs: Account, View & Preferences, Shields, Notifications, Billing)
  const desktopTabsConfig = [
    {
      id: "account",
      label: "Account",
      subtitle: "Personal information, email address & password credentials",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    },
    {
      id: "view",
      label: "View & Preferences",
      subtitle: "Habit display filters, routine behavior & dashboard options",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      )
    },
    {
      id: "shields",
      label: "Streak Shields",
      subtitle: "Streak protection, perfect day mechanics & shield limits",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      )
    },
    {
      id: "notifications",
      label: "Notifications",
      subtitle: "Daily reminders, habit triggers & push alert permissions",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      )
    },
    {
      id: "billing",
      label: "Membership",
      subtitle: "Plan details, unlocked features & subscription management",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      )
    }
  ];

  // Mobile Navigation Tabs (4 Original Tabs: Account, Shields, Notifications, Billing)
  const mobileTabsConfig = [
    { id: "account", label: "Account" },
    { id: "shields", label: "Shields" },
    { id: "notifications", label: "Notifications" },
    { id: "billing", label: "Billing" }
  ];

  // Current tab metadata
  const currentDesktopTabObj = desktopTabsConfig.find(t => t.id === tab) || desktopTabsConfig[0];

  return (
    <div className="pm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <style>{`
        .pm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(3, 6, 11, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 20000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          animation: pmFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes pmFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }

        .pm-modal {
          background: #0d1117;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px 24px 0 0;
          width: 100%;
          max-width: 560px;
          height: 90vh;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.7);
          overflow: hidden;
          position: relative;
        }

        /* Responsive Visibility Helpers */
        .pm-mobile-only {
          display: block;
        }
        .pm-desktop-only {
          display: none;
        }

        /* Desktop Mode (Expanded, Spacious UI) */
        @media (min-width: 768px) {
          .pm-overlay {
            align-items: center;
            padding: 30px 20px;
          }

          .pm-mobile-only {
            display: none !important;
          }
          .pm-desktop-only {
            display: block !important;
          }

          .pm-modal {
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            width: 92vw;
            max-width: 1060px;
            height: 720px;
            max-height: 90vh;
            flex-direction: row;
            box-shadow: 0 28px 70px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.06);
          }
        }

        /* Sidebar Styling (Desktop) */
        .pm-sidebar {
          display: none;
        }

        @media (min-width: 768px) {
          .pm-sidebar {
            display: flex;
            flex-direction: column;
            width: 260px;
            flex-shrink: 0;
            background: #090d14;
            border-right: 1px solid rgba(255, 255, 255, 0.06);
            padding: 28px 18px;
            overflow-y: auto;
          }
        }

        /* Content Area */
        .pm-content-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #0d1117;
          overflow: hidden;
          min-width: 0;
        }

        .pm-content-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          -webkit-overflow-scrolling: touch;
        }

        .pm-content-body::-webkit-scrollbar {
          width: 6px;
        }
        .pm-content-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .pm-content-body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 999px;
        }
        .pm-content-body::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.22);
        }

        @media (min-width: 768px) {
          .pm-content-body {
            padding: 28px 36px 36px;
          }
        }

        /* Navigation Items */
        .pm-nav-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: transparent;
          color: #9ca3af;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: left;
          margin-bottom: 6px;
        }

        .pm-nav-btn:hover {
          background: rgba(255, 255, 255, 0.04);
          color: #f3f4f6;
        }

        .pm-nav-btn.active {
          background: rgba(37, 99, 235, 0.14);
          border-color: rgba(59, 130, 246, 0.3);
          color: #60a5fa;
        }

        .pm-nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          flex-shrink: 0;
        }

        /* Mobile Header */
        .pm-mobile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        @media (min-width: 768px) {
          .pm-mobile-header {
            display: none;
          }
        }

        /* Mobile Tab Pills */
        .pm-mobile-tabs {
          display: flex;
          gap: 6px;
          padding: 10px 18px;
          overflow-x: auto;
          background: rgba(9, 13, 20, 0.6);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          scrollbar-width: none;
        }

        .pm-mobile-tabs::-webkit-scrollbar {
          display: none;
        }

        @media (min-width: 768px) {
          .pm-mobile-tabs {
            display: none;
          }
        }

        .pm-mobile-tab-btn {
          flex: 1;
          white-space: nowrap;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: transparent;
          color: #9ca3af;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }

        .pm-mobile-tab-btn.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }

        /* Desktop Header */
        .pm-desktop-header {
          display: none;
          justify-content: space-between;
          align-items: center;
          padding: 24px 36px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        @media (min-width: 768px) {
          .pm-desktop-header {
            display: flex;
          }
        }

        /* Section Cards */
        .pm-card {
          background: rgba(17, 24, 39, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 20px 22px;
          margin-bottom: 18px;
          transition: border-color 0.2s ease;
        }

        .pm-card:hover {
          border-color: rgba(255, 255, 255, 0.1);
        }

        .pm-label {
          color: #9ca3af;
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          display: block;
          margin-bottom: 8px;
        }

        .pm-input {
          width: 100%;
          height: 42px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid #1f2937;
          background: #080b11;
          color: #f9fafb;
          font-size: 14px;
          box-sizing: border-box;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .pm-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        .pm-btn-primary {
          height: 42px;
          padding: 0 18px;
          border-radius: 10px;
          border: none;
          background: #2563eb;
          color: #fff;
          font-weight: 700;
          font-size: 13.5px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, transform 0.1s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .pm-btn-primary:hover {
          background: #1d4ed8;
        }

        .pm-btn-primary:active {
          transform: scale(0.98);
        }

        .pm-close-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #9ca3af;
          cursor: pointer;
          font-size: 14px;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .pm-close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
      `}</style>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          top: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          background: toast.type === "error" ? "#7f1d1d" : "#064e3b",
          border: `1px solid ${toast.type === "error" ? "#f87171" : "#10b981"}`,
          borderRadius: "12px",
          padding: "10px 22px",
          color: toast.type === "error" ? "#fca5a5" : "#6ee7b7",
          fontWeight: 600,
          fontSize: "14px",
          zIndex: 30000,
          whiteSpace: "nowrap",
          boxShadow: "0 12px 30px rgba(0,0,0,0.5)"
        }}>
          {toast.type !== "error" && "✓ "}{toast.msg}
        </div>
      )}

      <div className="pm-modal">
        {/* DESKTOP SIDEBAR */}
        <div className="pm-sidebar">
          {/* Profile Quick Summary */}
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "2px solid #2563eb" }} />
                ) : (
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "19px", color: "#fff" }}>
                    {avatarLetter}
                  </div>
                )}
                <label style={{ position: "absolute", bottom: "-2px", right: "-2px", width: "19px", height: "19px", background: "#1f2937", border: "1.5px solid #090d14", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px" }} title="Change photo">
                  {uploadingAvatar ? "⏳" : "📷"}
                  <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
                </label>
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15.5px", color: "#f9fafb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profile?.username || "Habiticker"}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {session.user.email}
                </div>
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
              {profile?.is_premium && (
                <span style={{
                  fontSize: "9px",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  background: profile?.is_lifetime ? "linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)" : "#1f2937",
                  color: "#fff",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  border: profile?.is_lifetime ? "1px solid #60a5fa" : "1px solid #374151"
                }}>
                  {profile?.is_lifetime ? `FOUNDER #${profile?.user_number || "?"} ✦` : "PREMIUM"}
                </span>
              )}
              <span style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#f97316",
                background: "rgba(249, 115, 22, 0.08)",
                border: "1px solid rgba(249, 115, 22, 0.2)",
                padding: "2px 7px",
                borderRadius: "5px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#f97316" }}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                {currentStreak}d
              </span>
              <span style={{
                fontSize: "11px",
                color: "#60a5fa",
                fontWeight: 600,
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                padding: "2px 7px",
                borderRadius: "5px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#60a5fa" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                {shields}/{maxShields}
              </span>
            </div>
          </div>

          {/* Navigation Links (Desktop) */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4b5563", marginBottom: "8px", paddingLeft: "4px" }}>
              Settings
            </div>
            {desktopTabsConfig.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`pm-nav-btn ${tab === t.id ? "active" : ""}`}
              >
                <div className="pm-nav-icon">{t.icon}</div>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Bottom Actions */}
          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                background: "transparent",
                color: "#9ca3af",
                fontWeight: 600,
                fontSize: "12.5px",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign out
            </button>
            <button
              onClick={() => setShowDeleteConfirm1(true)}
              style={{
                width: "100%",
                padding: "7px 12px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                color: "#ef4444",
                fontWeight: 500,
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                opacity: 0.8
              }}
            >
              Delete account
            </button>
          </div>
        </div>

        {/* MAIN CONTENT WRAPPER */}
        <div className="pm-content-wrapper">
          {/* MOBILE HEADER */}
          <div className="pm-mobile-header">
            <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "18px", color: "#f9fafb" }}>
              Settings
            </h2>
            <button onClick={onClose} className="pm-close-btn">✕</button>
          </div>

          {/* MOBILE TAB BAR (Untouched 4-tabs on mobile) */}
          <div className="pm-mobile-tabs">
            {mobileTabsConfig.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`pm-mobile-tab-btn ${(tab === t.id || (t.id === "account" && tab === "view")) ? "active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* DESKTOP CONTENT HEADER */}
          <div className="pm-desktop-header">
            <div>
              <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "21px", color: "#f9fafb", letterSpacing: "-0.01em" }}>
                {currentDesktopTabObj.label}
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#6b7280" }}>
                {currentDesktopTabObj.subtitle}
              </p>
            </div>
            <button onClick={onClose} className="pm-close-btn" title="Close (Esc)">✕</button>
          </div>

          {/* SCROLLABLE CONTENT BODY */}
          <div className="pm-content-body">
            {/* Mobile-only avatar row */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }} className="pm-mobile-only">
              <div style={{ position: "relative", flexShrink: 0 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover", border: "2px solid #2563eb" }} />
                ) : (
                  <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: "#fff" }}>
                    {avatarLetter}
                  </div>
                )}
                <label style={{ position: "absolute", bottom: "-2px", right: "-2px", width: "20px", height: "20px", background: "#374151", border: "1.5px solid #111827", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px" }}>
                  {uploadingAvatar ? "⏳" : "📷"}
                  <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
                </label>
              </div>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "16px", color: "#f9fafb" }}>
                  {profile?.username || "No username yet"}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px", marginBottom: "4px" }}>
                  {session.user.email}
                </div>
                {avatarUrl && (
                  <button onClick={removeAvatar} style={{ background: "none", border: "none", color: "#ef4444", fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {/* ── ACCOUNT TAB ── */}
            {tab === "account" && (
              <div>
                {/* Profile & Email Card */}
                <div className="pm-card">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                    {/* Username */}
                    <div>
                      <span className="pm-label">Username</span>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <input
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          className="pm-input"
                          placeholder="e.g. john_doe"
                          onKeyDown={e => e.key === "Enter" && saveUsername()}
                        />
                        <button onClick={saveUsername} disabled={savingUsername} className="pm-btn-primary" style={{ flexShrink: 0 }}>
                          {savingUsername ? "..." : "Save"}
                        </button>
                      </div>
                      <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "6px" }}>
                        Letters, numbers, underscores · min 3 chars
                      </div>
                      {usernameErr && <div style={{ color: "#f87171", fontSize: "12.5px", marginTop: "4px" }}>{usernameErr}</div>}
                    </div>

                    {/* Email */}
                    <div>
                      <span className="pm-label">Email Address</span>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <input
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          type="email"
                          className="pm-input"
                          placeholder={session.user.email || "New email"}
                        />
                        <button onClick={saveEmail} disabled={savingEmail} className="pm-btn-primary" style={{ flexShrink: 0 }}>
                          {savingEmail ? "..." : "Update"}
                        </button>
                      </div>
                      <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "6px" }}>
                        Current: <span style={{ color: "#9ca3af" }}>{session.user.email}</span>
                      </div>
                      {emailErr && <div style={{ color: "#f87171", fontSize: "12.5px", marginTop: "4px" }}>{emailErr}</div>}
                      {emailMsg && <div style={{ color: "#10b981", fontSize: "12.5px", marginTop: "4px" }}>{emailMsg}</div>}
                    </div>
                  </div>
                </div>

                {/* Mobile-only Dashboard Preferences inside Account Tab */}
                <div className="pm-card pm-mobile-only">
                  <span className="pm-label" style={{ marginBottom: "10px" }}>Dashboard Preferences</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#d1d5db", marginBottom: "6px" }}>Habit View Filter</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => onChangeShowTodayOnly(false)}
                          style={{
                            flex: 1,
                            height: "36px",
                            borderRadius: "8px",
                            border: "1px solid",
                            borderColor: !showTodayOnly ? "#3b82f6" : "#1f2937",
                            background: !showTodayOnly ? "rgba(59, 130, 246, 0.12)" : "#080b11",
                            color: !showTodayOnly ? "#60a5fa" : "#6b7280",
                            fontWeight: 600,
                            fontSize: "12.5px",
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
                            height: "36px",
                            borderRadius: "8px",
                            border: "1px solid",
                            borderColor: showTodayOnly ? "#3b82f6" : "#1f2937",
                            background: showTodayOnly ? "rgba(59, 130, 246, 0.12)" : "#080b11",
                            color: showTodayOnly ? "#60a5fa" : "#6b7280",
                            fontWeight: 600,
                            fontSize: "12.5px",
                            cursor: "pointer",
                            fontFamily: "inherit"
                          }}
                        >
                          Scheduled Only
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#d1d5db", marginBottom: "6px" }}>Routine View Filter</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => onChangeHideEmptyRoutines(false)}
                          style={{
                            flex: 1,
                            height: "36px",
                            borderRadius: "8px",
                            border: "1px solid",
                            borderColor: !hideEmptyRoutines ? "#3b82f6" : "#1f2937",
                            background: !hideEmptyRoutines ? "rgba(59, 130, 246, 0.12)" : "#080b11",
                            color: !hideEmptyRoutines ? "#60a5fa" : "#6b7280",
                            fontWeight: 600,
                            fontSize: "12.5px",
                            cursor: "pointer",
                            fontFamily: "inherit"
                          }}
                        >
                          All Routines
                        </button>
                        <button
                          onClick={() => onChangeHideEmptyRoutines(true)}
                          style={{
                            flex: 1,
                            height: "36px",
                            borderRadius: "8px",
                            border: "1px solid",
                            borderColor: hideEmptyRoutines ? "#3b82f6" : "#1f2937",
                            background: hideEmptyRoutines ? "rgba(59, 130, 246, 0.12)" : "#080b11",
                            color: hideEmptyRoutines ? "#60a5fa" : "#6b7280",
                            fontWeight: 600,
                            fontSize: "12.5px",
                            cursor: "pointer",
                            fontFamily: "inherit"
                          }}
                        >
                          Hide Empty
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security & Password Card (Full Width / Whole Line) */}
                <div className="pm-card">
                  <span className="pm-label">Security & Password</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "14px" }}>
                    <div>
                      <input
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        type="password"
                        className="pm-input"
                        placeholder="New password (min 8 characters)"
                      />
                    </div>
                    <div>
                      <input
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        type="password"
                        className="pm-input"
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>
                  {pwErr && <div style={{ color: "#f87171", fontSize: "12.5px", marginBottom: "10px" }}>{pwErr}</div>}
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={savePassword} disabled={savingPw} className="pm-btn-primary">
                      {savingPw ? "Updating..." : "Change Password"}
                    </button>
                    <button
                      onClick={sendResetLink}
                      disabled={resetSent}
                      style={{
                        height: "42px",
                        padding: "0 16px",
                        borderRadius: "10px",
                        border: "1px solid #1f2937",
                        background: resetSent ? "#064e3b" : "transparent",
                        color: resetSent ? "#6ee7b7" : "#9ca3af",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: resetSent ? "default" : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {resetSent ? "✓ Reset Link Sent" : "Send Password Reset Link"}
                    </button>
                  </div>
                </div>

                {/* Device Pairing Card */}
                <div className="pm-card" style={{ background: "rgba(37, 99, 235, 0.04)", borderColor: "rgba(59, 130, 246, 0.18)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                    <div style={{ flex: 1, minWidth: "260px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 700, fontSize: "14.5px", color: "#f9fafb" }}>Device Pairing & QR Login</span>
                        <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", fontWeight: 700 }}>
                          🔒 E2EE Encrypted
                        </span>
                      </div>
                      <p style={{ fontSize: "12.5px", color: "#9ca3af", lineHeight: 1.45, margin: 0 }}>
                        Pair and log in immediately on a new browser or computer using a secure QR code.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowQrScanner(true)}
                      className="pm-btn-primary"
                      style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
                      Scan QR Code to Pair
                    </button>
                  </div>
                </div>

                {/* Welcome Onboarding & Setup Guide */}
                <div className="pm-card" style={{ marginBottom: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                    <div style={{ flex: 1, minWidth: "240px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 700, fontSize: "14.5px", color: "#f9fafb" }}>Welcome Onboarding Tour</span>
                      </div>
                      <p style={{ fontSize: "12.5px", color: "#9ca3af", lineHeight: 1.45, margin: 0 }}>
                        Revisit the introduction walkthrough, routine groupings, and streak shield guide.
                      </p>
                    </div>
                    <button
                      onClick={() => onRedoOnboarding && onRedoOnboarding()}
                      style={{
                        height: "42px",
                        padding: "0 18px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        background: "rgba(255, 255, 255, 0.04)",
                        color: "#f3f4f6",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.15s"
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"; }}
                    >
                      <span>⚡</span> Redo Onboarding
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── VIEW & PREFERENCES TAB (Dedicated for Desktop) ── */}
            {tab === "view" && (
              <div>
                {/* Habit Filter Card */}
                <div className="pm-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div>
                      <span className="pm-label">Habit List View</span>
                      <h3 style={{ margin: 0, fontSize: "16px", color: "#f9fafb", fontWeight: 700 }}>Daily Habit Filter</h3>
                    </div>
                    <span style={{ fontSize: "11.5px", color: "#60a5fa", fontWeight: 600, background: "rgba(59, 130, 246, 0.1)", padding: "3px 10px", borderRadius: "999px" }}>
                      {!showTodayOnly ? "Showing All Habits" : "Scheduled Only"}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.5, margin: "0 0 16px" }}>
                    Choose whether to display all active habits on your main dashboard, or filter to exclusively show habits that are scheduled for today.
                  </p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => onChangeShowTodayOnly(false)}
                      style={{
                        flex: 1,
                        height: "42px",
                        borderRadius: "10px",
                        border: "1px solid",
                        borderColor: !showTodayOnly ? "#3b82f6" : "#1f2937",
                        background: !showTodayOnly ? "rgba(59, 130, 246, 0.14)" : "#080b11",
                        color: !showTodayOnly ? "#60a5fa" : "#6b7280",
                        fontWeight: 600,
                        fontSize: "13.5px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s"
                      }}
                    >
                      Show All Habits
                    </button>
                    <button
                      onClick={() => onChangeShowTodayOnly(true)}
                      style={{
                        flex: 1,
                        height: "42px",
                        borderRadius: "10px",
                        border: "1px solid",
                        borderColor: showTodayOnly ? "#3b82f6" : "#1f2937",
                        background: showTodayOnly ? "rgba(59, 130, 246, 0.14)" : "#080b11",
                        color: showTodayOnly ? "#60a5fa" : "#6b7280",
                        fontWeight: 600,
                        fontSize: "13.5px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s"
                      }}
                    >
                      Scheduled Only
                    </button>
                  </div>
                </div>

                {/* Routine Filter Card */}
                <div className="pm-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div>
                      <span className="pm-label">Routine List View</span>
                      <h3 style={{ margin: 0, fontSize: "16px", color: "#f9fafb", fontWeight: 700 }}>Empty Routines Visibility</h3>
                    </div>
                    <span style={{ fontSize: "11.5px", color: "#60a5fa", fontWeight: 600, background: "rgba(59, 130, 246, 0.1)", padding: "3px 10px", borderRadius: "999px" }}>
                      {!hideEmptyRoutines ? "Showing All Routines" : "Hiding Empty"}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.5, margin: "0 0 16px" }}>
                    Choose whether to display all routines in your routine group list, or automatically hide empty routine containers that currently have no habits assigned.
                  </p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => onChangeHideEmptyRoutines(false)}
                      style={{
                        flex: 1,
                        height: "42px",
                        borderRadius: "10px",
                        border: "1px solid",
                        borderColor: !hideEmptyRoutines ? "#3b82f6" : "#1f2937",
                        background: !hideEmptyRoutines ? "rgba(59, 130, 246, 0.14)" : "#080b11",
                        color: !hideEmptyRoutines ? "#60a5fa" : "#6b7280",
                        fontWeight: 600,
                        fontSize: "13.5px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s"
                      }}
                    >
                      Show All Routines
                    </button>
                    <button
                      onClick={() => onChangeHideEmptyRoutines(true)}
                      style={{
                        flex: 1,
                        height: "42px",
                        borderRadius: "10px",
                        border: "1px solid",
                        borderColor: hideEmptyRoutines ? "#3b82f6" : "#1f2937",
                        background: hideEmptyRoutines ? "rgba(59, 130, 246, 0.14)" : "#080b11",
                        color: hideEmptyRoutines ? "#60a5fa" : "#6b7280",
                        fontWeight: 600,
                        fontSize: "13.5px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s"
                      }}
                    >
                      Hide Empty Routines
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── SHIELDS TAB ── */}
            {tab === "shields" && (
              <div>
                {/* Shields Status Card */}
                <div className="pm-card" style={{ background: "linear-gradient(135deg, rgba(22, 31, 48, 0.5) 0%, rgba(17, 24, 39, 0.4) 100%)", borderColor: "rgba(59, 130, 246, 0.15)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                    <div style={{
                      width: "50px",
                      height: "50px",
                      borderRadius: "14px",
                      background: "rgba(59, 130, 246, 0.12)",
                      border: "1px solid rgba(59, 130, 246, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "'Syne', sans-serif" }}>Streak Shields</h3>
                      <div style={{ fontSize: "13px", color: "#60a5fa", fontWeight: 600, marginTop: "2px" }}>
                        {shields} / {maxShields} Available {profile?.is_premium ? "(Premium Max 5)" : "(Free Max 3 · Upgrade for 5)"}
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: "0 0 16px", fontSize: "13.5px", color: "#9ca3af", lineHeight: 1.5 }}>
                    Streak Shields automatically protect your active habit streak when you miss a day. Shields are automatically awarded every <strong>5 perfect days</strong>.
                  </p>

                  {/* Progress bar */}
                  <div style={{ background: "rgba(0, 0, 0, 0.3)", borderRadius: "12px", padding: "14px 16px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "#d1d5db", fontWeight: 600, marginBottom: "8px" }}>
                      <span>Progress to Next Shield</span>
                      <span style={{ color: "#60a5fa", fontWeight: 700 }}>{progressToNextShield} / 5 Perfect Days</span>
                    </div>
                    <div style={{ height: "7px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "linear-gradient(90deg, #2563eb, #60a5fa)", width: `${(progressToNextShield / 5) * 100}%`, borderRadius: "999px", transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                </div>

                {/* Shield Rules in 3 Cards */}
                <span className="pm-label">How Shields Work</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div className="pm-card" style={{ marginBottom: 0, padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f3f4f6", fontWeight: 700, fontSize: "13.5px", marginBottom: "6px" }}>
                      <span style={{ color: "#60a5fa" }}>✦</span> Automated Rewards
                    </div>
                    <div style={{ fontSize: "12.5px", color: "#9ca3af", lineHeight: 1.45 }}>
                      Complete all scheduled habits on any given day. Every 5 total perfect days awards 1 shield.
                    </div>
                  </div>

                  <div className="pm-card" style={{ marginBottom: 0, padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f3f4f6", fontWeight: 700, fontSize: "13.5px", marginBottom: "6px" }}>
                      <span style={{ color: "#60a5fa" }}>✦</span> Non-Consecutive
                    </div>
                    <div style={{ fontSize: "12.5px", color: "#9ca3af", lineHeight: 1.45 }}>
                      Perfect days do not need to be consecutive. Missed days will never reset your counter.
                    </div>
                  </div>

                  <div className="pm-card" style={{ marginBottom: 0, padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f3f4f6", fontWeight: 700, fontSize: "13.5px", marginBottom: "6px" }}>
                      <span style={{ color: "#60a5fa" }}>✦</span> Auto Protection
                    </div>
                    <div style={{ fontSize: "12.5px", color: "#9ca3af", lineHeight: 1.45 }}>
                      Shields are consumed automatically when you miss a day, preserving your streak and XP.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS TAB ── */}
            {tab === "notifications" && (
              <div>
                <div className="pm-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", color: "#f9fafb", fontWeight: 700 }}>Push Notifications</h3>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#9ca3af", lineHeight: 1.4 }}>
                        Receive reminder alerts for scheduled routines and habits directly on your device.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleNotifications}
                      disabled={savingNotifications}
                      style={{
                        width: "48px",
                        height: "28px",
                        borderRadius: "999px",
                        background: notificationsEnabled ? "#2563eb" : "#374151",
                        position: "relative",
                        cursor: "pointer",
                        border: "none",
                        transition: "background 0.2s",
                        opacity: savingNotifications ? 0.7 : 1,
                        flexShrink: 0,
                        marginLeft: "16px"
                      }}
                    >
                      <div style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: "3px",
                        left: notificationsEnabled ? "23px" : "3px",
                        transition: "left 0.2s ease"
                      }} />
                    </button>
                  </div>

                  {!('serviceWorker' in navigator) && (
                    <div style={{ marginTop: "14px", padding: "12px", borderRadius: "10px", background: "#7f1d1d20", border: "1px solid #f8717130", color: "#f87171", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12" y1="17" y2="17" /></svg>
                      <span>Your browser doesn't support service workers. Notifications may not work.</span>
                    </div>
                  )}

                  {notificationsEnabled && Notification.permission === 'denied' && (
                    <div style={{ marginTop: "14px", padding: "12px", borderRadius: "10px", background: "#7f1d1d20", border: "1px solid #f8717130", color: "#f87171", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12" y1="17" y2="17" /></svg>
                      <span>Notifications are blocked by your browser. Please allow notifications in site settings.</span>
                    </div>
                  )}
                </div>

                <div className="pm-card" style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.5 }}>
                  <p style={{ margin: "0 0 6px" }}>• Notifications trigger based on custom scheduled habit reminder times.</p>
                  <p style={{ margin: "0 0 6px" }}>• Works when the web app is closed in supported browsers or PWA mode.</p>
                  <p style={{ margin: 0 }}>• <strong>iOS Note:</strong> Add HabiTick to your iPhone/iPad Home Screen first to enable Apple Web Push.</p>
                </div>
              </div>
            )}

            {/* ── BILLING TAB ── */}
            {tab === "billing" && (
              <BillingTab profile={profile} session={session} showToast={showToast} onUpgrade={onUpgrade} />
            )}

            {/* Mobile bottom actions */}
            <div style={{ borderTop: "1px solid #1f2937", marginTop: "20px", paddingTop: "14px", paddingBottom: "20px", display: "flex", flexDirection: "column", gap: "8px" }} className="pm-mobile-only">
              <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                Sign out
              </button>
              <button onClick={() => setShowDeleteConfirm1(true)} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                Delete account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Step 1 */}
      {showDeleteConfirm1 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "380px", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.7)" }}>
            <div style={{ display: "flex", justifyContent: "center", color: "#ef4444", marginBottom: "16px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12" y1="17" y2="17" /></svg>
            </div>
            <h2 style={{ margin: "0 0 10px", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: "#f9fafb" }}>Delete your account?</h2>
            <p style={{ color: "#9ca3af", fontSize: "13.5px", lineHeight: 1.6, marginBottom: "24px" }}>This will permanently delete all your habits, routines, journal entries, and progress. <strong style={{ color: "#f87171" }}>This cannot be undone.</strong></p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={() => { setShowDeleteConfirm1(false); setShowDeleteConfirm2(true); }} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "1px solid #7f1d1d", background: "#7f1d1d30", color: "#f87171", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>
                Yes, I want to delete my account
              </button>
              <button onClick={() => setShowDeleteConfirm1(false)} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>
                Cancel, keep my account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Step 2 */}
      {showDeleteConfirm2 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 30000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "380px", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.7)" }}>
            <div style={{ display: "flex", justifyContent: "center", color: "#ef4444", marginBottom: "16px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" /></svg>
            </div>
            <h2 style={{ margin: "0 0 10px", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: "#f9fafb" }}>Are you absolutely sure?</h2>
            <p style={{ color: "#9ca3af", fontSize: "13.5px", lineHeight: 1.6, marginBottom: "20px" }}>Type <strong style={{ color: "#f87171" }}>DELETE</strong> below to confirm.</p>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE here"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: `1px solid ${deleteConfirmText === "DELETE" ? "#f87171" : "#374151"}`, background: "#080b11", color: "#f9fafb", fontSize: "15px", fontFamily: "inherit", textAlign: "center", boxSizing: "border-box", outline: "none", letterSpacing: "0.05em", marginBottom: "16px" }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: deleteConfirmText === "DELETE" ? "#dc2626" : "#374151", color: deleteConfirmText === "DELETE" ? "#fff" : "#6b7280", fontWeight: 700, fontSize: "14px", cursor: deleteConfirmText === "DELETE" ? "pointer" : "default", fontFamily: "inherit", opacity: deletingAccount ? 0.7 : 1 }}
              >
                {deletingAccount ? "Deleting..." : "Permanently delete everything"}
              </button>
              <button onClick={() => { setShowDeleteConfirm2(false); setDeleteConfirmText(""); }} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner */}
      {showQrScanner && (
        <QrScannerModal
          onClose={() => setShowQrScanner(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
}