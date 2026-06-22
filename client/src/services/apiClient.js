// apiClient.js  —  AUTH-004 / AUTH-005 / DEF-001 / DEF-005
//
// DEF-001: Token read via token.js (in-memory + sessionStorage) instead of raw localStorage.
// DEF-005: Global timeout reduced from 90 s → 15 s. Per-request overrides exported below.
// AUTH-004: On 401, attempts one silent token refresh via POST /auth/refresh
//           (refresh token travels automatically in the HttpOnly cookie).
// AUTH-005: If refresh fails, clears local state and redirects to /login.

import axios from 'axios';
import { getToken, setToken, clearToken } from '../utils/token';

const RAW_BASE = import.meta.env.VITE_API_URL || 'https://aischoolonair-api.onrender.com';
const normalised = RAW_BASE.replace(/\/$/, '');
const API_BASE_URL = normalised.endsWith('/api') ? normalised : normalised + '/api';

// ── Timeout constants (ms) — import these in callers for per-request overrides ──
export const TIMEOUT_DASHBOARD  = 10_000;  //  10 s — summary/metric cards
export const TIMEOUT_ANALYTICS  = 15_000;  //  15 s — heavier aggregations
export const TIMEOUT_DEFAULT    = 15_000;  //  15 s — standard API calls (DEF-005: was 90 s)
export const TIMEOUT_AI         = 60_000;  //  60 s — AI vision/marking

const apiClient = axios.create({
  baseURL:         API_BASE_URL,
  timeout:         TIMEOUT_DEFAULT,
  withCredentials: true,   // send HttpOnly refresh cookie on every request
});

// ─── Request: attach access token ────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response: normalise shape + silent refresh on 401 ───────────────────────
let _refreshPromise = null; // deduplicate concurrent refresh calls

apiClient.interceptors.response.use(
  // Normalise successful responses
  (response) => ({
    data:    response.data?.data    ?? response.data,
    success: response.data?.success,
    meta:    response.data?.meta    ?? null,
    total:        response.data?.total ?? response.data?.meta?.total ?? null,
    count:        response.data?.count         ?? null,
    message:      response.data?.message       ?? null,
    // DEF-002: pagination fields (notification endpoint + future paginated routes)
    unread_count: response.data?.unread_count  ?? null,
    pagination:   response.data?.pagination    ?? null,
    // Admin endpoints that return top-level fields outside a .data wrapper.
    // Hoisting them here means frontend code can read res.sent / res.inserted
    // directly without knowing whether the server wrapped them or not.
    sent:         response.data?.sent          ?? null,
    inserted:     response.data?.inserted      ?? null,
    already_exists: response.data?.already_exists ?? null,
    httpStatus:   response.status, // unambiguous HTTP code (avoids collision with
    status:       response.status, // business-logic status strings in res.data)
  }),

  async (error) => {
    const original = error.config;

    // Attempt refresh only on 401, only once per request, not for the refresh call itself
    if (
      error?.response?.status === 401 &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;

      try {
        // Deduplicate if multiple requests 401 simultaneously
        if (!_refreshPromise) {
          _refreshPromise = axios.post(
            `${API_BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true }
          ).finally(() => { _refreshPromise = null; });
        }

        const refreshRes = await _refreshPromise;
        const newToken   = refreshRes.data?.token;

        if (newToken) {
          setToken(newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(original); // retry original request
        }
      } catch {
        // Refresh failed — log the user out
        clearToken();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    // 401 with no refresh path (login page, refresh endpoint itself, etc.)
    if (error?.response?.status === 401) {
      clearToken();
      if (!window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject({
      message:
        error?.response?.data?.error   ||
        error?.response?.data?.message ||
        error.message                  ||
        'Request failed',
      status: error?.response?.status || 0,
      raw:    error,
    });
  }
);

export default apiClient;
