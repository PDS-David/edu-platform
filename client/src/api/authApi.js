// client/src/api/authApi.js

import api from '../services/api';

export const login = (email, password) =>
  api.post('/auth/login', { email, password });

export const register = (payload) =>
  api.post('/auth/register', payload);

export const getMe = () =>
  api.get('/users/me');
