import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { getTodayStr } from '../utils/helpers.js';

export function OnboardingScreen({ session, onComplete }) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [usernameErr, setUsernameErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
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
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      username: username.trim(),
      avatar_url: avatarUrl || null,
      initial_shields: 1,
      initial_shields_granted_at: getTodayStr(),
      updated_at: new Date().toISOString(),
    });
    if (error?.message?.includes("unique")) { setUsernameErr("Username already taken"); setSaving(false); return; }
    if (error) { setUsernameErr(error.message); setSaving(false); return; }
    setSaving(false);
    setStep(2);
  };

  const fadeUp = { animation: "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards" };

  const containerStyle = {
    minHeight: "100vh",
    width: "100%",
    background: "radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(124, 58, 237, 0.06) 0%, transparent 50%), #0d1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: "24px",
    position: "relative",
    overflow: "hidden"
  };

  const styleBlock = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700;800&display=swap');
      
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes pop {
        0% { transform: scale(0.6); opacity: 0; }
        70% { transform: scale(1.05); }
        100% { transform: scale(1); opacity: 1; }
      }
      
      * { box-sizing: border-box; }
      input { outline: none; }
      
      .onboarding-card {
        width: 100%;
        max-width: 440px;
        background: transparent;
        padding: 0px;
        border-radius: 0px;
        border: none;
      }
      
      @media (min-width: 640px) {
        .onboarding-card {
          background: rgba(17, 24, 39, 0.45);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 40px;
          border-radius: 24px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        }
      }
      
      .btn-primary {
        width: 100%;
        padding: 15px;
        border-radius: 12px;
        border: none;
        background: #2563eb;
        color: #fff;
        font-weight: 700;
        font-size: 16px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s ease;
      }
      
      .btn-primary:hover {
        background: #1d4ed8;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
      }
      
      .btn-primary:active {
        transform: translateY(0);
      }
      
      .btn-secondary {
        width: 100%;
        margin-top: 10px;
        padding: 12px;
        border-radius: 12px;
        border: none;
        background: transparent;
        color: #6b7280;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s ease;
      }
      
      .btn-secondary:hover {
        color: #9ca3af;
        background: rgba(255, 255, 255, 0.03);
      }
      
      .tip-box {
        text-align: left;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        padding: 16px;
        border-radius: 14px;
        margin-bottom: 24px;
      }
      
      .input-field {
        width: 100%;
        padding: 14px 16px;
        border-radius: 12px;
        background: rgba(31, 41, 55, 0.6);
        color: #f9fafb;
        font-size: 15px;
        font-family: inherit;
        transition: all 0.2s ease;
      }
      
      .input-field:focus {
        background: rgba(31, 41, 55, 0.9);
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.4);
      }
    `}</style>
  );

  if (step === 0) return (
    <div style={containerStyle}>
      {styleBlock}
      <div className="onboarding-card" style={fadeUp}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "20px", display: "inline-block" }}>⚡</div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "36px", color: "#f9fafb", margin: "0 0 14px", letterSpacing: "-0.03em" }}>Welcome to HabiTick</h1>
          <p style={{ color: "#9ca3af", fontSize: "16px", lineHeight: 1.6, margin: "0 0 40px" }}>The habit tracker that grows with you.<br />Let's get you set up in 30 seconds.</p>
          <button onClick={() => setStep(1)} className="btn-primary">Let's go →</button>
        </div>
      </div>
    </div>
  );

  if (step === 1) return (
    <div style={containerStyle}>
      {styleBlock}
      <div className="onboarding-card" style={fadeUp}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>👤</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "26px", color: "#f9fafb", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Set up your profile</h2>
          <p style={{ color: "#9ca3af", fontSize: "14px", margin: 0 }}>Choose a username and optionally add a photo</p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <label style={{ position: "relative", cursor: "pointer" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: "88px", height: "88px", borderRadius: "50%", objectFit: "cover", border: "3px solid #2563eb" }} />
              : <div style={{ width: "88px", height: "88px", borderRadius: "50%", background: "rgba(31, 41, 55, 0.6)", border: "2px dashed rgba(255, 255, 255, 0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                <span style={{ fontSize: "24px" }}>{uploadingAvatar ? "⏳" : "📷"}</span>
                <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 600 }}>Add photo</span>
              </div>
            }
            {avatarUrl && (
              <div style={{ position: "absolute", bottom: 0, right: 0, width: "26px", height: "26px", borderRadius: "50%", background: "#2563eb", border: "2px solid #0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>📷</div>
            )}
            <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
          </label>
        </div>
        <label style={{ color: "#9ca3af", fontSize: "13px", display: "block", marginBottom: "6px", fontWeight: 500 }}>Username <span style={{ color: "#f87171" }}>*</span></label>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="e.g. jacob_h"
          autoFocus
          onKeyDown={e => e.key === "Enter" && handleSave()}
          className="input-field"
          style={{ border: `1px solid ${usernameErr ? "#f87171" : "rgba(255, 255, 255, 0.12)"}`, marginBottom: "6px" }}
        />
        <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: usernameErr ? "6px" : "24px" }}>Letters, numbers and underscores · min 3 chars</div>
        {usernameErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "16px" }}>{usernameErr}</div>}
        
        <button 
          onClick={handleSave} 
          disabled={saving || username.trim().length < 3} 
          className="btn-primary"
          style={{ 
            background: username.trim().length >= 3 ? "#2563eb" : "rgba(31, 41, 55, 0.4)", 
            color: username.trim().length >= 3 ? "#fff" : "#4b5563",
            cursor: username.trim().length >= 3 ? "pointer" : "not-allowed",
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? "Saving..." : "Continue →"}
        </button>
        <button onClick={() => setStep(0)} className="btn-secondary">← Back</button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={containerStyle}>
      {styleBlock}
      <div className="onboarding-card" style={fadeUp}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "72px", marginBottom: "20px", animation: "pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards" }}>🎉</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "30px", color: "#f9fafb", margin: "0 0 10px", letterSpacing: "-0.02em" }}>You're all set, {username}!</h2>
          <p style={{ color: "#9ca3af", fontSize: "15px", lineHeight: 1.6, margin: "0 0 24px" }}>Time to build your first habit.<br />Start small — one habit changes everything.</p>
          
          <div className="tip-box">
            <div style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "8px", fontSize: "14px" }}>Quick tips</div>
            <div style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "10px", lineHeight: 1.5 }}><strong>Routine</strong>: Group habits into routines (morning, evening, etc.) to check several items at once and build momentum.</div>
            <div style={{ color: "#9ca3af", fontSize: "13px", lineHeight: 1.5 }}><strong>Shields</strong>: You start with one shield — each shield protects one missed day so your streak doesn't break. Pro users earn shields faster (every 7 completed days vs 14 for free).</div>
          </div>
          
          <button
            onClick={() => {
              supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => onComplete(data));
            }}
            className="btn-primary"
          >
            + Add my first habit →
          </button>
        </div>
      </div>
    </div>
  );

  return null;
}