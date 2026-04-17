import api from '../services/api'; // ✅ FIXED PATH

/**
 * LOGIN
 */
export const login = async (email, password) => {
  const res = await api.post('/api/auth/login', {
    email,
    password,
  });

  return res.data;
};

/**
 * REGISTER
 */
export const register = async (payload) => {
  const res = await api.post('/api/auth/register', payload);
  return res.data;
};

/**
 * GET CURRENT USER
 */
export const getMe = async () => {
  const res = await api.get('/api/users/me');
  return res.data;
};
