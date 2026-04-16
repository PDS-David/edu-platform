import httpClient from './httpClient';

export const analyticsApi = {
  getSummary: () => httpClient.get('/api/analytics/summary'),
  getWeakTopics: () => httpClient.get('/api/analytics/weak-topics'),
  getScoreTrend: () => httpClient.get('/api/analytics/score-trend'),
  getSubjectBreakdown: () => httpClient.get('/api/analytics/subject-breakdown'),
};
