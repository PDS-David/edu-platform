import axios from "axios";

/**
 * Unified Axios Client
 * - Enforces /api prefix
 * - Handles auth token
 * - Normalizes responses
 * - Auto-corrects stale VITE_API_URL pointing to old eacbuddy-api domain
 */

const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// If the env var still points to the old domain, rewrite it to the correct one
const CORRECTED_BASE = RAW_BASE.replace(
  /https?:\/\/eacbuddy-api\.onrender\.com/,
  "https://aischoolonair-api.onrender.com"
);

// Always strip trailing slash, then ensure /api suffix (but don't double-add it)
const normalised = CORRECTED_BASE.replace(/\/$/, "");
const API_BASE_URL = normalised.endsWith("/api")
  ? normalised
  : normalised + "/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// ─────────────────────────────────────────────
// Request Interceptor → Attach Auth Token
// ─────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─────────────────────────────────────────────
// Response Interceptor → Normalize Responses
// ─────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    return {
      data:    response.data?.data    ?? response.data,
      success: response.data?.success,
      meta:    response.data?.meta    ?? null,
      total:   response.data?.total   ?? null,
      count:   response.data?.count   ?? null,
      message: response.data?.message ?? null,
      status:  response.status,
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
