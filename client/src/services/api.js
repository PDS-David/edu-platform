import axios from "axios";

const API_BASE =
  (import.meta.env.VITE_API_URL || "http://localhost:5000")
    .replace(/\/$/, "");

/**
 * IMPORTANT:
 * backend already uses /api prefix in Express routes
 */
const api = axios.create({
  baseURL: API_BASE,
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
 * DO NOT unwrap data aggressively (prevents hidden bugs)
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalizedError = {
      message:
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Network error",
      status: error?.response?.status,
      data: error?.response?.data,
    };

    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
    }

    return Promise.reject(normalizedError);
  }
);

/**
 * SINGLE EXPORT (SOURCE OF TRUTH)
 */
export default api;
