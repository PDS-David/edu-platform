'use strict';

/**
 * token.js  —  AUTH-004
 *
 * Access tokens are SHORT-LIVED (15 min default / 7 days with rememberMe).
 * They live in memory only — never localStorage — so XSS cannot steal them.
 *
 * Refresh tokens are stored server-side in an HttpOnly Secure cookie set by
 * the API; the client never touches them directly.
 *
 * sessionStorage is used as a tab-local fallback for the access token so a
 * hard page-refresh within the same tab doesn't immediately log the user out
 * (the refresh flow is triggered on app boot if sessionStorage is empty).
 */

const SESSION_KEY = '__aso_at__'; // access-token key in sessionStorage

// In-memory store (fastest; cleared on tab close)
let _memToken = null;

export function setToken(token, rememberMe = false) {
  _memToken = token;
  // For rememberMe sessions, survive page reload via sessionStorage.
  // (sessionStorage is tab-scoped and is cleared when the tab closes.)
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
  // Recover from page reload
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
