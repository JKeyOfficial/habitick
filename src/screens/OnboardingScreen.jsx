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

  const fadeUp = { animation: "fadeUp 0.4s ease forwards" };

  if (step === 0) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600;700;800&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to {opacity:1;transform:translateY(0);} } * { box-sizing: border-box; }`}</style>
      <div style={{ textAlign: "center", maxWidth: "400px", width: "100%", ...fadeUp }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>⚡</div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "36px", color: "#f9fafb", margin: "0 0 14px", letterSpacing: "-0.03em" }}>Welcome to HabiTick</h1>
        <p style={{ color: "#6b7280", fontSize: "16px", lineHeight: 1.6, margin: "0 0 40px" }}>The habit tracker that grows with you.<br />Let's get you set up in 30 seconds.</p>
        <button onClick={() => setStep(1)} style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "16px", cursor: "pointer", fontFamily: "inherit" }}>Let's go →</button>
      </div>
    </div>
  );

  if (step === 1) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600;700;800&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to {opacity:1;transform:translateY(0);} } * { box-sizing: border-box; } input { outline: none; }`}</style>
      <div style={{ width: "100%", maxWidth: "400px", ...fadeUp }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>👤</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "26px", color: "#f9fafb", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Set up your profile</h2>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>Choose a username and optionally add a photo</p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <label style={{ position: "relative", cursor: "pointer" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: "88px", height: "88px", borderRadius: "50%", objectFit: "cover", border: "3px solid #2563eb" }} />
              : <div style={{ width: "88px", height: "88px", borderRadius: "50%", background: "#1f2937", border: "2px dashed #374151", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                <span style={{ fontSize: "24px" }}>{uploadingAvatar ? "⏳" : "📷"}</span>
                <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Add photo</span>
              </div>
            }
            {avatarUrl && (
              <div style={{ position: "absolute", bottom: 0, right: 0, width: "26px", height: "26px", borderRadius: "50%", background: "#2563eb", border: "2px solid #0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>📷</div>
            )}
            <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
          </label>
        </div>
        <label style={{ color: "#9ca3af", fontSize: "13px", display: "block", marginBottom: "6px" }}>Username <span style={{ color: "#f87171" }}>*</span></label>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="e.g. jacob_h"
          autoFocus
          onKeyDown={e => e.key === "Enter" && handleSave()}
          style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${usernameErr ? "#f87171" : "#374151"}`, background: "#1f2937", color: "#f9fafb", fontSize: "15px", fontFamily: "inherit", marginBottom: "6px" }}
        />
        <div style={{ fontSize: "11px", color: "#374151", marginBottom: usernameErr ? "6px" : "24px" }}>Letters, numbers and underscores · min 3 chars</div>
        {usernameErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "16px" }}>{usernameErr}</div>}
        <button onClick={handleSave} disabled={saving || !username.trim()} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: username.trim().length >= 3 ? "#2563eb" : "#1f2937", color: username.trim().length >= 3 ? "#fff" : "#4b5563", fontWeight: 700, fontSize: "15px", cursor: username.trim().length >= 3 ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Continue →"}
        </button>
        <button onClick={() => setStep(0)} style={{ width: "100%", marginTop: "10px", padding: "12px", borderRadius: "12px", border: "none", background: "transparent", color: "#4b5563", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600;700;800&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to {opacity:1;transform:translateY(0);} } @keyframes pop { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} } * { box-sizing: border-box; }`}</style>
      <div style={{ textAlign: "center", maxWidth: "400px", width: "100%", ...fadeUp }}>
        <div style={{ fontSize: "72px", marginBottom: "20px", animation: "pop 0.5s ease forwards" }}>🎉</div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "30px", color: "#f9fafb", margin: "0 0 10px", letterSpacing: "-0.02em" }}>You're all set, {username}!</h2>
        <p style={{ color: "#6b7280", fontSize: "15px", lineHeight: 1.6, margin: "0 0 24px" }}>Time to build your first habit.<br />Start small — one habit changes everything.</p>
        <div style={{ textAlign: "left", background: "#0d1117", border: "1px solid #1f2937", padding: "12px", borderRadius: "10px", marginBottom: "20px" }}>
          <div style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "8px" }}>Quick tips</div>
          <div style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "8px" }}><strong>Routine</strong>: Group habits into routines (morning, evening, etc.) to check several items at once and build momentum.</div>
          <div style={{ color: "#9ca3af", fontSize: "13px" }}><strong>Shields</strong>: You start with one shield — each shield protects one missed day so your streak doesn't break, but it won't increment the streak. Pro users earn shields faster (every 7 completed days vs 14 for free). Max 5 shields.</div>
        </div>
        <button
          onClick={() => {
            supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => onComplete(data));
          }}
          style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "16px", cursor: "pointer", fontFamily: "inherit" }}>
          + Add my first habit →
        </button>
      </div>
    </div>
  );

  return null;
}