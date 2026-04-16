// client/src/pages/admin/TeacherAssignmentPage.jsx
// Admin page: assign subjects + exam types to teachers.

import { useState, useEffect } from 'react';
import api from "../../services/api";

import {
  UserCheck, Plus, Trash2, Loader2, CheckCircle,
  AlertTriangle, X, ChevronDown, Search,
} from 'lucide-react';

import TopNav from "../../components/TopNav";

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
  const [examTypes, setExamTypes] = useState(FALLBACK_EXAM_TYPES);
  const [loadingTypes, setLoadingTypes] = useState(true);

  const [subjects, setSubjects] = useState([]);
  const [loadingSubj, setLoadingSubj] = useState(false);

  const [teacherId, setTeacherId] = useState('');
  const [examTypeCode, setExamTypeCode] = useState('');
  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Load exam boards ────────────────────────────────────────────────────────
  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000')
      .replace(/\/$/, '');

    setLoadingTypes(true);

    fetch(`${base}/api/exam-boards`)
      .then(r => r.json())
      .then(json => {
        const list = Array.isArray(json) ? json : (json.data || []);
        if (list.length > 0) setExamTypes(list);
      })
      .catch(() => {})
      .finally(() => setLoadingTypes(false));
  }, []);

  // ── Load subjects on exam type change ───────────────────────────────────────
  useEffect(() => {
    setSubjectId('');
    setSubjects([]);
    if (!examTypeCode) return;

    const found = examTypes.find(e => e.code === examTypeCode);
    setExamTypeId(found?.id ?? '');

    setLoadingSubj(true);

    const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000')
      .replace(/\/$/, '');

    fetch(`${base}/api/exam-boards/${examTypeCode}/subjects`)
      .then(r => r.json())
      .then(json => {
        const list = Array.isArray(json) ? json : (json.data || []);
        setSubjects(list);
      })
      .catch(() => setSubjects([]))
      .finally(() => setLoadingSubj(false));
  }, [examTypeCode, examTypes]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!teacherId || !examTypeCode || !subjectId) {
      setError('Please fill in all fields.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.post('/admin/teacher-subjects', {
        teacher_id: teacherId,
        subject_id: subjectId,
        exam_board_id: examTypeId || null,
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">

        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-900 text-base">
            Assign Subject to Teacher
          </h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">

          {/* Teacher */}
          <select
            value={teacherId}
            onChange={e => setTeacherId(e.target.value)}
            className="w-full border rounded-xl px-4 py-2.5 text-sm"
          >
            <option value="">Select a teacher…</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>
                {t.first_name} {t.last_name}
              </option>
            ))}
          </select>

          {/* Exam Type */}
          <select
            value={examTypeCode}
            onChange={e => setExamTypeCode(e.target.value)}
            className="w-full border rounded-xl px-4 py-2.5 text-sm"
          >
            <option value="">Select exam type…</option>
            {examTypes.map(et => (
              <option key={et.code} value={et.code}>
                {et.name}
              </option>
            ))}
          </select>

          {/* Subject */}
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="w-full border rounded-xl px-4 py-2.5 text-sm"
          >
            <option value="">Select subject…</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {error && (
            <p className="text-red-600 text-xs">{error}</p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border rounded-xl py-2.5">
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-teal-500 text-white rounded-xl py-2.5"
          >
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
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = () => {
    setLoading(true);

    Promise.all([
      api.get('/admin/teacher-subjects').catch(() => ({ data: [] })),
      api.get('/admin/users?role=teacher').catch(() => ({ data: [] })),
    ])
      .then(([a, t]) => {
        setAssignments(a.data || []);
        setTeachers(t.data || []);
      })
      .finally(() => setLoading(false));
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
      a.exam_type_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="p-6">
        <button onClick={() => setShowDialog(true)}>
          <Plus /> Add Assignment
        </button>
      </div>

      {showDialog && (
        <AddAssignmentDialog
          teachers={teachers}
          onClose={() => setShowDialog(false)}
          onSaved={() => { load(); showToast('Saved'); }}
        />
      )}

      {toast && (
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
