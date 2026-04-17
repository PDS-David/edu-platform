// client/src/queries/admin/users.queries.js

import { useQuery } from '@tanstack/react-query';
import { adminUsersApi } from '../../api/admin/adminUsers.api';
import { adminQueryKeys } from './admin.queryKeys';

/* ─────────────────────────────────────────────
   USERS LIST
───────────────────────────────────────────── */

export const useAdminUsersQuery = ({
  page = 1,
  limit = 20,
  search = '',
  role = '',
}) => {
  return useQuery({
    queryKey: adminQueryKeys.users.list({ page, limit, search, role }),

    queryFn: () =>
      adminUsersApi.getUsers({ page, limit, search, role }),

    keepPreviousData: true,
    staleTime: 1000 * 30,
  });
};

/* ─────────────────────────────────────────────
   USER STATS
───────────────────────────────────────────── */

export const useAdminUserStatsQuery = () => {
  return useQuery({
    queryKey: adminQueryKeys.users.stats(),
    queryFn: adminUsersApi.getStats,
    staleTime: 1000 * 60 * 5,
  });
};
