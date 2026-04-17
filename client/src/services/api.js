// client/src/services/api.js

import axios from "axios";

/**
 * SINGLE SOURCE OF TRUTH HTTP CLIENT
 * ALL requests MUST go through here
 */

const BASE_URL =
  (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

// IMPORTANT:
// Ensure we NEVER double-append /api
const API_BASE = BASE_URL.endsWith("/api")
  ? BASE_URL
  : `${BASE_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Attach token
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Normalize response
 */
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    return Promise.reject({
      message:
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Network error",
      status: error?.response?.status,
      data: error?.response?.data,
    });
  }
);

export default api;
