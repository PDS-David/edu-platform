import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { assignments as assignmentsApi } from '../../services/admin/adminApi';

// LIST
export const useAdminAssignments = () => {
  return useQuery({
    queryKey: ['admin-assignments'],
    queryFn: async () => {
      const res = await assignmentsApi.getAssignments(api);
      return res;
    },
  });
};

// SUBJECTS
export const useAdminSubjects = () => {
  return useQuery({
    queryKey: ['admin-subjects'],
    queryFn: async () => {
      const res = await assignmentsApi.getSubjects(api);
      return res.data;
    },
  });
};
