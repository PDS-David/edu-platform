import axios from "axios";

/**
 * Unified Axios Client
 * - Enforces /api prefix (but not double-adding it)
 * - Handles auth token
 * - Normalizes responses
 */

// VITE_API_URL must point to the live API server.
// Set this in the Render dashboard → aischoolonair (frontend) → Environment.
const RAW_BASE =
  import.meta.env.VITE_API_URL ||
  "https://aischoolonair-api.onrender.com";

// Strip trailing slash, then ensure /api suffix (don't double-add)
const normalised = RAW_BASE.replace(/\/$/, "");
const API_BASE_URL = normalised.endsWith("/api")
  ? normalised
  : normalised + "/api";

// Default timeout applies to most requests (dashboard-class calls).
// Use the `timeout` option on individual calls to override per request, e.g.:
//   api.get('/analytics/summary', { timeout: TIMEOUTS.analytics })
//   api.post('/exports/transcript', payload, { timeout: TIMEOUTS.export })
export const TIMEOUTS = {
  dashboard: 8000,    // 5-10s — dashboard summary cards, weak topics, sessions
  analytics: 12000,   // 10-15s — heavier aggregation queries
  export: 60000,      // long-running exports (transcripts, reports) — configure per call
  default: 8000,
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: TIMEOUTS.default,
  // DEF-001: the auth token now also lives in an HttpOnly cookie set by the
  // server. withCredentials makes the browser send/receive that cookie on
  // cross-origin requests (server's CORS config already sets
  // credentials:true + an explicit origin allow-list, required for this to
  // work at all — a wildcard CORS origin would reject cookies outright).
  withCredentials: true,
});

// ─────────────────────────────────────────────
// Request Interceptor
// ─────────────────────────────────────────────
// DEF-001: previously read the JWT out of localStorage and attached it as
// an Authorization header — a token in localStorage is readable by any JS
// running on the page (XSS exposure). The token now lives only in an
// HttpOnly cookie set by the server on login/register, which JavaScript
// cannot read at all; the browser attaches it automatically because the
// client is created with withCredentials: true. Nothing to do here anymore
// for browser sessions — kept as a pass-through so request config can still
// be extended per-call (e.g. the `timeout` overrides used elsewhere).
apiClient.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// ─────────────────────────────────────────────
// Response Interceptor → Normalize Responses
// ─────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    return {
      data:         response.data?.data    ?? response.data,
      success:      response.data?.success,
      meta:         response.data?.meta    ?? null,
      total:        response.data?.total   ?? null,
      count:        response.data?.count   ?? null,
      message:      response.data?.message ?? null,
      unread_count: response.data?.unread_count ?? null,
      pagination:   response.data?.pagination   ?? null,
      status:       response.status,
    };
  },
  (error) => {
    const normalizedError = {
      message:
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error.message ||
        "Request failed",

      status: error?.response?.status || 0,
      raw: error,
    };

    return Promise.reject(normalizedError);
  }
);

export default apiClient;
