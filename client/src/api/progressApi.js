// client/src/api/progressApi.js
// Low-level progress API helpers used by useProgress / useUpdateProgress hooks.
// Note: subtopic-specific progress is called directly in SubtopicPage and QuizTab
// using api.get/post(`/subtopic-progress/:subtopicId`).

import api from '../services/apiClient';

export const progressApi = {
  // GET /api/subtopics — returns the student's subtopic list with progress fields
  getProgress: () => api.get('/subtopics'),
  // POST /api/subtopic-progress/:subtopicId — update via direct call; this
  // generic form is used by useUpdateProgress hook where subtopicId is in data.
  updateProgress: (data) => {
    const { subtopicId, ...body } = data;
    if (!subtopicId) return Promise.reject(new Error('subtopicId required'));
    return api.post(`/subtopic-progress/${subtopicId}`, body);
  },
};
