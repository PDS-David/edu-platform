import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { progressApi } from '../api/progressApi';

export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: async () => (await progressApi.getProgress()).data.data,
  });
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: progressApi.updateProgress,
    onSuccess: () => {
      queryClient.invalidateQueries(['progress']);
      queryClient.invalidateQueries(['analytics-summary']);
    },
  });
}
