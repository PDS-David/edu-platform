import httpClient from './httpClient';

export const sessionApi = {
  getSessions: () => httpClient.get('/api/sessions'),
  startSession: (data) => httpClient.post('/api/sessions/start', data),
  endSession: (data) => httpClient.post('/api/sessions/end', data),
};
