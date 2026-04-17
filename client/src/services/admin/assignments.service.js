import { adminClient } from './adminClient';

export const assignmentsService = {
  getAssignments: () =>
    adminClient.get('/admin/teacher-assignments'),

  createAssignment: (payload) =>
    adminClient.post('/admin/teacher-assignments', payload),

  deleteAssignment: (id) =>
    adminClient.delete(`/admin/teacher-assignments/${id}`)
};
