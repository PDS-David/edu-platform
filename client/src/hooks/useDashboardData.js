/**
 * client/src/hooks/useDashboardData.js
 */

import { useQuery } from "@tanstack/react-query";
import api from "../services/api";

export default function useDashboardData() {
  const summary = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const res = await api.get("/dashboard/summary");
      return res?.data || null;
    },
  });

  const weakTopics = useQuery({
    queryKey: ["dashboard", "weakTopics"],
    queryFn: async () => {
      const res = await api.get("/dashboard/weak-topics");
      return res?.data || [];
    },
  });

  const recommendations = useQuery({
    queryKey: ["dashboard", "recommendations"],
    queryFn: async () => {
      const res = await api.get("/dashboard/recommendations");
      return res?.data || [];
    },
  });

  const sessions = useQuery({
    queryKey: ["dashboard", "sessions"],
    queryFn: async () => {
      const res = await api.get("/dashboard/sessions");
      return res?.data || [];
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
