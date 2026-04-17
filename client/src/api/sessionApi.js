import api from '../services/apiClient';

export const sessionApi = {
  getSessions: () => api.get('/sessions'),
  startSession: (data) => api.post('/sessions/start', data),
  endSession: (data) => api.post('/sessions/end', data),
};
