import api from '../services/api';

export const recommendationApi = {
  getRecommendations: () => api.get('/recommendations'),
};
