import React from "react";

export default function WeakTopicsPanel({ items = [] }) {
  return (
    <div className="p-4 bg-white rounded-xl shadow">
      <h2 className="text-lg font-semibold mb-3">Weak Topics</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No weak topics detected.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((t, i) => (
            <li key={i} className="flex justify-between">
              <span>{t.name}</span>
              <span className="text-red-500">{t.score}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
