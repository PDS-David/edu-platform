import React from "react";
import useDashboardData from "../../hooks/useDashboardData";
import useRealtimeSync from "../../hooks/useRealtimeSync";

import ProgressSummary from "../../components/ProgressSummary";
import WeakTopicsPanel from "../../components/WeakTopicsPanel";
import RecommendationPanel from "../../components/RecommendationPanel";
import SessionPanel from "../../components/SessionPanel";

export default function DashboardHome() {
  useRealtimeSync(); // 🔥 ONLY ADDITION (UI untouched)

  const {
    loading,
    summary,
    weakTopics,
    recommendations,
    sessions,
  } = useDashboardData();

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="grid grid-cols-2 gap-4">
      <ProgressSummary data={summary} />
      <WeakTopicsPanel items={weakTopics} />
      <RecommendationPanel items={recommendations} />
      <SessionPanel sessions={sessions} />
    </div>
  );
}
