import { useEffect, useCallback, useState } from 'react';
import api from '../../../services/apiClient'; // ✅ FIX
import { users as usersApi } from '../../../services/admin/adminApi';

import useAdminToast from '../core/useAdminToast';
import useAdminPagination from '../core/useAdminPagination';
import useAdminFilters from '../core/useAdminFilters';
import useAdminRequest from '../core/useAdminRequest';

const useAdminUsers = () => {
  const { toast, showToast, clearToast } = useAdminToast();
  const { request } = useAdminRequest();

  const {
    page,
    setPage,
    resetPage,
    total,
    setTotal,
    totalPages,
    limit,
  } = useAdminPagination(1, 20);

  const { filters, setFilter } = useAdminFilters({
    search: '',
    role: '',
  });

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async () => {
    const res = await request(() => usersApi.getStats(api));
    if (res.ok) setStats(res.data); // ✅ FIX
  }, [request]);

  const loadUsers = useCallback(async () => {
    const res = await request(() =>
      usersApi.getUsers(api, {
        search: filters.search,
        role: filters.role,
        page,
        limit,
      })
    );

    if (res.ok) {
      setUsers(res.data || []);     // ✅ FIX
      setTotal(res.meta?.total || 0); // ⚠️ depends on backend (see note below)
    } else {
      setUsers([]);
    }
  }, [request, filters, page, limit, setTotal]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(loadUsers, 250);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  const changeRole = async (userId, role) => {
    const res = await request(() =>
      usersApi.updateRole(api, userId, role)
    );

    res.ok
      ? showToast(`Role updated to ${role}`)
      : showToast(res.error, 'error');

    loadUsers();
  };

  const toggleActive = async (userId, current) => {
    const res = await request(() =>
      usersApi.toggleActive(api, userId, !current)
    );

    res.ok
      ? showToast(current ? 'User deactivated' : 'User activated')
      : showToast(res.error, 'error');

    loadUsers();
  };

  const deleteUser = async (userId, email) => {
    if (!window.confirm(`Delete ${email}? This cannot be undone.`)) return;

    const res = await request(() =>
      usersApi.deleteUser(api, userId)
    );

    res.ok
      ? showToast('User deleted')
      : showToast(res.error, 'error');

    loadUsers();
  };

  const setSearch = (v) => {
    setFilter('search', v);
    resetPage();
  };

  const setRoleFilter = (v) => {
    setFilter('role', v);
    resetPage();
  };

  return {
    users,
    userStats: stats,

    total,
    totalPages,
    page,
    setPage,

    search: filters.search,
    roleFilter: filters.role,
    setSearch,
    setRoleFilter,

    loading: false,

    changeRole,
    toggleActive,
    deleteUser,

    refetch: loadUsers,

    toast,
    clearToast,
  };
};

export default useAdminUsers;
