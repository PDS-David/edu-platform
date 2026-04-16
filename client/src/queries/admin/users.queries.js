// client/src/queries/admin/users.queries.js

import { useQuery } from '@tanstack/react-query';
import { adminUsersApi } from '../../api/admin/adminUsers.api';

/**
 * QUERY KEYS (centralized)
 */
export const adminUsersQueryKeys = {
  all: ['admin-users'],
  list: (params) => ['admin-users', 'list', params],
  stats: () => ['admin-user-stats'],
};

/* ─────────────────────────────────────────────
   USERS LIST
   GET /api/admin/users
───────────────────────────────────────────── */

export const useAdminUsersQuery = ({
  page = 1,
  limit = 20,
  search = '',
  role = '',
}) => {
  return useQuery({
    queryKey: adminUsersQueryKeys.list({ page, limit, search, role }),

    queryFn: () =>
      adminUsersApi.getUsers({ page, limit, search, role }),

    keepPreviousData: true,
    staleTime: 1000 * 30,
  });
};

/* ─────────────────────────────────────────────
   USER STATS
   GET /api/admin/users/stats
───────────────────────────────────────────── */

export const useAdminUserStatsQuery = () => {
  return useQuery({
    queryKey: adminUsersQueryKeys.stats(),
    queryFn: adminUsersApi.getStats,
    staleTime: 1000 * 60 * 5,
  });
};
