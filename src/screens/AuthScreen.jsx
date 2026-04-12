import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { S } from '../utils/constants.js';
import { getTodayStr } from '../utils/helpers.js';

export function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handle = async () => {
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        try {
          const userId = data?.user?.id;
          if (userId) {
            await supabase.from("profiles").upsert({ id: userId, initial_shields: 1, initial_shields_granted_at: getTodayStr(), updated_at: new Date().toISOString() });
          }
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
  });

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap'); html, body, #root { margin: 0; padding: 0; width: 100%; min-height: 100vh; } * { box-sizing: border-box; } button,input { font-family: inherit; }`}</style>
      <div style={{ width: "380px", maxWidth: "90vw" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <img src="/vite.svg" alt="HabiTick Logo" style={{ width: "36px", height: "36px", marginBottom: "8px", display: "block", marginLeft: "auto", marginRight: "auto", objectFit: "contain" }} />
          <div style={{ fontWeight: 800, fontSize: "24px", color: "#f9fafb" }}>HabiTick</div>
          <div style={{ color: "#6b7280", fontSize: "14px", marginTop: "4px" }}>
            {mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}
          </div>
        </div>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
          {mode !== "forgot" && !isWebView && (
            <>
              <button onClick={handleGoogle} style={{ ...S.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "20px" }}>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Continue with Google
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <div style={{ flex: 1, height: "1px", background: "#1f2937" }} />
                <span style={{ color: "#4b5563", fontSize: "12px" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "#1f2937" }} />
              </div>
            </>
          )}
          <label style={S.label}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com"
            style={{ ...S.input, marginBottom: "14px" }} onKeyDown={e => e.key === "Enter" && handle()} />
          {mode !== "forgot" && (
            <>
              <label style={S.label}>Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••"
                style={{ ...S.input, marginBottom: mode === "signin" ? "6px" : "18px" }} onKeyDown={e => e.key === "Enter" && handle()} />
              {mode === "signin" && (
                <div style={{ textAlign: "right", marginBottom: "18px" }}>
                  <button onClick={() => { setMode("forgot"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: "12px", cursor: "pointer", padding: 0 }}>Forgot password?</button>
                </div>
              )}
            </>
          )}
          {error && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}
          {message && <div style={{ color: "#34d399", fontSize: "13px", marginBottom: "12px", textAlign: "center" }}>{message}</div>}
          <button onClick={handle} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.7 : 1 }}>
            {loading ? "..." : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </button>
          <div style={{ textAlign: "center", marginTop: "18px", fontSize: "13px", color: "#6b7280" }}>
            {mode === "signin" && <>No account? <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 600, padding: 0 }}>Sign up</button></>}
            {mode === "signup" && <>Have an account? <button onClick={() => { setMode("signin"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 600, padding: 0 }}>Sign in</button></>}
            {mode === "forgot" && <button onClick={() => { setMode("signin"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 600, padding: 0 }}>Back to sign in</button>}
          </div>
        </div>
      </div>
    </div>
  );
}