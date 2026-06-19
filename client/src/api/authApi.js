import apiClient from '../services/apiClient';

export const login = async (email, password) => {
  const res = await apiClient.post('/auth/login', { email, password });
  return res.data;
};

export const register = async (payload) => {
  const res = await apiClient.post('/auth/register', payload);
  return res.data;
};

export const getMe = async () => {
  const res = await apiClient.get('/auth/me');
  return res.data;
};
