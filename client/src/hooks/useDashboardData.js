/**
 * useDashboardData.js  (src/hooks/useDashboardData.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Central dashboard data aggregator using React Query
 */

import { useQuery } from "@tanstack/react-query";
import http from "../services/api";

export default function useDashboardData() {
  const summary = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const res = await http.get("/dashboard/summary");
      return res || null;
    },
  });

  const weakTopics = useQuery({
    queryKey: ["dashboard", "weakTopics"],
    queryFn: async () => {
      const res = await http.get("/dashboard/weak-topics");
      return res || [];
    },
  });

  const recommendations = useQuery({
    queryKey: ["dashboard", "recommendations"],
    queryFn: async () => {
      const res = await http.get("/dashboard/recommendations");
      return res || [];
    },
  });

  const sessions = useQuery({
    queryKey: ["dashboard", "sessions"],
    queryFn: async () => {
      const res = await http.get("/dashboard/sessions");
      return res || [];
    },
  });

  return {
    loading:
      summary.isLoading ||
      weakTopics.isLoading ||
      recommendations.isLoading ||
      sessions.isLoading,

    summary: summary.data,
    weakTopics: weakTopics.data || [],
    recommendations: recommendations.data || [],
    sessions: sessions.data || [],
  };
}
