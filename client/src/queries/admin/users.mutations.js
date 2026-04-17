// client/src/queries/admin/users.mutations.js

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '../../api/admin/adminUsers.api';
import { adminQueryKeys } from './admin.queryKeys';

/* ─────────────────────────────────────────────
   UPDATE ROLE
───────────────────────────────────────────── */

export const useUpdateUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }) =>
      adminUsersApi.updateRole({ userId, role }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.all,
      });

      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.stats(),
      });
    },
  });
};

/* ─────────────────────────────────────────────
   TOGGLE ACTIVE
───────────────────────────────────────────── */

export const useToggleUserActive = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, isActive }) =>
      adminUsersApi.toggleActive({ userId, isActive }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.all,
      });

      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.stats(),
      });
    },
  });
};

/* ─────────────────────────────────────────────
   DELETE USER
───────────────────────────────────────────── */

export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }) =>
      adminUsersApi.deleteUser({ userId }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.all,
      });

      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users.stats(),
      });
    },
  });
};
