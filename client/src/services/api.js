// client/src/services/api.js

import axios from "axios";

/**
 * SINGLE SOURCE OF TRUTH HTTP CLIENT
 * All requests in the app must go through this file.
 */

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * REQUEST INTERCEPTOR
 * Attach auth token automatically
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * RESPONSE INTERCEPTOR
 * Normalize ALL responses
 */
api.interceptors.response.use(
  (response) => {
    // ALWAYS return ONLY payload
    return response.data;
  },
  (error) => {
    const normalizedError = {
      message: error?.response?.data?.message || "Network error",
      status: error?.response?.status,
      data: error?.response?.data,
    };

    // Optional: auto logout on 401
    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
    }

    return Promise.reject(normalizedError);
  }
);

/**
 * CORE HTTP METHODS
 * Use these everywhere instead of axios or apiClient
 */
export const http = {
  get: (url, config) => api.get(url, config),
  post: (url, data, config) => api.post(url, data, config),
  put: (url, data, config) => api.put(url, data, config),
  patch: (url, data, config) => api.patch(url, data, config),
  delete: (url, config) => api.delete(url, config),
};

export default http;
