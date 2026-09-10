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

const COOKIE_RT = 'ht_sso_rt';
const COOKIE_AT = 'ht_sso_at';

/**
 * Saves Supabase session credentials to cross-subdomain cookies.
 * Splits into dedicated tokens to strictly stay below the 4096-byte browser limit.
 */
export function setSharedAuthCookie(session) {
  if (typeof document === 'undefined') return;
  const domain = getSharedCookieDomain();
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (!session?.refresh_token) {
    return;
  }

  try {
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    const secureFlag = isHttps ? '; Secure' : '';
    const sameSite = '; SameSite=Lax';

    const rt = session.refresh_token;
    const at = session.access_token || '';

    // Refresh token is tiny (~60 bytes) - 100% reliable across all browsers
    const rtBase = `${COOKIE_RT}=${encodeURIComponent(rt)}; Path=/; Max-Age=${maxAge}${sameSite}${secureFlag}`;
    const atBase = `${COOKIE_AT}=${encodeURIComponent(at)}; Path=/; Max-Age=${maxAge}${sameSite}${secureFlag}`;

    if (domain) {
      document.cookie = `${rtBase}; Domain=${domain}`;
      document.cookie = `${atBase}; Domain=${domain}`;
    } else {
      document.cookie = rtBase;
      document.cookie = atBase;
    }
  } catch (err) {
    console.warn('Could not write shared auth cookie:', err);
  }
}

/**
 * Reads shared auth tokens from *.habitick.app (or local host).
 */
export function getSharedAuthCookie() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  let rt = null;
  let at = null;

  for (let i = 0; i < cookies.length; i++) {
    const c = cookies[i].trim();
    if (c.startsWith(COOKIE_RT + '=')) {
      rt = decodeURIComponent(c.substring(COOKIE_RT.length + 1));
    } else if (c.startsWith(COOKIE_AT + '=')) {
      at = decodeURIComponent(c.substring(COOKIE_AT.length + 1));
    }
  }

  if (rt) {
    return {
      refresh_token: rt,
      access_token: at || ''
    };
  }
  return null;
}

/**
 * Clears shared auth cookies across domain and local host.
 */
export function clearSharedAuthCookie() {
  if (typeof document === 'undefined') return;
  const domain = getSharedCookieDomain();
  const past = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=Lax';

  if (domain) {
    document.cookie = `${COOKIE_RT}=; Domain=${domain}; ${past}`;
    document.cookie = `${COOKIE_AT}=; Domain=${domain}; ${past}`;
    document.cookie = `${COOKIE_RT}=; Domain=habitick.app; ${past}`;
    document.cookie = `${COOKIE_AT}=; Domain=habitick.app; ${past}`;
    document.cookie = `ht_sso_session=; Domain=${domain}; ${past}`;
    document.cookie = `ht_sso_session=; Domain=habitick.app; ${past}`;
  }
  document.cookie = `${COOKIE_RT}=; ${past}`;
  document.cookie = `${COOKIE_AT}=; ${past}`;
  document.cookie = `ht_sso_session=; ${past}`;
}
