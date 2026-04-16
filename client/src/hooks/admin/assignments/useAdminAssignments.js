import { useState, useEffect, useCallback } from 'react';
import api from '../../../services/api';
import { assignments as assignmentsApi } from '../../../services/admin/adminApi';

import useAdminToast from '../core/useAdminToast';
import useAdminRequest from '../core/useAdminRequest';
import useAdminFilters from '../core/useAdminFilters';

const INITIAL_FORM = {
  teacher_id: '',
  exam_type_id: '',
};

const useAdminAssignments = () => {
  const { toast, showToast, clearToast } = useAdminToast();
  const { request, loading: globalLoading } = useAdminRequest();

  const { filters, setFilter } = useAdminFilters({
    search: '',
  });

  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [examTypes, setExamTypes] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─────────────────────────────────────────────
  // LOAD CORE DATA (backend-driven)
  // ─────────────────────────────────────────────
  const loadCore = useCallback(async () => {
    const res = await request(() =>
      assignmentsApi.getAll(api)
    );

    if (res.ok) setAssignments(res.data?.data ?? []);
  }, [request]);

  const loadTeachers = useCallback(async () => {
    const res = await request(() =>
      assignmentsApi.getTeachers(api)
    );

    if (res.ok) setTeachers(res.data?.data ?? []);
  }, [request]);

  const loadExamTypes = useCallback(async () => {
    const res = await request(() =>
      assignmentsApi.getExamTypes(api)
    );

    if (res.ok) setExamTypes(res.data?.data ?? []);
  }, [request]);

  useEffect(() => {
    loadCore();
    loadTeachers();
    loadExamTypes();
  }, []);

  // ─────────────────────────────────────────────
  // SUBJECT LOADING (backend contract aligned)
  // ─────────────────────────────────────────────
  const loadSubjectsByExamType = useCallback(async (examTypeId) => {
    if (!examTypeId) return;

    setLoadingSubjects(true);

    const res = await request(() =>
      assignmentsApi.getSubjectsByExamType(api, examTypeId)
    );

    if (res.ok) {
      setSubjects(res.data?.data ?? []);
    } else {
      showToast(res.error, 'error');
    }

    setLoadingSubjects(false);
  }, [request, showToast]);

  // ─────────────────────────────────────────────
  // FORM HANDLERS
  // ─────────────────────────────────────────────
  const openModal = () => {
    setForm(INITIAL_FORM);
    setSelectedSubjectIds([]);
    setSubjects([]);
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const setFormField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExamTypeChange = async (typeId) => {
    setFormField('exam_type_id', typeId);
    setSelectedSubjectIds([]);
    await loadSubjectsByExamType(typeId);
  };

  const toggleSubject = (id) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  // ─────────────────────────────────────────────
  // SAVE (bulk assignment creation)
  // ─────────────────────────────────────────────
  const handleSave = async () => {
    const { teacher_id, exam_type_id } = form;

    if (!teacher_id || !exam_type_id || selectedSubjectIds.length === 0) {
      showToast('All fields are required', 'error');
      return;
    }

    setSaving(true);

    const res = await request(() =>
      assignmentsApi.createBulk(api, {
        teacher_id,
        exam_type_id,
        subject_ids: selectedSubjectIds,
      })
    );

    if (res.ok) {
      showToast('Assignments created successfully');
      closeModal();
      loadCore();
    } else {
      showToast(res.error, 'error');
    }

    setSaving(false);
  };

  // ─────────────────────────────────────────────
  // REMOVE
  // ─────────────────────────────────────────────
  const handleRemove = async (id) => {
    if (!window.confirm('Remove assignment?')) return;

    const res = await request(() =>
      assignmentsApi.remove(api, id)
    );

    if (res.ok) {
      showToast('Assignment removed');
      loadCore();
    } else {
      showToast(res.error, 'error');
    }
  };

  return {
    // data
    assignments,
    teachers,
    examTypes,
    subjects,

    // UI state
    showModal,
    form,
    selectedSubjectIds,
    loadingSubjects,
    saving,

    // actions
    openModal,
    closeModal,
    setFormField,
    handleExamTypeChange,
    toggleSubject,
    handleSave,
    handleRemove,

    refetch: loadCore,

    // toast
    toast,
    clearToast,
  };
};

export default useAdminAssignments;
