import { useState, useEffect, useCallback, useRef } from 'react';
import { usersService } from '../../services/admin/users.service';

const PAGE_LIMIT = 20;

const useAdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const [toast, setToast] = useState(null);
  const debounceRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersService.getUsers({
        search,
        role: roleFilter,
        page,
        limit: PAGE_LIMIT
      });

      setUsers(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      setUsers([]);
      showToast(err?.error || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, page, showToast]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await usersService.getStats();
      setUserStats(res.data || null);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchUsers, 300);
    return () => clearTimeout(debounceRef.current);
  }, [fetchUsers]);

  const changeRole = useCallback(async (id, role) => {
    await usersService.updateRole(id, role);
    showToast('Role updated');
    fetchUsers();
  }, [fetchUsers, showToast]);

  const toggleActive = useCallback(async (id, current) => {
    await usersService.toggleActive(id, !current);
    showToast(!current ? 'Activated' : 'Deactivated');
    fetchUsers();
  }, [fetchUsers, showToast]);

  const deleteUser = useCallback(async (id, email) => {
    if (!window.confirm(`Delete ${email}?`)) return;
    await usersService.deleteUser(id);
    showToast('User deleted');
    fetchUsers();
  }, [fetchUsers, showToast]);

  return {
    users,
    userStats,
    total,
    loading,
    search,
    roleFilter,
    page,

    setSearch: (v) => { setSearch(v); setPage(1); },
    setRoleFilter: (v) => { setRoleFilter(v); setPage(1); },
    setPage,

    changeRole,
    toggleActive,
    deleteUser,

    toast
  };
};

export default useAdminUsers;
