// client/src/api/progressApi.js

import api from '../services/apiClient';

export const progressApi = {
  getProgress: () => api.get('/subtopics'),
  updateProgress: (data) => api.post('/subtopics/progress', data),
};
