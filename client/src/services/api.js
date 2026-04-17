/**
 * client/src/services/api.js
 * ─────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH HTTP CLIENT (DO NOT DUPLICATE)
 */

import axios from "axios";

const BASE_URL =
  (import.meta.env.VITE_API_URL || "http://localhost:5000") // NOTE: no /api here
    .replace(/\/$/, "");

/**
 * IMPORTANT:
 * Backend already mounts /api in Express routes.
 * So we append /api here centrally.
 */
const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * REQUEST INTERCEPTOR
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * RESPONSE INTERCEPTOR
 * Normalize shape consistently:
 * return { data, status }
 */
api.interceptors.response.use(
  (response) => {
    return {
      data: response.data?.data ?? response.data,
      status: response.status,
    };
  },
  (error) => {
    const normalizedError = {
      message:
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Network error",
      status: error?.response?.status,
      raw: error,
    };

    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
    }

    return Promise.reject(normalizedError);
  }
);

export default api;
