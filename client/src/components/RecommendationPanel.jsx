import React from 'react';
import { useRecommendations } from '../hooks/useRecommendations';

export default function RecommendationPanel() {
  const { data, isLoading } = useRecommendations();

  if (isLoading) {
    return <div>Loading recommendations...</div>;
  }

  return (
    <div className="p-4 rounded-xl border">
      <h2 className="text-lg font-semibold">Recommendations</h2>

      <ul className="mt-3 space-y-2">
        {data?.map((rec, idx) => (
          <li key={idx} className="p-2 border rounded">
            {rec.message || rec.recommendation}
          </li>
        ))}
      </ul>
    </div>
  );
}
