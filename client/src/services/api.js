import axios from "axios";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

/**
 * REQUEST: attach token
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * RESPONSE: DO NOT over-transform (prevents hidden bugs)
 */
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const error = {
      message:
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err.message ||
        "Network error",
      status: err?.response?.status,
      data: err?.response?.data,
    };

    if (error.status === 401) {
      localStorage.removeItem("token");
    }

    return Promise.reject(error);
  }
);

export default api;
