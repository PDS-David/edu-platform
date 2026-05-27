/**
 * useAdminUsers.js (Production Refactor)
 * ------------------------------------------------------------
 * Strictly aligned with:
 *  GET    /api/admin/users
 *  GET    /api/admin/users/stats
 *  PUT    /api/admin/users/:id/role
 *  PUT    /api/admin/users/:id/deactivate
 *  DELETE /api/admin/users/:id
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/apiClient';
import { users as usersApi } from '../../services/admin/adminApi';

const PAGE_LIMIT = 20;

// ─────────────────────────────────────────────────────────────
// Safe response normalizer (prevents frontend crashes)
// ─────────────────────────────────────────────────────────────
const normalizeListResponse = (res) => {
  if (!res || res.success !== true) {
    return { items: [], total: 0 };
  }

  return {
    items: Array.isArray(res.data) ? res.data : [],
    total: typeof res.total === 'number' ? res.total : 0,
  };
};

const normalizeStatsResponse = (res) => {
  if (!res || res.success !== true) return null;
  return res.data || null;
};

const useAdminUsers = () => {
  // ─────────────────────────────────────────────
  // state
  // ─────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [userStats, setUserStats] = useState(null);

  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [toast, setToast] = useState(null);

  // ─────────────────────────────────────────────
  // refs (avoid stale closures + debounce control)
  // ─────────────────────────────────────────────
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  // ─────────────────────────────────────────────
  // toast
  // ─────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  // ─────────────────────────────────────────────
  // fetch stats (1x on mount)
  // ─────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await usersApi.getStats(api);
        if (!mounted) return;
        setUserStats(normalizeStatsResponse(res));
      } catch (err) {
        // stats are non-critical
        console.warn('[useAdminUsers] stats failed:', err?.message);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ─────────────────────────────────────────────
  // core fetch function (strict backend contract)
  // ─────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    // cancel previous request if supported
    if (abortRef.current) {
      abortRef.current.abort?.();
    }

    try {
      const res = await usersApi.getUsers(api, {
        search: search || undefined,
        role: roleFilter || undefined,
        page,
        limit: PAGE_LIMIT,
      });

      const normalized = normalizeListResponse(res);

      setUsers(normalized.items);
      setTotal(normalized.total);
    } catch (err) {
      console.error('[useAdminUsers] fetch failed:', err?.message);
      setError(err?.message || 'Failed to load users');
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, page]);

  // ─────────────────────────────────────────────
  // debounced fetch trigger
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchUsers();
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [fetchUsers]);

  // ─────────────────────────────────────────────
  // reset pagination on filters
  // ─────────────────────────────────────────────
  const handleSetSearch = useCallback((value) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleSetRoleFilter = useCallback((value) => {
    setRoleFilter(value);
    setPage(1);
  }, []);

  // ─────────────────────────────────────────────
  // mutations (strict backend alignment)
  // ─────────────────────────────────────────────
  const changeRole = useCallback(
    async (userId, role) => {
      try {
        await usersApi.updateRole(api, userId, role);
        showToast(`Role updated to ${role}`);
        fetchUsers();
      } catch (err) {
        showToast(err?.message || 'Failed to update role', 'error');
      }
    },
    [fetchUsers, showToast]
  );

  const toggleActive = useCallback(
    async (userId, currentActive) => {
      try {
        await usersApi.toggleActive(api, userId, !currentActive);
        showToast(currentActive ? 'User deactivated' : 'User activated');
        fetchUsers();
      } catch (err) {
        showToast(err?.message || 'Failed to update status', 'error');
      }
    },
    [fetchUsers, showToast]
  );

  const deleteUser = useCallback(
    async (userId, email) => {
      const ok = window.confirm(
        `Permanently delete user "${email}"? This cannot be undone.`
      );
      if (!ok) return;

      try {
        await usersApi.deleteUser(api, userId);
        showToast(`User ${email} deleted`);
        fetchUsers();
      } catch (err) {
        showToast(err?.message || 'Failed to delete user', 'error');
      }
    },
    [fetchUsers, showToast]
  );

  // manual refetch
  const refetch = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ─────────────────────────────────────────────
  // derived values
  // ─────────────────────────────────────────────
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  // ─────────────────────────────────────────────
  // public API
  // ─────────────────────────────────────────────
  return {
    // data
    users,
    userStats,

    // pagination
    total,
    totalPages,
    page,
    setPage,

    // filters
    search,
    roleFilter,
    setSearch: handleSetSearch,
    setRoleFilter: handleSetRoleFilter,

    // state
    loading,
    error,

    // actions
    refetch,
    changeRole,
    toggleActive,
    deleteUser,

    // toast
    toast,
    clearToast,
  };
};

export default useAdminUsers;
