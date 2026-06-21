// token.js  —  AUTH-004 / DEF-001
//
// Access tokens live in memory (_memToken) — never in localStorage — so XSS
// cannot steal them across page loads.  sessionStorage is used as a tab-local
// fallback so a hard page-refresh within the same tab doesn't immediately log
// the user out (the refresh flow is triggered on app boot if the in-memory
// token is gone but sessionStorage has one).
//
// Refresh tokens are stored server-side in an HttpOnly Secure cookie set by
// the API; the client never touches them directly.

const SESSION_KEY = '__aso_at__'; // access-token key in sessionStorage

// In-memory store (fastest; cleared on tab close / navigation away)
let _memToken = null;

export function setToken(token) {
  _memToken = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {}
}

export function getToken() {
  if (_memToken) return _memToken;
  // Recover from page reload within same tab
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) { _memToken = stored; return stored; }
  } catch {}
  return null;
}

export function clearToken() {
  _memToken = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}
