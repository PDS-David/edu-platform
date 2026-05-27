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

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000, // 90 s — AI vision/marking calls can take up to 40 s
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
