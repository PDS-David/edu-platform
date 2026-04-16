// client/src/queries/admin/users.mutations.js
// ─────────────────────────────────────────────────────────────
// ADMIN USERS MUTATIONS (React Query v5)
// Mirrors backend:
// PUT    /admin/users/:id/role
// PUT    /admin/users/:id/deactivate
// DELETE /admin/users/:id
// ─────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '../../api/admin/adminUsers.api';
import { adminUsersQueryKeys } from './users.queries';

/* ─────────────────────────────────────────────
   ROLE UPDATE MUTATION
───────────────────────────────────────────── */

export const useUpdateUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }) =>
      adminUsersApi.updateRole({ userId, role }),

    onSuccess: () => {
      // Invalidate ALL user-related queries
      queryClient.invalidateQueries({
        queryKey: adminUsersQueryKeys.all,
      });

      queryClient.invalidateQueries({
        queryKey: adminUsersQueryKeys.stats(),
      });
    },
  });
};

/* ─────────────────────────────────────────────
   TOGGLE ACTIVE USER
───────────────────────────────────────────── */

export const useToggleUserActive = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, isActive }) =>
      adminUsersApi.toggleActive({ userId, isActive }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminUsersQueryKeys.all,
      });

      queryClient.invalidateQueries({
        queryKey: adminUsersQueryKeys.stats(),
      });
    },
  });
};

/* ─────────────────────────────────────────────
   DELETE USER (soft delete backend)
───────────────────────────────────────────── */

export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }) =>
      adminUsersApi.deleteUser({ userId }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminUsersQueryKeys.all,
      });

      queryClient.invalidateQueries({
        queryKey: adminUsersQueryKeys.stats(),
      });
    },
  });
};
