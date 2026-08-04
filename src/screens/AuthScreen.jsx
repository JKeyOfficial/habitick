import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase.js';
import { S } from '../utils/constants.js';
import { getTodayStr } from '../utils/helpers.js';
import { generateQrKeyPair, decryptQrPayload, deriveShortCode } from '../utils/qrCrypto.js';

export function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // E2EE QR Code Login States
  const [qrSessionId, setQrSessionId] = useState("");
  const [qrPublicKeyJwk, setQrPublicKeyJwk] = useState(null);
  const [qrShortCode, setQrShortCode] = useState("");
  const [qrTimeLeft, setQrTimeLeft] = useState(90);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrSuccess, setQrSuccess] = useState(false);

  const qrPrivateKeyRef = useRef(null);
  const qrChannelRef = useRef(null);
  const qrTimerRef = useRef(null);

  // Initialize E2EE QR Flow
  const initQrFlow = async () => {
    setQrLoading(true);
    setError("");
    setQrSuccess(false);
    setQrTimeLeft(90);

    // Clean up existing channel & timers
    if (qrChannelRef.current) {
      supabase.removeChannel(qrChannelRef.current);
      qrChannelRef.current = null;
    }
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current);
      qrTimerRef.current = null;
    }

    try {
      const sessionId = crypto.randomUUID();
      const { privateKey, publicKeyJwk } = await generateQrKeyPair();
      qrPrivateKeyRef.current = privateKey;
      
      const shortCode = deriveShortCode(sessionId);
      const shortCodeClean = shortCode.replace("-", "");
      setQrSessionId(sessionId);
      setQrPublicKeyJwk(publicKeyJwk);
      setQrShortCode(shortCode);

      // Subscribe to E2EE broadcast channel by Session ID
      const channel = supabase.channel(`qr-login-${sessionId}`, {
        config: { broadcast: { ack: true } }
      });

      // Subscribe to shortcode channel for 6-digit manual pairing fallback
      const shortChannel = supabase.channel(`qr-shortcode-${shortCodeClean}`, {
        config: { broadcast: { ack: true } }
      });

      const handlePubkeyReq = () => {
        const payload = { publicKeyJwk, sessionId, shortCode };
        channel.send({ type: 'broadcast', event: 'pubkey_response', payload });
        shortChannel.send({ type: 'broadcast', event: 'pubkey_response', payload });
      };

      const handleAuthEvent = async ({ payload }) => {
        try {
          if (!qrPrivateKeyRef.current) return;
          const decrypted = await decryptQrPayload(qrPrivateKeyRef.current, payload);
          if (decrypted && decrypted.access_token && decrypted.refresh_token) {
            setQrSuccess(true);
            const { error: sessionErr } = await supabase.auth.setSession({
              access_token: decrypted.access_token,
              refresh_token: decrypted.refresh_token
            });
            if (sessionErr) throw sessionErr;
          }
        } catch (err) {
          console.error("E2EE QR Auth decrypt error:", err);
          setError("Decryption or login failed. Please scan again.");
        }
      };

      channel.on('broadcast', { event: 'get_pubkey' }, handlePubkeyReq);
      shortChannel.on('broadcast', { event: 'get_pubkey' }, handlePubkeyReq);

      channel.on('broadcast', { event: 'e2ee_auth' }, handleAuthEvent);
      shortChannel.on('broadcast', { event: 'e2ee_auth' }, handleAuthEvent);

      await channel.subscribe();
      await shortChannel.subscribe();
      qrChannelRef.current = channel;

      // Periodically broadcast pubkey for fast scanner pickup
      const pubKeyBroadcaster = setInterval(() => {
        if (channel && shortChannel) {
          handlePubkeyReq();
        }
      }, 1200);

      // Start 90s expiration timer
      qrTimerRef.current = setInterval(() => {
        setQrTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(qrTimerRef.current);
            clearInterval(pubKeyBroadcaster);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e) {
      console.error("Failed to initialize QR auth:", e);
      setError("Failed to create secure QR session.");
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "qr") {
      initQrFlow();
    } else {
      if (qrChannelRef.current) {
        supabase.removeChannel(qrChannelRef.current);
        qrChannelRef.current = null;
      }
      if (qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
        qrTimerRef.current = null;
      }
      qrPrivateKeyRef.current = null;
    }

    return () => {
      if (qrChannelRef.current) supabase.removeChannel(qrChannelRef.current);
      if (qrTimerRef.current) clearInterval(qrTimerRef.current);
      qrPrivateKeyRef.current = null;
    };
  }, [mode]);

  const handle = async () => {
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        try {
          const userId = data?.user?.id;
          await supabase.from("profiles").update({ initial_shields: 1, initial_shields_granted_at: getTodayStr(), updated_at: new Date().toISOString() }).eq("id", userId);
        } catch (e) {
          console.warn("Could not persist initial shield:", e?.message || e);
        }
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMessage("Password reset link sent — check your email.");
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const isWebView = /wv/.test(navigator.userAgent) && /Android/.test(navigator.userAgent);
  const handleGoogle = () => supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });  // Dynamic subtitle text
  const getSubtitle = () => {
    if (mode === "signup") return "Build better habits. Built for progress.";
    if (mode === "forgot") return "Reset password to get back on track.";
    if (mode === "qr") return "Scan this code from Settings on an active device.";
    return "Welcome back. Access your daily habits and tasks.";
  };

  return (
    <div className="auth-split-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100vh;
          background: #080b11;
        }
        
        * {
          box-sizing: border-box;
        }
        
        .auth-split-wrapper {
          min-height: 100vh;
          width: 100%;
          background: #080b11;
          display: flex;
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #f3f4f6;
          position: relative;
          overflow: hidden;
        }
        
        /* Left panel (Form) */
        .auth-left-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          position: relative;
          z-index: 2;
          background: #080b11;
        }
        
        /* Right panel (Showcase) */
        .auth-right-panel {
          display: none;
          flex: 1;
          background: linear-gradient(135deg, #080b11 0%, #0c1220 50%, #17153b 100%);
          align-items: center;
          justify-content: center;
          padding: 40px;
          position: relative;
          border-left: 1px solid rgba(255, 255, 255, 0.03);
        }
        
        @media (min-width: 1024px) {
          .auth-right-panel {
            display: flex;
          }
        }
        
        /* Back Link styling */
        .auth-back-link {
          position: absolute;
          top: 24px;
          left: 24px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #4b5563;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
          z-index: 10;
        }
        
        .auth-back-link:hover {
          color: #f3f4f6;
          transform: translateX(-2px);
        }
        
        /* Glow graphics */
        .auth-ambient-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.03) 55%, transparent 70%);
          filter: blur(40px);
          pointer-events: none;
          z-index: 1;
        }
        
        .showcase-ambient-glow {
          position: absolute;
          top: 30%;
          right: 20%;
          width: 450px;
          height: 450px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.04) 50%, transparent 70%);
          filter: blur(60px);
          pointer-events: none;
          z-index: 1;
        }
        
        /* Form block */
        .auth-form-container {
          width: 100%;
          max-width: 380px;
          position: relative;
          z-index: 2;
        }
        
        .auth-logo-section {
          text-align: center;
          margin-bottom: 28px;
        }
        
        .auth-logo-img {
          width: 42px;
          height: 42px;
          margin-bottom: 12px;
          display: block;
          margin-left: auto;
          margin-right: auto;
          object-fit: contain;
          transition: transform 0.3s ease;
        }
        
        .auth-logo-img:hover {
          transform: scale(1.05) rotate(5deg);
        }
        
        .auth-title {
          margin: 0;
          font-weight: 800;
          font-size: 26px;
          color: #ffffff;
          letter-spacing: -0.5px;
        }
        
        .auth-subtitle {
          color: #9ca3af;
          font-size: 14px;
          margin-top: 6px;
          line-height: 1.4;
          height: auto;
          min-height: 40px;
          transition: all 0.3s ease;
        }
        
        /* Inputs and interactive items */
        .auth-label {
          color: #9ca3af;
          font-size: 13px;
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          text-align: left;
        }
        
        .auth-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid #1f2937;
          background: rgba(31, 41, 55, 0.4);
          color: #ffffff;
          font-size: 14px;
          box-sizing: border-box;
          font-family: inherit;
          outline: none;
          transition: all 0.2s ease;
        }
        
        .auth-input::placeholder {
          color: #4b5563;
        }
        
        .auth-input:focus {
          border-color: #3b82f6;
          background: rgba(31, 41, 55, 0.7);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        
        .auth-btn-primary {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: none;
          background: #2563eb;
          color: #ffffff;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .auth-btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }
        
        .auth-btn-primary:active:not(:disabled) {
          transform: translateY(0);
        }
        
        .auth-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .auth-btn-google {
          width: 100%;
          padding: 11px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(31, 41, 55, 0.4);
          color: #d1d5db;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s ease;
        }
        
        .auth-btn-google:hover {
          background: rgba(31, 41, 55, 0.7);
          border-color: rgba(255, 255, 255, 0.15);
          color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .auth-btn-google:active {
          transform: translateY(0);
        }
        
        .auth-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          margin-top: 20px;
        }
        
        .auth-divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
        }
        
        .auth-divider-text {
          color: #4b5563;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .auth-link-btn {
          background: none;
          border: none;
          color: #3b82f6;
          font-size: 12px;
          cursor: pointer;
          padding: 0;
          font-weight: 500;
          transition: color 0.2s ease;
        }
        
        .auth-link-btn:hover {
          color: #60a5fa;
          text-decoration: underline;
        }
        
        /* Feature Showcase Mockup Window */
        .mock-app-window {
          background: rgba(17, 24, 39, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          width: 100%;
          max-width: 520px;
          padding: 24px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.05);
          backdrop-filter: blur(16px);
          position: relative;
          z-index: 2;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .mock-app-window:hover {
          transform: translateY(-6px) scale(1.01);
          border-color: rgba(255, 255, 255, 0.12);
          box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(99, 102, 241, 0.12);
        }
        
        /* Mock App UI details */
        .mock-app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        
        .mock-app-user {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .mock-app-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 12px;
          color: white;
        }
        
        .mock-app-user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        
        .mock-app-username {
          font-size: 13px;
          font-weight: 600;
          color: #f3f4f6;
        }
        
        .mock-app-userlevel {
          font-size: 10px;
          color: #10b981;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        
        .mock-app-stats {
          display: flex;
          gap: 12px;
        }
        
        .mock-app-stat-badge {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 11px;
          color: #d1d5db;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .mock-habit-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .mock-habit-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.2s ease;
        }
        
        .mock-habit-card:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.08);
          transform: translateX(4px);
        }
        
        .mock-habit-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .mock-habit-emoji {
          font-size: 20px;
          background: rgba(255, 255, 255, 0.04);
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .mock-habit-name-wrapper {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        
        .mock-habit-name {
          font-size: 13px;
          font-weight: 600;
          color: #f3f4f6;
        }
        
        .mock-habit-streak {
          font-size: 11px;
          color: #f59e0b;
          display: flex;
          align-items: center;
          gap: 2px;
          margin-top: 2px;
        }
        
        .mock-habit-calendar {
          display: flex;
          gap: 5px;
        }
        
        .mock-day-dot {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 700;
          transition: all 0.2s ease;
        }
        
        .mock-day-dot.completed {
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.35);
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.2);
        }
        
        .mock-day-dot.completed.green {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.35);
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.2);
        }
        
        .mock-day-dot.empty {
          background: rgba(255, 255, 255, 0.02);
          color: #4b5563;
          border: 1px solid rgba(255, 255, 255, 0.04);
        }
        
        /* AI insight widget */
        .mock-ai-widget {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(139, 92, 246, 0.02) 100%);
          border: 1px solid rgba(99, 102, 241, 0.15);
          border-radius: 12px;
          padding: 14px;
          position: relative;
          overflow: hidden;
          text-align: left;
        }
        
        .mock-ai-widget-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          color: #818cf8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        
        .mock-ai-widget-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #818cf8;
          box-shadow: 0 0 8px #818cf8;
          animation: pulse-glow 2s infinite;
        }
        
        @keyframes pulse-glow {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(129, 140, 248, 0.5);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(129, 140, 248, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(129, 140, 248, 0);
          }
        }
        
        .mock-ai-widget-body {
          font-size: 12px;
          color: #cbd5e1;
          line-height: 1.4;
          margin: 0;
        }
      `}</style>

      {/* Brand navigation */}
      <a href="https://habitick.app" className="auth-back-link">
        <span>←</span> Back to home
      </a>

      {/* Left panel (Form) */}
      <div className="auth-left-panel">
        <div className="auth-ambient-glow"></div>
        <div className="auth-form-container">
          <div className="auth-logo-section">
            <img src="/vite.svg" alt="HabiTick Logo" className="auth-logo-img" />
            <h1 className="auth-title">HabiTick</h1>
            <div className="auth-subtitle">
              {getSubtitle()}
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 3 }}>
            {/* Mode: QR Code Sign-In */}
            {mode === "qr" ? (
              <div style={{ textAlign: "center", animation: "fadeIn 0.3s ease" }}>
                <div style={{
                  background: "rgba(17, 24, 39, 0.7)",
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                  borderRadius: "16px",
                  padding: "20px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(59,130,246,0.1)",
                  position: "relative",
                  marginBottom: "16px"
                }}>
                  {qrLoading ? (
                    <div style={{ padding: "40px 0", color: "#9ca3af", fontSize: "14px" }}>
                      Creating secure E2EE channel...
                    </div>
                  ) : qrTimeLeft <= 0 ? (
                    <div style={{ padding: "30px 0" }}>
                      <div style={{ color: "#ef4444", fontWeight: 700, fontSize: "15px", marginBottom: "8px" }}>QR Code Expired</div>
                      <div style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "16px" }}>For security, codes expire after 90 seconds.</div>
                      <button onClick={initQrFlow} className="auth-btn-primary" style={{ padding: "10px 20px", fontSize: "13px" }}>
                        Generate New QR Code
                      </button>
                    </div>
                  ) : qrSuccess ? (
                    <div style={{ padding: "30px 0" }}>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                        <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      </div>
                      <div style={{ color: "#10b981", fontWeight: 700, fontSize: "16px" }}>Sign-In Authorized!</div>
                      <div style={{ color: "#9ca3af", fontSize: "13px", marginTop: "4px" }}>Logging into your account...</div>
                    </div>
                  ) : (
                    <>
                      <div style={{
                        background: "#ffffff",
                        padding: "16px",
                        borderRadius: "12px",
                        display: "inline-block",
                        marginBottom: "14px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                      }}>
                        {qrSessionId && (
                          <QRCodeSVG
                            value={`ht:${qrSessionId}`}
                            size={200}
                            level="L"
                          />
                        )}
                      </div>

                      {/* 6-Digit Pairing Code Display */}
                      <div style={{
                        background: "rgba(31, 41, 55, 0.6)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "10px",
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "12px"
                      }}>
                        <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 700, textTransform: "uppercase" }}>Pairing Code:</span>
                        <span style={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 800, color: "#60a5fa", letterSpacing: "2px" }}>
                          {qrShortCode}
                        </span>
                      </div>

                      {/* Countdown Timer Bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                        <div style={{ flex: 1, height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "999px", overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            background: qrTimeLeft < 20 ? "#ef4444" : "#3b82f6",
                            width: `${(qrTimeLeft / 90) * 100}%`,
                            transition: "width 1s linear"
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", color: qrTimeLeft < 20 ? "#ef4444" : "#9ca3af", fontFamily: "monospace", fontWeight: 700 }}>
                          {qrTimeLeft}s
                        </span>
                      </div>

                      {/* Status indicator */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "12px", color: "#9ca3af", marginTop: "12px" }}>
                        <div style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#3b82f6",
                          boxShadow: "0 0 10px #3b82f6",
                          animation: "pulse-glow 1.5s infinite"
                        }} />
                        <span>🔒 Encrypted session waiting for scan...</span>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => { setMode("signin"); setError(""); setMessage(""); }}
                  className="auth-link-btn"
                  style={{ fontWeight: 600, fontSize: "13px" }}
                >
                  ← Back to Email Sign In
                </button>
              </div>
            ) : (
              <>
                {mode !== "forgot" && !isWebView && (
                  <>
                    <button onClick={handleGoogle} className="auth-btn-google">
                      <svg width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </svg>
                      Continue with Google
                    </button>

                    <button
                      onClick={() => { setMode("qr"); setError(""); setMessage(""); }}
                      className="auth-btn-google"
                      style={{ marginTop: "10px" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                      </svg>
                      Sign in with QR Code
                    </button>

                    <div className="auth-divider">
                      <div className="auth-divider-line" />
                      <span className="auth-divider-text">or</span>
                      <div className="auth-divider-line" />
                    </div>
                  </>
                )}

                <label className="auth-label">Email</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com"
                  className="auth-input" style={{ marginBottom: "16px" }} onKeyDown={e => e.key === "Enter" && handle()} />

                {mode !== "forgot" && (
                  <>
                    <label className="auth-label">Password</label>
                    <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••"
                      className="auth-input" style={{ marginBottom: mode === "signin" ? "6px" : "20px" }} onKeyDown={e => e.key === "Enter" && handle()} />
                    {mode === "signin" && (
                      <div style={{ textAlign: "right", marginBottom: "20px" }}>
                        <button onClick={() => { setMode("forgot"); setError(""); setMessage(""); }} className="auth-link-btn">Forgot password?</button>
                      </div>
                    )}
                  </>
                )}

                {error && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>{error}</div>}
                {message && <div style={{ color: "#34d399", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>{message}</div>}

                <button onClick={handle} disabled={loading} className="auth-btn-primary">
                  {loading ? "..." : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
                </button>

                <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#6b7280" }}>
                  {mode === "signin" && <>No account? <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }} className="auth-link-btn" style={{ fontWeight: 600, fontSize: '13px' }}>Sign up</button></>}
                  {mode === "signup" && <>Have an account? <button onClick={() => { setMode("signin"); setError(""); setMessage(""); }} className="auth-link-btn" style={{ fontWeight: 600, fontSize: '13px' }}>Sign in</button></>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right panel (Showcase) */}
      <div className="auth-right-panel">
        <div className="showcase-ambient-glow"></div>

        <div className="mock-app-window">
          {/* Mock App Header */}
          <div className="mock-app-header">
            <div className="mock-app-user">
              <div className="mock-app-avatar">U</div>
              <div className="mock-app-user-info">
                <span className="mock-app-username">JKeyOfficial</span>
                <span className="mock-app-userlevel">LEVEL 4</span>
              </div>
            </div>
            <div className="mock-app-stats">
              <div className="mock-app-stat-badge">
                <span>🛡️</span>
                <span>4/5 Shields</span>
              </div>
              <div className="mock-app-stat-badge">
                <span>⚡</span>
                <span>280 XP</span>
              </div>
            </div>
          </div>

          {/* Mock Habits List */}
          <div className="mock-habit-list">
            {/* Habit 1 */}
            <div className="mock-habit-card">
              <div className="mock-habit-info">
                <div className="mock-habit-emoji">🧘</div>
                <div className="mock-habit-name-wrapper">
                  <span className="mock-habit-name">Morning Meditation</span>
                  <span className="mock-habit-streak">🔥 14 day streak</span>
                </div>
              </div>
              <div className="mock-habit-calendar">
                <div className="mock-day-dot completed green">M</div>
                <div className="mock-day-dot completed green">T</div>
                <div className="mock-day-dot completed green">W</div>
                <div className="mock-day-dot completed green">T</div>
                <div className="mock-day-dot completed green">F</div>
                <div className="mock-day-dot empty">S</div>
                <div className="mock-day-dot empty">S</div>
              </div>
            </div>

            {/* Habit 2 */}
            <div className="mock-habit-card">
              <div className="mock-habit-info">
                <div className="mock-habit-emoji">📚</div>
                <div className="mock-habit-name-wrapper">
                  <span className="mock-habit-name">Read 15 Pages</span>
                  <span className="mock-habit-streak">🔥 8 day streak</span>
                </div>
              </div>
              <div className="mock-habit-calendar">
                <div className="mock-day-dot completed">M</div>
                <div className="mock-day-dot completed">T</div>
                <div className="mock-day-dot completed">W</div>
                <div className="mock-day-dot empty">T</div>
                <div className="mock-day-dot empty">F</div>
                <div className="mock-day-dot empty">S</div>
                <div className="mock-day-dot empty">S</div>
              </div>
            </div>

            {/* Habit 3 */}
            <div className="mock-habit-card">
              <div className="mock-habit-info">
                <div className="mock-habit-emoji">💻</div>
                <div className="mock-habit-name-wrapper">
                  <span className="mock-habit-name">Coding Practice</span>
                  <span className="mock-habit-streak">🔥 27 day streak</span>
                </div>
              </div>
              <div className="mock-habit-calendar">
                <div className="mock-day-dot completed green">M</div>
                <div className="mock-day-dot completed green">T</div>
                <div className="mock-day-dot completed green">W</div>
                <div className="mock-day-dot completed green">T</div>
                <div className="mock-day-dot completed green">F</div>
                <div className="mock-day-dot empty">S</div>
                <div className="mock-day-dot empty">S</div>
              </div>
            </div>
          </div>

          {/* AI Coach Insights Mockup */}
          <div className="mock-ai-widget">
            <div className="mock-ai-widget-header">
              <div className="mock-ai-widget-pulse"></div>
              <span>AI Coach Insight</span>
            </div>
            <p className="mock-ai-widget-body">
              "Your completion rate is up 12% this week! Shields are fully charged. Keep up the meditation streak, it directly correlates with your morning task efficiency."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}