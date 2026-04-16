import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "../services/dashboardService";

export default function useDashboardData() {
  const summary = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: dashboardService.getProgressSummary,
  });

  const weakTopics = useQuery({
    queryKey: ["dashboard", "weakTopics"],
    queryFn: dashboardService.getWeakTopics,
  });

  const recommendations = useQuery({
    queryKey: ["dashboard", "recommendations"],
    queryFn: dashboardService.getRecommendations,
  });

  const sessions = useQuery({
    queryKey: ["dashboard", "sessions"],
    queryFn: dashboardService.getSessions,
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
