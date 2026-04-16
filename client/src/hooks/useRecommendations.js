import { useEffect, useState } from 'react';
import { getRecommendations } from '../api/recommendationApi';

export default function useRecommendations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecommendations()
      .then(res => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
