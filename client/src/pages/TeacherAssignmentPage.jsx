// client/src/pages/admin/TeacherAssignmentPage.jsx
// Admin page: assign subjects + exam types to teachers.
// - "Exam Type" is the canonical label everywhere (no "exam board" / "curriculum").
// - All 12 exam types load dynamically from /api/exam-boards on dialog open.
// - Selecting an exam type populates the Subject dropdown from /api/exam-boards/:code/subjects.

import { useState, useEffect } from 'react';
import api from "../services/api";
import {
  UserCheck, Plus, Trash2, Loader2, CheckCircle,
  AlertTriangle, X, ChevronDown, Search,
} from 'lucide-react';
import TopNav from '../../components/TopNav';

// ── Fallback static list (shown instantly; replaced by API data) ──────────────
const FALLBACK_EXAM_TYPES = [
  { id: null, code: 'JAMB',    name: 'JAMB / UTME',             icon_emoji: '' },
  { id: null, code: 'WAEC',    name: 'WAEC',                    icon_emoji: '' },
  { id: null, code: 'GCE_OL',  name: 'GCE O-Levels',            icon_emoji: '' },
  { id: null, code: 'NECO',    name: 'NECO',                    icon_emoji: '' },
  { id: null, code: 'IELTS',   name: 'IELTS',                   icon_emoji: '' },
  { id: null, code: 'TOEFL',   name: 'TOEFL',                   icon_emoji: '' },
  { id: null, code: 'SAT',     name: 'SAT',                     icon_emoji: '' },
  { id: null, code: 'GCE_AL',  name: 'GCE A-Levels',            icon_emoji: '' },
  { id: null, code: 'JUPEB',   name: 'JUPEB',                   icon_emoji: '' },
  { id: null, code: 'LANG_EN', name: 'Language Lab. – English', icon_emoji: '' },
  { id: null, code: 'LANG_FR', name: 'Language Lab. – French',  icon_emoji: '' },
  { id: null, code: 'LANG_YO', name: 'Language Lab. – Yoruba',  icon_emoji: '' },
];

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white
      ${type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
      {type === 'success'
        ? <CheckCircle size={14} className="text-teal-400" />
        : <AlertTriangle size={14} />}
      {msg}
      <button onClick={onClose}><X size={13} className="opacity-60" /></button>
    </div>
  );
}

// ── Add Assignment Dialog ─────────────────────────────────────────────────────
function AddAssignmentDialog({ teachers, onClose, onSaved }) {
  const [examTypes,    setExamTypes]    = useState(FALLBACK_EXAM_TYPES);
  const [loadingTypes, setLoadingTypes] = useState(true);

  const [subjects,     setSubjects]     = useState([]);
  const [loadingSubj,  setLoadingSubj]  = useState(false);

  const [teacherId,    setTeacherId]    = useState('');
  const [examTypeCode, setExamTypeCode] = useState('');
  const [examTypeId,   setExamTypeId]   = useState('');
  const [subjectId,    setSubjectId]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  // ── 1. Load exam boards dynamically on mount ───────────────────────────────
  useEffect(() => {
    const _ta = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const apiBase = _ta.endsWith('/api') ? _ta : `${_ta}/api`;
    setLoadingTypes(true);
    fetch(`${apiBase}/exam-boards`)
      .then(r => r.json())
      .then(json => {
        const list = Array.isArray(json) ? json : (json.data || []);
        if (list.length > 0) setExamTypes(list);
      })
      .catch(() => { /* keep fallback list */ })
      .finally(() => setLoadingTypes(false));
  }, []);

  // ── 2. Load subjects when exam type changes ────────────────────────────────
  useEffect(() => {
    setSubjectId('');
    setSubjects([]);
    if (!examTypeCode) return;

    const found = examTypes.find(e => e.code === examTypeCode);
    setExamTypeId(found?.id ?? '');

    setLoadingSubj(true);
    const _ta = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const apiBase = _ta.endsWith('/api') ? _ta : `${_ta}/api`;
    fetch(`${apiBase}/exam-boards/${examTypeCode}/subjects`)
      .then(r => r.json())
      .then(json => setSubjects(Array.isArray(json) ? json : (json.data || [])))
      .catch(() => setSubjects([]))
      .finally(() => setLoadingSubj(false));
  }, [examTypeCode, examTypes]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!teacherId || !examTypeCode || !subjectId) {
      setError('Please fill in all fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/admin/teacher-subjects', {
        teacher_id:    teacherId,
        subject_id:    subjectId,
        exam_board_id: examTypeId || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.error || err?.message || 'Failed to save assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center">
              <UserCheck size={16} className="text-teal-600" />
            </div>
            <h2 className="font-bold text-gray-900 text-base">Assign Subject to Teacher</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">

          {/* ── Teacher ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Teacher *</label>
            <div className="relative">
              <select
                value={teacherId}
                onChange={e => setTeacherId(e.target.value)}
                className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm
                  bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
              >
                <option value="">Select a teacher…</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.first_name} {t.last_name} — {t.email}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* ── Exam Type (dynamic) ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Exam Type *</label>
            <div className="relative">
              {loadingTypes ? (
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-gray-50">
                  <Loader2 size={13} className="animate-spin" /> Loading exam types…
                </div>
              ) : (
                <>
                  <select
                    value={examTypeCode}
                    onChange={e => setExamTypeCode(e.target.value)}
                    className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm
                      bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
                  >
                    <option value="">Select exam type…</option>
                    {examTypes.map(et => (
                      <option key={et.code} value={et.code}>
                        {et.icon_emoji || ''} {et.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </>
              )}
            </div>
          </div>

          {/* ── Subject (populates from selected exam type) ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject *</label>
            <div className="relative">
              {loadingSubj ? (
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-gray-50">
                  <Loader2 size={13} className="animate-spin" /> Loading subjects…
                </div>
              ) : (
                <>
                  <select
                    value={subjectId}
                    onChange={e => setSubjectId(e.target.value)}
                    disabled={!examTypeCode}
                    className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm
                      bg-white focus:outline-none focus:ring-2 focus:ring-teal-300
                      disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {examTypeCode
                        ? subjects.length > 0
                          ? 'Select a subject…'
                          : 'No subjects found for this exam type'
                        : 'Select exam type first'}
                    </option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.level && s.level !== 'All' ? ` (${s.level})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </>
              )}
            </div>

            {/* Subject count badge */}
            {examTypeCode && subjects.length > 0 && !loadingSubj && (
              <p className="text-xs text-teal-600 mt-1">
                 {subjects.length} subject{subjects.length !== 1 ? 's' : ''} available
              </p>
            )}

            {/* Warning when no subjects */}
            {examTypeCode && subjects.length === 0 && !loadingSubj && (
              <p className="text-xs text-amber-600 mt-1">
                 No subjects exist for this exam type yet. Run the seed SQL or add subjects via Content Management.
              </p>
            )}
          </div>

          {/* Subject description preview */}
          {subjectId && (() => {
            const found = subjects.find(s => String(s.id) === String(subjectId));
            return found?.description ? (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                 {found.description}
              </p>
            ) : null;
          })()}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !teacherId || !examTypeCode || !subjectId}
            className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? 'Saving…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function TeacherAssignmentPage() {
  const [assignments, setAssignments] = useState([]);
  const [teachers,    setTeachers]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showDialog,  setShowDialog]  = useState(false);
  const [toast,       setToast]       = useState(null);
  const [search,      setSearch]      = useState('');
  const [removing,    setRemoving]    = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/admin/teacher-subjects').catch(() => ({ data: [] })),
      api.get('/admin/users?role=teacher').catch(() => ({ data: [] })),
    ]).then(([asgRes, teacherRes]) => {
      setAssignments(asgRes.data || []);
      setTeachers(teacherRes.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRemove = async (id) => {
    setRemoving(id);
    try {
      await api.delete(`/admin/teacher-subjects/${id}`);
      setAssignments(prev => prev.filter(a => a.id !== id));
      showToast('Assignment removed.');
    } catch {
      showToast('Failed to remove assignment.', 'error');
    } finally {
      setRemoving(null);
    }
  };

  const filtered = assignments.filter(a => {
    const q = search.toLowerCase();
    return (
      a.teacher_name?.toLowerCase().includes(q) ||
      a.subject_name?.toLowerCase().includes(q) ||
      a.exam_type_name?.toLowerCase().includes(q) ||
      a.exam_board_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Header */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-white/50 text-xs mb-1">Admin</p>
            <h1 className="text-white text-xl font-bold">Teacher Assignment</h1>
            <p className="text-white/60 text-sm mt-0.5">Assign subjects and exam types to teachers</p>
          </div>
          <button
            onClick={() => setShowDialog(true)}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            <Plus size={15} /> Add Assignment
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by teacher, subject, or exam type…"
            className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="text-teal-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <UserCheck size={36} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-400">No assignments found. Add one to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Teacher</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Exam Type</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{a.teacher_name || a.teacher_email}</p>
                      <p className="text-xs text-gray-400">{a.teacher_email}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700">
                      {a.exam_type_name || a.exam_board_name || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700">{a.subject_name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold
                        ${a.is_active ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-400'}`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleRemove(a.id)}
                        disabled={removing === a.id}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Remove assignment"
                      >
                        {removing === a.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDialog && (
        <AddAssignmentDialog
          teachers={teachers}
          onClose={() => setShowDialog(false)}
          onSaved={() => { load(); showToast('Assignment saved successfully!'); }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
