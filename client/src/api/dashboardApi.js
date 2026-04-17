// client/src/api/dashboardApi.js

import api from '../services/api';

export const getDashboardData = () =>
  api.get('/recommendations');

export const getSessionStats = () =>
  api.get('/sessions/stats');

export const getActiveSession = () =>
  api.get('/sessions/active');
