// client/src/components/AssignExamTypeModal.jsx
//
// Phase 3 Step 5 — ONE reusable modal shared by both admin surfaces
// (SchoolAdminDashboard.jsx and AdminDashboard.jsx) for assigning a
// student's exam type + subjects. Calls the shared backend endpoint:
//   POST /api/schools/students/:studentId/assign-exam-type
// School Admin can only target a student in their own school (enforced
// server-side); App Admin can target any student. This component doesn't
// need to know which caller it is — the backend scopes that.
//
// Mirrors the exam-type → subjects two-step pattern and the
// checkbox-capped-at-max_subjects logic already used in OnboardingPage.jsx,
// and reuses the existing modal shell (max-w-md, rounded-2xl, X close
// button) already used by CreateClassModal in SchoolAdminDashboard.jsx.

import { useState, useMemo } from 'react';
import { Loader2, X, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { useCatalog } from '../hooks/useCatalog';
import api from '../services/apiClient';

export default function AssignExamTypeModal({ studentId, studentName, onClose, onAssigned }) {
  const { examTypes, loadingTypes, fetchSubjectsForType } = useCatalog();

  const [step,            setStep]            = useState(1); // 1: pick board, 2: pick subjects
  const [selectedBoard,   setSelectedBoard]    = useState(null);
  const [allSubs,         setAllSubs]          = useState([]);
  const [subjectIds,      setSubjectIds]       = useState([]);
  const [loadingSubjects, setLoadingSubjects]  = useState(false);
  const [submitting,      setSubmitting]       = useState(false);
  const [error,           setError]            = useState('');

  const requiresAllSubjects = !!selectedBoard?.requires_all_subjects;
  const maxSubjects = selectedBoard?.max_subjects ?? null;

  const goToSubjects = async (board) => {
    setSelectedBoard(board);
    setError('');
    setLoadingSubjects(true);
    try {
      const subs = await fetchSubjectsForType(board.id);
      // Only offer subjects that can actually be assigned. The shared
      // /catalog/types/:id/subjects endpoint deliberately returns every
      // subject regardless of is_active — other consumers (App Admin's own
      // subject-management screens in AdminDashboard.jsx) need to see and
      // manage inactive subjects too, so that filter can't live in the
      // backend without breaking that. But the assign endpoint's own
      // validation (server/routes/schoolRoutes.js POST
      // .../assign-exam-type) correctly rejects inactive subjects — so
      // without this filter, an inactive subject shows here as a normal
      // checkable option that will always fail on submit with a confusing
      // "does not belong to this exam board" error. Confirmed live via a
      // real case: exam_board_id=14 ("A-LEVELS") has a Business Studies
      // row (id=210) with is_active=false, distinct from the active one
      // under exam_board_id=5 ("GCE A' Levels").
      const assignableSubs = subs.filter(s => s.is_active !== false);
      setAllSubs(assignableSubs);
      setSubjectIds(board.requires_all_subjects ? assignableSubs.map(s => s.id) : []);
      setStep(2);
    } catch {
      setError('Could not load subjects for that exam type. Please try again.');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const toggleSubject = (id) => {
    if (requiresAllSubjects) return; // nothing to toggle — every subject is required
    setSubjectIds(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (maxSubjects !== null && prev.length >= maxSubjects) return prev;
      return [...prev, id];
    });
  };

  const canSubmit = useMemo(() => {
    if (!selectedBoard) return false;
    if (requiresAllSubjects) return allSubs.length > 0;
    return subjectIds.length > 0;
  }, [selectedBoard, requiresAllSubjects, allSubs.length, subjectIds.length]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/schools/students/${studentId}/assign-exam-type`, {
        exam_board_id: selectedBoard.id,
        subject_ids: subjectIds,
      });
      onAssigned?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not assign exam type.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            Assign Exam Type{studentName ? ` — ${studentName}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Step 1: pick exam board */}
        {step === 1 && (
          loadingTypes ? (
            <div className="flex justify-center py-10">
              <Loader2 size={20} className="animate-spin text-indigo-400" />
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {examTypes.filter(t => t.is_active !== false).map(board => (
                <button
                  key={board.id}
                  onClick={() => goToSubjects(board)}
                  disabled={loadingSubjects}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left disabled:opacity-50">
                  <span className="text-lg shrink-0 w-6">{board.icon_emoji || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{board.name}</p>
                    {board.full_name && (
                      <p className="text-xs text-gray-400 truncate">{board.full_name}</p>
                    )}
                  </div>
                  {board.requires_all_subjects ? (
                    <span className="text-[10px] font-semibold text-gray-400 shrink-0">All subjects</span>
                  ) : board.max_subjects != null ? (
                    <span className="text-[10px] font-semibold text-gray-400 shrink-0">Max {board.max_subjects}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )
        )}

        {/* Step 2: pick subjects (or confirm "all required") */}
        {step === 2 && selectedBoard && (
          <div>
            <button
              onClick={() => { setStep(1); setSelectedBoard(null); setError(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 mb-3">
              ← Choose a different exam type
            </button>

            {requiresAllSubjects ? (
              <div className="mb-4 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                Every subject is required for {selectedBoard.name} — no selection needed.
              </div>
            ) : (
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="text-gray-500">Select subjects</span>
                {maxSubjects != null && (
                  <span className={`font-semibold ${subjectIds.length >= maxSubjects ? 'text-red-500' : 'text-gray-400'}`}>
                    {subjectIds.length}/{maxSubjects}
                  </span>
                )}
              </div>
            )}

            {loadingSubjects ? (
              <div className="flex justify-center py-10">
                <Loader2 size={20} className="animate-spin text-indigo-400" />
              </div>
            ) : allSubs.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No subjects found for this exam type.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {allSubs.map(s => {
                  const checked  = subjectIds.includes(s.id);
                  const disabled = requiresAllSubjects ||
                    (!checked && maxSubjects != null && subjectIds.length >= maxSubjects);
                  return (
                    <label key={s.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                        checked ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100'
                      } ${disabled && !checked ? 'opacity-50' : 'cursor-pointer hover:border-indigo-200'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleSubject(s.id)}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm text-gray-800 flex-1 truncate">{s.name}</span>
                      {checked && <CheckCircle2 size={14} className="text-indigo-500 shrink-0" />}
                      {disabled && !checked && <Lock size={12} className="text-gray-300 shrink-0" />}
                    </label>
                  );
                })}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
