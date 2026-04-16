import { useQuery } from '@tanstack/react-query';
import { recommendationApi } from '../api/recommendationApi';

export function useRecommendations() {
  return useQuery({
    queryKey: ['recommendations'],
    queryFn: async () =>
      (await recommendationApi.getRecommendations()).data.data,
  });
}
