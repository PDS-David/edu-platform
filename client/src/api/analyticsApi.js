import api from './axios';

export const getAnalytics = () =>
  api.get('/analytics');
