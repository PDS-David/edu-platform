import { adminClient } from './adminClient';

export const questionsService = {
  generateQuestions: (payload) =>
    adminClient.post('/admin/generate-questions', payload),

  getPending: (params) =>
    adminClient.get('/admin/questions/pending', params),

  bulkApprove: (question_ids) =>
    adminClient.patch('/admin/questions/bulk-approve', { question_ids }),

  approveOne: (id) =>
    adminClient.patch(`/admin/questions/${id}/approve`),

  review: (id, payload) =>
    adminClient.put(`/admin/questions/${id}/review`, payload),

  delete: (id) =>
    adminClient.delete(`/admin/questions/${id}`)
};
