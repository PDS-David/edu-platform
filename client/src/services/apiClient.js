import axios from 'axios';
import { getToken, setToken, clearToken } from '../utils/token';

/**
 * apiClient.js  —  AUTH-004 / AUTH-005
 *
 * - Attaches in-memory access token as Bearer header
 * - On 401, attempts one silent token refresh via POST /auth/refresh
 *   (refresh token travels automatically in the HttpOnly cookie)
 * - If refresh fails, clears local state and redirects to /login
 */

const RAW_BASE = import.meta.env.VITE_API_URL || 'https://aischoolonair-api.onrender.com';
const normalised = RAW_BASE.replace(/\/$/, '');
const API_BASE_URL = normalised.endsWith('/api') ? normalised : normalised + '/api';

const apiClient = axios.create({
  baseURL:         API_BASE_URL,
  timeout:         90000,
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

// ─── Response: silent refresh on 401 ─────────────────────────────────────────
let _refreshPromise = null; // deduplicate concurrent refresh calls

apiClient.interceptors.response.use(
  // Normalise successful responses
  (response) => ({
    data:    response.data?.data    ?? response.data,
    success: response.data?.success,
    meta:    response.data?.meta    ?? null,
    total:   response.data?.total   ?? null,
    count:   response.data?.count   ?? null,
    message: response.data?.message ?? null,
    status:  response.status,
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
      }
    }

    return Promise.reject({
      message:
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error.message ||
        'Request failed',
      status: error?.response?.status || 0,
      raw:    error,
    });
  }
);

export default apiClient;
