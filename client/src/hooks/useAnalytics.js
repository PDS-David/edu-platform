import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analyticsApi';

export function useAnalyticsSummary() {
  return useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => (await analyticsApi.getSummary()).data.data,
  });
}

export function useWeakTopics() {
  return useQuery({
    queryKey: ['weak-topics'],
    queryFn: async () => (await analyticsApi.getWeakTopics()).data.data,
  });
}
