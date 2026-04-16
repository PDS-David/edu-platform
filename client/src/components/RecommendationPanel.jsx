import React from "react";

export default function RecommendationPanel({ items = [] }) {
  return (
    <div className="p-4 bg-white rounded-xl shadow">
      <h2 className="text-lg font-semibold mb-3">Recommendations</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No recommendations yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((r, i) => (
            <li key={i} className="border-b pb-2">
              <div className="font-medium">{r.title}</div>
              <div className="text-gray-500 text-xs">{r.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
