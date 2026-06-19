// DEF-001: Reads token from sessionStorage (via token.js) instead of raw localStorage.
// DEF-005: Global timeout reduced from 90 s → 15 s. Per-request overrides documented below.
// Session expiry: 401 responses now clear the token and redirect to /login instead of
//                 silently dropping (previously: Promise.reject with no side effect).

import axios from "axios";
import { getToken, clearToken } from "../utils/token";

const RAW_BASE =
  import.meta.env.VITE_API_URL ||
  "https://aischoolonair-api.onrender.com";

const normalised = RAW_BASE.replace(/\/$/, "");
const API_BASE_URL = normalised.endsWith("/api")
  ? normalised
  : normalised + "/api";

// ── Timeout constants (ms) — import these in callers for per-request overrides ──
export const TIMEOUT_DASHBOARD  = 10_000;  //  10 s — summary/metric cards
export const TIMEOUT_ANALYTICS  = 15_000;  //  15 s — heavier aggregations
export const TIMEOUT_DEFAULT    = 15_000;  //  15 s — standard API calls
export const TIMEOUT_AI         = 60_000;  //  60 s — AI vision/marking

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: TIMEOUT_DEFAULT, // DEF-005: was 90_000
});

// ── Request → attach auth token ───────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken(); // DEF-001: reads from sessionStorage via token.js
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response → normalise shape + handle 401 ───────────────────────────────────
apiClient.interceptors.response.use(
  (response) => ({
    data:         response.data?.data    ?? response.data,
    success:      response.data?.success,
    meta:         response.data?.meta    ?? null,
    total:        response.data?.total   ?? null,
    count:        response.data?.count   ?? null,
    message:      response.data?.message ?? null,
    // DEF-002: pass through pagination fields from notification + other
    // paginated endpoints so callers can read them without unwrapping twice.
    unread_count: response.data?.unread_count ?? null,
    pagination:   response.data?.pagination   ?? null,
    status:       response.status,
  }),
  (error) => {
    const status = error?.response?.status;

    // DEF-001 / Session expiry: when the JWT is rejected, clear storage and
    // redirect so the student sees the login page instead of blank cards.
    if (status === 401) {
      clearToken();
      // Only redirect if we're not already on an auth page
      if (!window.location.pathname.startsWith("/login") &&
          !window.location.pathname.startsWith("/register")) {
        window.location.href = "/login";
      }
    }

    const normalizedError = {
      message:
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error.message ||
        "Request failed",
      status: status || 0,
      raw: error,
    };

    return Promise.reject(normalizedError);
  }
);

export default apiClient;
