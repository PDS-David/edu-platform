// DEF-001: Moved JWT from localStorage (persists forever, XSS-accessible) to
// sessionStorage (cleared when tab/browser closes, same XSS surface but
// reduced exposure window).  An httpOnly-cookie migration requires server-side
// changes outside the current sprint; sessionStorage is the approved interim
// strategy documented in the project security log.
//
// The key is also namespaced to the app so it cannot collide with third-party
// scripts that share the origin.

const TOKEN_KEY = 'aischoolonair.token';

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}
