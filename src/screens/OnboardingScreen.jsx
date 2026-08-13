import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { getTodayStr } from '../utils/helpers.js';

export function OnboardingScreen({ session, profile, onComplete, onClose }) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(profile?.username || "");
  const [usernameErr, setUsernameErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const uploadAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setUsernameErr("Image must be under 2MB"); return; }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setUsernameErr("Upload failed"); setUploadingAvatar(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl + "?t=" + Date.now());
    setUploadingAvatar(false);
  };

  const handleSave = async () => {
    setUsernameErr("");
    if (username.length < 3) { setUsernameErr("Must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setUsernameErr("Letters, numbers and underscores only"); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      username: username.trim(),
      avatar_url: avatarUrl || null,
      initial_shields: 1,
      initial_shields_granted_at: getTodayStr(),
      updated_at: new Date().toISOString(),
    }).eq("id", session.user.id);
    if (error?.message?.includes("unique")) { setUsernameErr("Username already taken"); setSaving(false); return; }
    if (error) { setUsernameErr(error.message); setSaving(false); return; }
    setSaving(false);
    setStep(2);
  };

  return (
    <div className="ob-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        
        .ob-container {
          min-height: 100vh;
          width: 100%;
          background: #080b11;
          background-image: 
            radial-gradient(at 50% 0%, rgba(37, 99, 235, 0.12) 0px, transparent 60%),
            radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.06) 0px, transparent 50%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Sans', system-ui, sans-serif;
          padding: 24px;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }

        .ob-ambient-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, rgba(0,0,0,0) 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 1;
        }

        .ob-card {
          width: 100%;
          max-width: 480px;
          background: rgba(13, 17, 23, 0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 36px 32px;
          box-shadow: 0 32px 64px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
          position: relative;
          z-index: 2;
          animation: obFadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-sizing: border-box;
        }

        @keyframes obFadeUp {
          from { opacity: 0; transform: translateY(14px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .ob-logo-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 14px 6px 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          margin-bottom: 20px;
        }

        .ob-logo-img {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          object-fit: contain;
        }

        .ob-logo-text {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 13px;
          color: #f3f4f6;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .ob-title {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 27px;
          line-height: 1.25;
          color: #f9fafb;
          margin: 0 0 10px;
          letter-spacing: -0.02em;
        }

        .ob-subtitle {
          color: #9ca3af;
          font-size: 14.5px;
          line-height: 1.55;
          margin: 0 0 24px;
        }

        .ob-features-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 26px;
        }

        .ob-feature-row {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 14px;
          text-align: left;
          transition: background 0.15s, border-color 0.15s;
        }

        .ob-feature-row:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.08);
        }

        .ob-feature-icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          background: rgba(37, 99, 235, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
          color: #60a5fa;
        }

        .ob-feature-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #f3f4f6;
          margin-bottom: 2px;
        }

        .ob-feature-desc {
          font-size: 12px;
          color: #9ca3af;
          line-height: 1.4;
        }

        .ob-btn-primary {
          width: 100%;
          height: 48px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
          color: #fff;
          font-weight: 700;
          font-size: 14.5px;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .ob-btn-primary:hover {
          background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.45);
        }

        .ob-btn-primary:active {
          transform: translateY(0);
        }

        .ob-btn-ghost {
          width: 100%;
          height: 40px;
          margin-top: 8px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: #6b7280;
          font-weight: 600;
          font-size: 13.5px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
        }

        .ob-btn-ghost:hover {
          color: #9ca3af;
          background: rgba(255, 255, 255, 0.03);
        }

        .ob-input {
          width: 100%;
          height: 46px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid #1f2937;
          background: #080b11;
          color: #f9fafb;
          font-size: 14.5px;
          font-family: inherit;
          box-sizing: border-box;
          outline: none;
          transition: all 0.2s ease;
        }

        .ob-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
          background: #0b0f17;
        }

        .ob-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #9ca3af;
          border-radius: 10px;
          width: 32px;
          height: 32px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          transition: all 0.15s ease;
          z-index: 10;
        }

        .ob-close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
      `}</style>

      <div className="ob-ambient-glow" />

      {onClose && (
        <button onClick={onClose} className="ob-close-btn" title="Exit (Esc)">
          ✕
        </button>
      )}

      {/* ── STEP 0: WELCOME & VALUE OVERVIEW ── */}
      {step === 0 && (
        <div className="ob-card">
          <div style={{ textAlign: "center" }}>
            {/* Flush Logo Badge */}
            <div className="ob-logo-badge">
              <img src="/habitick-blue-logo.png" alt="HabiTick" className="ob-logo-img" />
              <span className="ob-logo-text">HabiTick</span>
            </div>

            <h1 className="ob-title">Build habits that stick</h1>
            <p className="ob-subtitle">
              The modern habit tracker designed for relentless consistency, smart routines, and zero fluff.
            </p>

            {/* Feature Highlights */}
            <div className="ob-features-grid">
              <div className="ob-feature-row">
                <div className="ob-feature-icon">⚡</div>
                <div>
                  <div className="ob-feature-title">Smart Routines</div>
                  <div className="ob-feature-desc">Stack habits into structured morning and evening flows for effortless momentum.</div>
                </div>
              </div>

              <div className="ob-feature-row">
                <div className="ob-feature-icon">🛡️</div>
                <div>
                  <div className="ob-feature-title">Streak Shields</div>
                  <div className="ob-feature-desc">Earn auto-protect shields every 5 perfect days so a missed day never breaks your streak.</div>
                </div>
              </div>

              <div className="ob-feature-row">
                <div className="ob-feature-icon">🔒</div>
                <div>
                  <div className="ob-feature-title">Encrypted Device Pairing</div>
                  <div className="ob-feature-desc">Scan a QR code on any computer or mobile browser to pair instantly with zero setup.</div>
                </div>
              </div>
            </div>

            <button onClick={() => setStep(1)} className="ob-btn-primary">
              Get Started →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 1: PROFILE SETUP ── */}
      {step === 1 && (
        <div className="ob-card">
          <div style={{ textAlign: "center", marginBottom: "26px" }}>
            <div className="ob-logo-badge">
              <img src="/habitick-blue-logo.png" alt="HabiTick" className="ob-logo-img" />
              <span className="ob-logo-text">Profile Setup</span>
            </div>
            <h2 className="ob-title" style={{ fontSize: "24px" }}>Personalise your profile</h2>
            <p className="ob-subtitle" style={{ margin: "0 0 18px", fontSize: "14px" }}>
              Pick a unique handle and optionally add a profile picture.
            </p>
          </div>

          {/* Avatar Upload */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
            <label style={{ position: "relative", cursor: "pointer" }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "2.5px solid #2563eb", boxShadow: "0 8px 24px rgba(37,99,235,0.3)" }} />
              ) : (
                <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(31, 41, 55, 0.5)", border: "2px dashed rgba(255, 255, 255, 0.16)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
                  <span style={{ fontSize: "22px" }}>{uploadingAvatar ? "⏳" : "📷"}</span>
                  <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 600 }}>Add Photo</span>
                </div>
              )}
              {avatarUrl && (
                <div style={{ position: "absolute", bottom: 0, right: 0, width: "24px", height: "24px", borderRadius: "50%", background: "#2563eb", border: "2px solid #0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#fff" }}>
                  📷
                </div>
              )}
              <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ color: "#9ca3af", fontSize: "12px", display: "block", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Username <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. alex_rivera"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="ob-input"
              style={{ borderColor: usernameErr ? "#f87171" : undefined }}
            />
            <div style={{ fontSize: "11.5px", color: "#6b7280", marginTop: "6px" }}>Letters, numbers, underscores · min 3 characters</div>
            {usernameErr && <div style={{ color: "#f87171", fontSize: "12.5px", marginTop: "6px" }}>{usernameErr}</div>}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || username.trim().length < 3}
            className="ob-btn-primary"
            style={{
              opacity: (saving || username.trim().length < 3) ? 0.6 : 1,
              cursor: (saving || username.trim().length < 3) ? "not-allowed" : "pointer"
            }}
          >
            {saving ? "Saving..." : "Continue →"}
          </button>
          <button onClick={() => setStep(0)} className="ob-btn-ghost">
            ← Back
          </button>
        </div>
      )}

      {/* ── STEP 2: ALL SET & QUICK TIPS ── */}
      {step === 2 && (
        <div className="ob-card">
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              color: "#10b981",
              marginBottom: "16px"
            }}>
              ✓
            </div>

            <h2 className="ob-title" style={{ fontSize: "25px" }}>You're ready, {username}!</h2>
            <p className="ob-subtitle" style={{ margin: "0 0 20px" }}>
              Your account is active with <strong>1 free Streak Shield</strong> loaded into your inventory.
            </p>

            <div className="ob-features-grid">
              <div className="ob-feature-row">
                <div className="ob-feature-icon" style={{ background: "rgba(16, 185, 129, 0.12)", borderColor: "rgba(16, 185, 129, 0.25)", color: "#10b981" }}>
                  1
                </div>
                <div>
                  <div className="ob-feature-title">Add your core daily habits</div>
                  <div className="ob-feature-desc">Start with 1 to 3 essential habits to build positive momentum early.</div>
                </div>
              </div>

              <div className="ob-feature-row">
                <div className="ob-feature-icon" style={{ background: "rgba(59, 130, 246, 0.12)", borderColor: "rgba(59, 130, 246, 0.25)", color: "#60a5fa" }}>
                  2
                </div>
                <div>
                  <div className="ob-feature-title">Lock in perfect days</div>
                  <div className="ob-feature-desc">Check off all scheduled habits on any given day to progress toward additional shields.</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => onComplete(data));
              }}
              className="ob-btn-primary"
            >
              {onClose ? "Return to Dashboard →" : "Open Dashboard →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}