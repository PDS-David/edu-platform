// client/src/hooks/useDashboardData.js
import { useEffect, useState } from "react";
import { dashboardService } from "../services/dashboardService";

export default function useDashboardData() {
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [weakTopics, setWeakTopics] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [sessions, setSessions] = useState([]);

  const [error, setError] = useState(null);

  const fetchAll = async () => {
    try {
      setLoading(true);

      const [s, w, r, se] = await Promise.all([
        dashboardService.getProgressSummary(),
        dashboardService.getWeakTopics(),
        dashboardService.getRecommendations(),
        dashboardService.getSessions(),
      ]);

      setSummary(s);
      setWeakTopics(w || []);
      setRecommendations(r || []);
      setSessions(se || []);
    } catch (err) {
      setError(err?.response?.data?.error || "Dashboard load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  return {
    loading,
    error,
    summary,
    weakTopics,
    recommendations,
    sessions,
    refresh: fetchAll,
  };
}
