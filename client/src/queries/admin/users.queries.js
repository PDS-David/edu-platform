// client/src/queries/admin/users.queries.js
// ─────────────────────────────────────────────────────────────
// ADMIN USERS QUERIES (React Query v5 style)
// Single source of truth for server-state access
// Mirrors backend: /api/admin/users routes
// ─────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { adminUsersApi } from '../../api/admin/adminUsers.api';

/**
 * Query Keys (centralized to avoid mismatch bugs)
 */
export const adminUsersQueryKeys = {
  all: ['admin-users'],
  list: (params) => ['admin-users', 'list', params],
  stats: () => ['admin-user-stats'],
};

/* ─────────────────────────────────────────────
   1. USERS LIST QUERY
   GET /api/admin/users
───────────────────────────────────────────── */

export const useAdminUsersQuery = (params = {}) => {
  const {
    page = 1,
    limit = 20,
    search = '',
    role = '',
  } = params;

  return useQuery({
    queryKey: adminUsersQueryKeys.list({ page, limit, search, role }),

    queryFn: () =>
      adminUsersApi.getUsers({ page, limit, search, role }),

    keepPreviousData: true,

    staleTime: 1000 * 30, // 30s cache freshness
  });
};

/* ─────────────────────────────────────────────
   2. USER STATS QUERY
   GET /api/admin/users/stats
───────────────────────────────────────────── */

export const useAdminUserStatsQuery = () => {
  return useQuery({
    queryKey: adminUsersQueryKeys.stats(),

    queryFn: () => adminUsersApi.getStats(),

    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
