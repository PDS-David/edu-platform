// client/src/hooks/admin/useAdminUsers.js
// ─────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH FOR ADMIN USERS UI
// Composes React Query + mutations into UI-ready API
// ─────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';

import {
  useAdminUsersQuery,
  useAdminUserStatsQuery,
} from '../../queries/admin/users.queries';

import {
  useUpdateUserRole,
  useToggleUserActive,
  useDeleteUser,
} from '../../queries/admin/users.mutations';

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const DEFAULT_PAGE_SIZE = 20;

/* ─────────────────────────────────────────────
   HOOK
───────────────────────────────────────────── */

const useAdminUsers = () => {
  /* ─────────────────────────────
     UI STATE (NOT SERVER STATE)
  ───────────────────────────── */

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  /* ─────────────────────────────
     SERVER STATE (React Query)
  ───────────────────────────── */

  const {
    data: usersResponse,
    isLoading,
    isFetching,
    refetch,
  } = useAdminUsersQuery({
    page,
    limit: DEFAULT_PAGE_SIZE,
    search,
    role: roleFilter,
  });

  const { data: statsResponse } = useAdminUserStatsQuery();

  /* ─────────────────────────────
     MUTATIONS
  ───────────────────────────── */

  const updateRoleMutation = useUpdateUserRole();
  const toggleActiveMutation = useToggleUserActive();
  const deleteUserMutation = useDeleteUser();

  /* ─────────────────────────────
     DERIVED DATA (NORMALIZED)
  ───────────────────────────── */

  const users = usersResponse?.data || [];
  const total = usersResponse?.total || 0;

  const userStats = statsResponse?.data || null;

  const totalPages = useMemo(() => {
    return Math.ceil(total / DEFAULT_PAGE_SIZE);
  }, [total]);

  /* ─────────────────────────────
     ACTION WRAPPERS (UI SAFE)
  ───────────────────────────── */

  const changeRole = async (userId, role) => {
    return updateRoleMutation.mutateAsync({ userId, role });
  };

  const toggleActive = async (userId, currentActive) => {
    return toggleActiveMutation.mutateAsync({
      userId,
      isActive: !currentActive,
    });
  };

  const deleteUser = async (userId) => {
    return deleteUserMutation.mutateAsync({ userId });
  };

  /* ─────────────────────────────
     FILTER HANDLERS (UI LOGIC ONLY)
  ───────────────────────────── */

  const handleSetSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleSetRoleFilter = (value) => {
    setRoleFilter(value);
    setPage(1);
  };

  /* ─────────────────────────────
     RETURN CONTRACT (UI LAYER)
  ───────────────────────────── */

  return {
    // ── data
    users,
    userStats,
    total,
    totalPages,

    // ── loading state
    loading: isLoading,
    isFetching,

    // ── pagination + filters
    page,
    setPage,
    search,
    setSearch: handleSetSearch,
    roleFilter,
    setRoleFilter: handleSetRoleFilter,

    // ── actions
    refetch,
    changeRole,
    toggleActive,
    deleteUser,

    // ── mutation states (optional UI usage)
    isUpdatingRole: updateRoleMutation.isPending,
    isTogglingActive: toggleActiveMutation.isPending,
    isDeleting: deleteUserMutation.isPending,
  };
};

export default useAdminUsers;
