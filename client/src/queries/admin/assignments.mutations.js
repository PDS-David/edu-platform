/**
 * FILE: client/src/queries/admin/assignments.mutations.js
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { assignments as assignmentsApi } from '../../services/admin/adminApi';
import { adminKeys } from './admin.queryKeys';

// ─────────────────────────────────────────────────────────────
// ASSIGN TEACHER TO SUBJECT
// ─────────────────────────────────────────────────────────────
export const useAssignTeacher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teacher_id, subject_id, exam_board_id }) =>
      assignmentsApi.assignTeacher(api, {
        teacher_id,
        subject_id,
        exam_board_id,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.assignments(),
      });
    },
  });
};

// ─────────────────────────────────────────────────────────────
// REMOVE ASSIGNMENT
// ─────────────────────────────────────────────────────────────
export const useRemoveAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignmentId) =>
      assignmentsApi.removeAssignment(api, assignmentId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.assignments(),
      });
    },
  });
};
