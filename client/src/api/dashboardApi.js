// client/src/api/dashboardApi.js

import api from '../services/apiClient';

export const getDashboardData = async () => {
  return api.get('/recommendations');
};

export const getSessionStats = async () => {
  return api.get('/sessions/stats');
};

export const getActiveSession = async () => {
  return api.get('/sessions/active');
};
