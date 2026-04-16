import React from "react";
import useDashboardData from "../../hooks/useDashboardData";

import ProgressSummary from "../../components/dashboard/ProgressSummary";
import WeakTopicsPanel from "../../components/dashboard/WeakTopicsPanel";
import RecommendationPanel from "../../components/dashboard/RecommendationPanel";
import SessionPanel from "../../components/dashboard/SessionPanel";

export default function DashboardHome() {
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
