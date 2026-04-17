import api from '../services/apiClient';

export const recommendationApi = {
  getRecommendations: () => api.get('/recommendations'),
};
