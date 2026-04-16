import React from "react";

export default function SessionPanel({ sessions = [] }) {
  return (
    <div className="p-4 bg-white rounded-xl shadow">
      <h2 className="text-lg font-semibold mb-3">Study Sessions</h2>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">No sessions yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {sessions.map((s, i) => (
            <li key={i} className="flex justify-between">
              <span>{s.subtopic_name}</span>
              <span>{s.duration_minutes} min</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
