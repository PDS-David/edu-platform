// client/src/services/dashboardService.js
import apiClient from "./apiClient";

export const dashboardService = {
  async getProgressSummary() {
    const res = await apiClient.get("/analytics/progress-summary");
    return res.data?.data;
  },

  async getWeakTopics() {
    const res = await apiClient.get("/analytics/weak-topics");
    return res.data?.data;
  },

  async getRecommendations() {
    const res = await apiClient.get("/recommendations");
    return res.data?.data;
  },

  async getSessions() {
    const res = await apiClient.get("/sessions");
    return res.data?.data;
  },
};
