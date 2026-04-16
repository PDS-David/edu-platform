import React from "react";

export default function ProgressSummary({ data }) {
  if (!data) return null;

  return (
    <div className="p-4 bg-white rounded-xl shadow">
      <h2 className="text-lg font-semibold mb-3">Progress Summary</h2>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>XP Points: {data.xp_points}</div>
        <div>Streak: {data.study_streak_days}</div>
        <div>Completed: {data.completed_subtopics}</div>
        <div>Accuracy: {data.accuracy_rate}%</div>
      </div>
    </div>
  );
}
