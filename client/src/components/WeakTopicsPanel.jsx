import React from 'react';
import { useWeakTopics } from '../hooks/useAnalytics';

export default function WeakTopicsPanel() {
  const { data, isLoading } = useWeakTopics();

  if (isLoading) {
    return <div>Loading weak topics...</div>;
  }

  return (
    <div className="p-4 rounded-xl border">
      <h2 className="text-lg font-semibold">Weak Topics</h2>

      <ul className="mt-3 space-y-2">
        {data?.map((topic, idx) => (
          <li key={idx} className="p-2 border rounded">
            <div className="font-medium">{topic.topic}</div>
            <div className="text-sm text-gray-600">
              Accuracy: {topic.accuracy_pct}%
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
