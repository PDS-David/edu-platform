import { adminClient } from './adminClient';

export const usersService = {
  getUsers: (params) =>
    adminClient.get('/admin/users', params),

  getStats: () =>
    adminClient.get('/admin/users/stats'),

  updateRole: (id, role) =>
    adminClient.put(`/admin/users/${id}/role`, { role }),

  toggleActive: (id, is_active) =>
    adminClient.put(`/admin/users/${id}/active`, { is_active }),

  deleteUser: (id) =>
    adminClient.delete(`/admin/users/${id}`)
};
