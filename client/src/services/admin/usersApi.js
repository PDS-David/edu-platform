/**
 * usersApi.js
 * ------------------------------------------------------------
 * STRICT BACKEND CONTRACT MAPPER
 *
 * Mirrors:
 *  GET    /api/admin/users
 *  GET    /api/admin/users/stats
 *  PUT    /api/admin/users/:id/role
 *  PUT    /api/admin/users/:id/deactivate
 *  DELETE /api/admin/users/:id
 */

const BASE = '/api/admin/users';

const safeData = (res) => res?.data ?? res;
const safeSuccess = (res) => res?.success === true;

// ─────────────────────────────────────────────
// GET /users (paginated list)
// ─────────────────────────────────────────────
export const getUsers = async (api, params = {}) => {
  const res = await api.get(BASE, { params });

  return {
    success: safeSuccess(res.data),
    data: res.data?.data || [],
    total: res.data?.total || 0,
  };
};

// ─────────────────────────────────────────────
// GET /users/stats
// ─────────────────────────────────────────────
export const getStats = async (api) => {
  const res = await api.get(`${BASE}/stats`);

  return {
    success: safeSuccess(res.data),
    data: res.data?.data || null,
  };
};

// ─────────────────────────────────────────────
// PUT /users/:id/role
// ─────────────────────────────────────────────
export const updateRole = async (api, userId, role) => {
  const res = await api.put(`${BASE}/${userId}/role`, { role });

  return {
    success: safeSuccess(res.data),
    data: res.data || null,
  };
};

// ─────────────────────────────────────────────
// PUT /users/:id/deactivate
// ─────────────────────────────────────────────
export const toggleActive = async (api, userId, is_active) => {
  const res = await api.put(`${BASE}/${userId}/deactivate`, {
    is_active,
  });

  return {
    success: safeSuccess(res.data),
    data: res.data || null,
  };
};

// ─────────────────────────────────────────────
// DELETE /users/:id
// (soft delete: backend sets is_active = false)
// ─────────────────────────────────────────────
export const deleteUser = async (api, userId) => {
  const res = await api.delete(`${BASE}/${userId}`);

  return {
    success: safeSuccess(res.data),
    data: res.data || null,
  };
};
