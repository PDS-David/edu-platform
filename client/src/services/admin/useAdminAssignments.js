import { useState, useEffect, useCallback } from 'react';
import api from '../../services/apiClient';
import { assignments as assignmentsApi } from '../../services/admin/adminApi';

const normalizeList = (res) => ({
  items: res?.data || [],
  total: res?.count || res?.data?.length || 0,
});

const useAdminAssignments = () => {
  // ─────────────────────────────
  // state
  // ─────────────────────────────
  const [assignments, setAssignments] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [toast, setToast] = useState(null);

  // ─────────────────────────────
  // toast
  // ─────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  // ─────────────────────────────
  // fetch assignments
  // ─────────────────────────────
  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await assignmentsApi.getAssignments(api);
      const normalized = normalizeList(res);

      setAssignments(normalized.items);
    } catch (err) {
      setError(err?.message || 'Failed to load assignments');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─────────────────────────────
  // fetch subjects (for dropdowns)
  // ─────────────────────────────
  const fetchSubjects = useCallback(async () => {
    try {
      const res = await assignmentsApi.getSubjects(api);
      setSubjects(res?.data || []);
    } catch (err) {
      console.warn('[useAdminAssignments] subjects failed:', err?.message);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchSubjects();
  }, [fetchAssignments, fetchSubjects]);

  // ─────────────────────────────
  // mutations
  // ─────────────────────────────
  const assignTeacher = useCallback(async (payload) => {
    try {
      await assignmentsApi.createAssignment(api, payload);
      showToast('Teacher assigned successfully');
      fetchAssignments();
    } catch (err) {
      showToast(err?.message || 'Assignment failed', 'error');
    }
  }, [fetchAssignments, showToast]);

  const removeAssignment = useCallback(async (id) => {
    try {
      await assignmentsApi.deleteAssignment(api, id);
      showToast('Assignment removed');
      fetchAssignments();
    } catch (err) {
      showToast(err?.message || 'Failed to remove assignment', 'error');
    }
  }, [fetchAssignments, showToast]);

  const refetch = useCallback(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return {
    assignments,
    subjects,
    loading,
    error,

    assignTeacher,
    removeAssignment,
    refetch,

    toast,
    clearToast,
  };
};

export default useAdminAssignments;
