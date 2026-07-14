import apiClient from '../services/apiClient';

export const login = async (email, password, rememberMe = false, portal = 'aischoolonair') => {
  const res = await apiClient.post('/auth/login', { email, password, rememberMe, portal });
  return res.data ?? res;
};

export const register = async (payload) => {
  const res = await apiClient.post('/auth/register', payload);
  return res.data ?? res;
};

// Standalone English Masterclass registration — independent of /auth/register.
export const emRegister = async (payload) => {
  const res = await apiClient.post('/auth/em-register', payload);
  return res.data ?? res;
};

export const getMe = async () => {
  const res = await apiClient.get('/auth/me');
  return res.data ?? res;
};

// AUTH-002
export const logout = async () => {
  const res = await apiClient.post('/auth/logout');
  return res.data ?? res;
};

export const logoutAll = async () => {
  const res = await apiClient.post('/auth/logout-all');
  return res.data ?? res;
};
