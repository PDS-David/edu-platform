import { useQuery, useMutation } from '@tanstack/react-query';
import { sessionApi } from '../api/sessionApi';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => (await sessionApi.getSessions()).data.data,
  });
}

export function useStartSession() {
  return useMutation({
    mutationFn: sessionApi.startSession,
  });
}

export function useEndSession() {
  return useMutation({
    mutationFn: sessionApi.endSession,
  });
}
