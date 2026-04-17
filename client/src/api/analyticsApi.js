// client/src/api/analyticsApi.js

import api from '../services/apiClient';

export const analyticsApi = {
  getSummary: () => api.get('/analytics/summary'),
  getWeakTopics: () => api.get('/analytics/weak-topics'),
  getScoreTrend: () => api.get('/analytics/score-trend'),
  getSubjectBreakdown: () => api.get('/analytics/subject-breakdown'),
};
