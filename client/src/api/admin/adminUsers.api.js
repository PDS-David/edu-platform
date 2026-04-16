// client/src/api/admin/adminUsers.api.js

import api from '../api';

export const adminUsersApi = {
  getUsers: async ({ page = 1, limit = 20, search = '', role = '' }) => {
    const { data } = await api.get('/admin/users', {
      params: { page, limit, search, role },
    });
    return data;
  },

  getStats: async () => {
    const { data } = await api.get('/admin/users/stats');
    return data;
  },

  updateRole: async ({ userId, role }) => {
    const { data } = await api.put(`/admin/users/${userId}/role`, { role });
    return data;
  },

  toggleActive: async ({ userId, isActive }) => {
    const { data } = await api.put(`/admin/users/${userId}/deactivate`, {
      is_active: isActive,
    });
    return data;
  },

  deleteUser: async ({ userId }) => {
    const { data } = await api.delete(`/admin/users/${userId}`);
    return data;
  },
};
