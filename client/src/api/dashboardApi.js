import api from './axios';

export const getDashboardData = async () => {
  const res = await api.get('/recommendations');
  return res.data;
};

export const getSessionStats = async () => {
  const res = await api.get('/sessions/stats');
  return res.data;
};

export const getActiveSession = async () => {
  const res = await api.get('/sessions/active');
  return res.data;
};
