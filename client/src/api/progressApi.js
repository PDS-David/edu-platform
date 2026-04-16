import api from './axios';

export const getSubtopics = (params) =>
  api.get('/subtopics', { params });

export const updateProgress = (data) =>
  api.post('/progress/update', data);
