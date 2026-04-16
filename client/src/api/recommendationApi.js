import httpClient from './httpClient';

export const recommendationApi = {
  getRecommendations: () =>
    httpClient.get('/api/recommendations'),
};
