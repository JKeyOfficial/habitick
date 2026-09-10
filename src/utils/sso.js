// Cross-subdomain SSO helper for *.habitick.app
// Seamlessly shares authenticated Supabase session between app.habitick.app and docs.habitick.app

export function getSharedCookieDomain() {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  if (hostname.endsWith('habitick.app')) {
    return '.habitick.app';
  }
  return null;
}

const SSO_COOKIE_NAME = 'ht_sso_session';

/**
 * Saves current Supabase session credentials to cross-subdomain cookie.
 */
export function setSharedAuthCookie(session) {
  if (typeof document === 'undefined') return;
  const domain = getSharedCookieDomain();
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (!session?.access_token || !session?.refresh_token) {
    clearSharedAuthCookie();
    return;
  }

  try {
    const payload = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user_id: session.user?.id || null,
      email: session.user?.email || null,
      expires_at: session.expires_at || null
    });

    const encoded = encodeURIComponent(payload);
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    const secureFlag = isHttps ? '; Secure' : '';
    const sameSite = '; SameSite=Lax';

    if (domain) {
      document.cookie = `${SSO_COOKIE_NAME}=${encoded}; Domain=${domain}; Path=/; Max-Age=${maxAge}${sameSite}${secureFlag}`;
    }
    // Also set locally on current host/port for localhost or explicit scoping
    document.cookie = `${SSO_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${maxAge}${sameSite}${secureFlag}`;
  } catch (err) {
    console.warn('Could not write shared auth cookie:', err);
  }
}

/**
 * Reads shared auth cookie from *.habitick.app (or local host).
 */
export function getSharedAuthCookie() {
  if (typeof document === 'undefined') return null;
  const nameEQ = SSO_COOKIE_NAME + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) {
      try {
        const jsonStr = decodeURIComponent(c.substring(nameEQ.length));
        const data = JSON.parse(jsonStr);
        if (data && data.access_token && data.refresh_token) {
          return data;
        }
      } catch (e) {
        console.warn('Failed to parse SSO cookie:', e);
      }
    }
  }
  return null;
}

/**
 * Clears shared auth cookie across domain and local host.
 */
export function clearSharedAuthCookie() {
  if (typeof document === 'undefined') return;
  const domain = getSharedCookieDomain();
  const past = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=Lax';
  if (domain) {
    document.cookie = `${SSO_COOKIE_NAME}=; Domain=${domain}; ${past}`;
  }
  document.cookie = `${SSO_COOKIE_NAME}=; ${past}`;
}
