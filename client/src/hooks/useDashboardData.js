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
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled([
        dashboardService.getProgressSummary(),
        dashboardService.getWeakTopics(),
        dashboardService.getRecommendations(),
        dashboardService.getSessions(),
      ]);

      const [s, w, r, se] = results;

      setSummary(s.status === "fulfilled" ? s.value : null);
      setWeakTopics(w.status === "fulfilled" ? w.value : []);
      setRecommendations(r.status === "fulfilled" ? r.value : []);
      setSessions(se.status === "fulfilled" ? se.value : []);

      // optional debug logging
      results.forEach((res, i) => {
        if (res.status === "rejected") {
          console.warn("Dashboard API failed:", i, res.reason?.message);
        }
      });

    } catch (err) {
      setError("Dashboard load failed");
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
