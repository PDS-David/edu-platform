// client/src/services/dashboardService.js
import axios from "axios";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 15000,
});

/**
 * Centralized error handler
 */
function handleError(error, fallback = null) {
  console.error("[DashboardService Error]", error?.response?.data || error.message);
  return fallback;
}

/**
 * Progress summary (Analytics Engine)
 */
async function getProgressSummary() {
  try {
    const res = await api.get("/analytics/summary");
    return res.data?.data || null;
  } catch (err) {
    return handleError(err, null);
  }
}

/**
 * Weak topics (Weak Topic Engine)
 */
async function getWeakTopics() {
  try {
    const res = await api.get("/analytics/weak-topics");
    return res.data?.data || [];
  } catch (err) {
    return handleError(err, []);
  }
}

/**
 * Recommendations (Recommendation Engine)
 * NOTE: backend route must exist: /api/recommendations
 */
async function getRecommendations() {
  try {
    const res = await api.get("/recommendations");
    return res.data?.data || [];
  } catch (err) {
    return handleError(err, []);
  }
}

/**
 * Sessions (Session Engine)
 * NOTE: backend route must exist: /api/sessions
 */
async function getSessions() {
  try {
    const res = await api.get("/sessions");
    return res.data?.data || [];
  } catch (err) {
    return handleError(err, []);
  }
}

/**
 * Optional: full dashboard fetch (server-side aggregation future upgrade)
 */
async function getFullDashboard() {
  try {
    const res = await api.get("/analytics/dashboard");
    return res.data?.data || null;
  } catch (err) {
    return handleError(err, null);
  }
}

export const dashboardService = {
  getProgressSummary,
  getWeakTopics,
  getRecommendations,
  getSessions,
  getFullDashboard,
};
