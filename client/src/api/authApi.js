// client/src/api/authApi.js

import api from '../services/api'; // ONLY SOURCE

export const login = async (email, password) => {
  const res = await api.post('/auth/login', {
    email,
    password,
  });

  return res;
};

export const register = async (payload) => {
  const res = await api.post('/auth/register', payload);
  return res;
};

export const getMe = async () => {
  const res = await api.get('/users/me');
  return res;
};
