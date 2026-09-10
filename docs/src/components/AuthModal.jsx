import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { setSharedAuthCookie, getSharedAuthCookie } from '../lib/sso.js';

export function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  // 1. Google OAuth (matches main HabiTick habit tracker)
  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (oauthErr) throw oauthErr;
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  // 2. Email/Password (Sign In, Sign Up, or Password Reset)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password
        });
        if (signUpErr) throw signUpErr;
        if (data.session) {
          setSharedAuthCookie(data.session);
          if (onAuthSuccess) onAuthSuccess(data.session);
          onClose();
        } else {
          setMessage('Account created! Please check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else if (mode === 'signin') {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInErr) throw signInErr;
        if (data.session) {
          setSharedAuthCookie(data.session);
          if (onAuthSuccess) onAuthSuccess(data.session);
          onClose();
        }
      } else if (mode === 'forgot') {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin
        });
        if (resetErr) throw resetErr;
        setMessage('Password reset link sent — check your email inbox.');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Magic Link fallback
  const handleMagicLink = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: magicErr } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (magicErr) throw magicErr;
      setMessage('✨ Magic login link sent to your email! Click it to sign in.');
    } catch (err) {
      setError(err.message || 'Failed to send magic link.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Quick Cross-App Handoff (if user is active on app.habitick.app)
  const handleSyncFromMainApp = async () => {
    setLoading(true);
    setError(null);

    // 1. Try reading shared cookie first right now
    const cookieSso = getSharedAuthCookie();
    if (cookieSso?.refresh_token) {
      try {
        let res = null;
        if (cookieSso.access_token) {
          res = await supabase.auth.setSession({
            access_token: cookieSso.access_token,
            refresh_token: cookieSso.refresh_token
          });
        }
        if (!res?.data?.session) {
          res = await supabase.auth.refreshSession({
            refresh_token: cookieSso.refresh_token
          });
        }
        if (res?.data?.session) {
          setSharedAuthCookie(res.data.session);
          if (onAuthSuccess) onAuthSuccess(res.data.session);
          onClose();
          return;
        }
      } catch (e) {
        console.warn('Cookie SSO direct attempt warning:', e);
      }
    }

    const mainAppBase = window.location.hostname === 'localhost' 
      ? 'http://localhost:5173' 
      : 'https://app.habitick.app';

    // 2. Try fast popup SSO (doesn't navigate away, instantaneous 100ms sync)
    const popupUrl = `${mainAppBase}/?sso_popup=true`;
    let popup = null;
    try {
      popup = window.open(popupUrl, 'ht_sso_sync', 'width=460,height=560,menubar=no,toolbar=no,location=no');
    } catch (e) {
      popup = null;
    }

    if (popup) {
      let resolved = false;
      const handleMessage = async (event) => {
        if (event.data?.type === 'HT_SSO_SESSION' && event.data.refresh_token) {
          resolved = true;
          window.removeEventListener('message', handleMessage);
          try {
            let res = null;
            if (event.data.access_token) {
              res = await supabase.auth.setSession({
                access_token: event.data.access_token,
                refresh_token: event.data.refresh_token
              });
            }
            if (!res?.data?.session) {
              res = await supabase.auth.refreshSession({
                refresh_token: event.data.refresh_token
              });
            }
            if (res?.data?.session) {
              setSharedAuthCookie(res.data.session);
              if (onAuthSuccess) onAuthSuccess(res.data.session);
              onClose();
            } else {
              setError('Failed to establish session from HabiTick.');
            }
          } catch (err) {
            setError('Failed to establish session from HabiTick.');
          } finally {
            setLoading(false);
          }
        }
      };
      window.addEventListener('message', handleMessage);

      // Check if popup was closed by user
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          if (!resolved) {
            // Check cookie one last time in case popup wrote the cookie
            const lateCookie = getSharedAuthCookie();
            if (lateCookie?.refresh_token) {
              supabase.auth.refreshSession({ refresh_token: lateCookie.refresh_token }).then(({ data }) => {
                if (data?.session) {
                  setSharedAuthCookie(data.session);
                  if (onAuthSuccess) onAuthSuccess(data.session);
                  onClose();
                } else {
                  setLoading(false);
                }
              }).catch(() => setLoading(false));
            } else {
              setLoading(false);
            }
          }
        }
      }, 300);

      // Safety fallback: if popup doesn't finish within 4 seconds, fallback to full-page redirect
      setTimeout(() => {
        if (!resolved && !popup.closed) {
          popup.close();
          window.removeEventListener('message', handleMessage);
          window.location.href = `${mainAppBase}/?return_to_docs=true`;
        }
      }, 4000);

      return;
    }

    // 3. Fallback if popup blocked by browser
    window.location.href = `${mainAppBase}/?return_to_docs=true`;
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 6, 11, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '430px',
          background: '#0d1117',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6), 0 0 35px rgba(37, 99, 235, 0.1)',
          padding: '28px',
          boxSizing: 'border-box',
          color: '#f9fafb',
          position: 'relative'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img 
              src="/habitick-blue-logo.png" 
              alt="HabiTick Logo" 
              style={{ width: '36px', height: '36px', borderRadius: '9px', objectFit: 'contain' }}
            />
            <div>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, fontFamily: "'Syne', -apple-system, sans-serif", letterSpacing: '-0.02em', color: '#ffffff' }}>
                {mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Reset Password' : 'Sign in to HabiTick'}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                {mode === 'signup' ? 'Join HabiTick & start encrypting your notes' : mode === 'forgot' ? 'Enter your email to receive recovery link' : 'Sync notes across HabiTick and Docs'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '6px 10px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '12.5px',
            marginBottom: '16px',
            lineHeight: 1.4
          }}>
            {error}
          </div>
        )}

        {/* Success Alert */}
        {message && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#4ade80',
            fontSize: '12.5px',
            marginBottom: '16px',
            lineHeight: 1.4
          }}>
            {message}
          </div>
        )}

        {/* Continue with Google (Primary OAuth method from main app) */}
        {mode !== 'forgot' && (
          <>
            <button
              onClick={handleGoogle}
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: 'rgba(31, 41, 55, 0.5)',
                color: '#f3f4f6',
                fontWeight: 600,
                fontSize: '13.5px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.18s ease',
                boxSizing: 'border-box'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(31, 41, 55, 0.85)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(31, 41, 55, 0.5)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Quick sync button for users already active on app.habitick.app */}
            <button
              onClick={handleSyncFromMainApp}
              title="Already signed in on app.habitick.app? Click to synchronize instantly"
              style={{
                marginTop: '8px',
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                background: 'rgba(37, 99, 235, 0.08)',
                color: '#60a5fa',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.16)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.45)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.25)';
              }}
            >
              <span>⚡</span>
              <span>Logged in on HabiTick? One-Click Sync</span>
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
              <span style={{ color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                or email
              </span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
            </div>
          </>
        )}

        {/* Email Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '5px' }}>
              Email address
            </label>
            <input 
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '11px 13px',
                borderRadius: '9px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(17, 24, 39, 0.6)',
                color: '#ffffff',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af' }}>
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setMessage(null); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3b82f6',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 500
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input 
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '11px 13px',
                  borderRadius: '9px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(17, 24, 39, 0.6)',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
              />
            </div>
          )}

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '4px',
              padding: '11px',
              borderRadius: '9px',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '13.5px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#1d4ed8'; }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#2563eb'; }}
          >
            {loading ? 'Processing...' : (mode === 'signup' ? 'Create Free Account' : mode === 'forgot' ? 'Send Password Reset Link' : 'Sign In')}
          </button>

          {/* Magic Link Button */}
          {mode !== 'forgot' && (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              style={{
                padding: '9px',
                borderRadius: '9px',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#9ca3af',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f3f4f6'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
            >
              Send Magic Link ✨
            </button>
          )}
        </form>

        {/* Switch mode links */}
        <div style={{ marginTop: '16px', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '14px' }}>
          {mode === 'forgot' ? (
            <button
              onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              ← Back to Sign In
            </button>
          ) : (
            <button
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError(null);
                setMessage(null);
              }}
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              {mode === 'signup' ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
            </button>
          )}
        </div>

        {/* Offline Guest Option */}
        <div style={{ marginTop: '10px', textAlign: 'center' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              fontSize: '11.5px',
              cursor: 'pointer'
            }}
          >
            Continue offline as Guest (saves locally)
          </button>
        </div>
      </div>
    </div>
  );
}
