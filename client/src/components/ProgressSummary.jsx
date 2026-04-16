import React from 'react';
import { useProgress } from '../hooks/useProgress';
import { useAnalyticsSummary } from '../hooks/useAnalytics';

export default function ProgressSummary() {
  const { data: progress, isLoading: pLoading } = useProgress();
  const { data: analytics, isLoading: aLoading } = useAnalyticsSummary();

  if (pLoading || aLoading) {
    return <div>Loading progress...</div>;
  }

  return (
    <div className="p-4 rounded-xl border">
      <h2 className="text-lg font-semibold">Progress Summary</h2>

      <div className="mt-3 space-y-2">
        <p>Total Attempts: {analytics?.total_attempts}</p>
        <p>Accuracy: {analytics?.accuracy_pct}%</p>
        <p>XP Points: {analytics?.xp_points}</p>
        <p>Study Streak: {analytics?.study_streak_days} days</p>
        <p>Quizzes Completed: {analytics?.quizzes_completed}</p>
      </div>
    </div>
  );
}
