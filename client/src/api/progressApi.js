import httpClient from './httpClient';

export const progressApi = {
  getProgress: () => httpClient.get('/api/subtopics'),
  updateProgress: (data) =>
    httpClient.post('/api/subtopics/progress', data),
};
