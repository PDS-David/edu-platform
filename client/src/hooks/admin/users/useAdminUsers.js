import { useEffect, useCallback } from 'react';
import api from '../../../services/api';
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

  // ── Load stats (backend aggregate endpoint) ───────────────────────────────
  const loadStats = useCallback(async () => {
    const res = await request(() => usersApi.getStats(api));
    if (res.ok) setStats(res.data);
  }, [request]);

  // ── Load paginated users (Sequelize-backed endpoint) ──────────────────────
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
      setUsers(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } else {
      setUsers([]);
    }
  }, [request, filters, page, limit, setTotal]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(loadUsers, 250); // lightweight debounce
    return () => clearTimeout(timer);
  }, [loadUsers]);

  // ── Mutations (backend-aligned) ────────────────────────────────────────────
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
    const confirmed = window.confirm(
      `Delete ${email}? This cannot be undone.`
    );
    if (!confirmed) return;

    const res = await request(() =>
      usersApi.deleteUser(api, userId)
    );

    res.ok
      ? showToast('User deleted')
      : showToast(res.error, 'error');

    loadUsers();
  };

  // ── Filter handlers (RESET PAGINATION = important backend alignment) ──────
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

    loading: false, // derived in UI or extend request hook if needed

    changeRole,
    toggleActive,
    deleteUser,

    refetch: loadUsers,

    toast,
    clearToast,
  };
};

export default useAdminUsers;
