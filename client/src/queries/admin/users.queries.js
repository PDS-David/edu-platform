import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { users as usersApi } from '../../services/admin/adminApi';

// ─────────────────────────────
// LIST USERS
// ─────────────────────────────
export const useAdminUsers = (params) => {
  return useQuery({
    queryKey: ['admin-users', params],
    queryFn: async () => {
      const res = await usersApi.getUsers(api, params);
      return res;
    },
  });
};

// ─────────────────────────────
// STATS
// ─────────────────────────────
export const useAdminUserStats = () => {
  return useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: async () => {
      const res = await usersApi.getStats(api);
      return res.data;
    },
  });
};
