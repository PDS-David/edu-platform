// client/src/api/admin/adminUsers.api.js

import api from '../../services/apiClient';

export const adminUsersApi = {
  getUsers: async ({ page = 1, limit = 20, search = '', role = '' }) => {
    return await api.get('/admin/users', {
      params: { page, limit, search, role },
    });
  },

  getStats: async () => {
    return await api.get('/admin/users/stats');
  },

  updateRole: async ({ userId, role }) => {
    return await api.put(`/admin/users/${userId}/role`, { role });
  },

  toggleActive: async ({ userId, isActive }) => {
    return await api.put(`/admin/users/${userId}/deactivate`, {
      is_active: isActive,
    });
  },

  deleteUser: async ({ userId }) => {
    return await api.delete(`/admin/users/${userId}`);
  },
};
