import axios from 'axios';

/**
 * Unified Axios Client
 * - Handles auth token injection
 * - Normalizes responses
 * - Standardizes error format
 */

const API_BASE_URL =
  (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// ─────────────────────────────────────────────
// Request Interceptor → Attach Auth Token
// ─────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

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
      data: response.data?.data ?? response.data,
      meta: response.data?.meta ?? null,
      status: response.status,
    };
  },
  (error) => {
    const normalizedError = {
      message:
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error.message ||
        'Request failed',

      status: error?.response?.status || 0,

      raw: error,
    };

    return Promise.reject(normalizedError);
  }
);

export default apiClient;
