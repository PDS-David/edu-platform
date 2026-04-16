import api from './axios';

export const startSession = (subtopicId) =>
  api.post('/sessions/start', { subtopicId });

export const endSession = (sessionId) =>
  api.post('/sessions/end', { sessionId });

export const getActiveSession = () =>
  api.get('/sessions/active');

export const getSessionStats = () =>
  api.get('/sessions/stats');
