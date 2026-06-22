import { getToken } from '../utils/token';
// client/src/components/AdminBulkUploadPanel.jsx
// Admin-only bulk file uploader.
//
// WORKFLOW:
//   Stage 1 — DROP / SELECT up to 20 files  →  upload all at once
//   Stage 2 — Staged files list              →  assign Exam Type → Subject → Topic → Subtopic per file
//   Stage 3 — (optional) assign to students  →  specific students OR all students
//
// API calls:
//   POST /api/resources/bulk-upload
//   GET  /api/resources/staged
//   PUT  /api/resources/:id/assign-meta
//   PUT  /api/resources/:id/assign-users
//   GET  /api/catalog/types
//   GET  /api/catalog/types/:id/subjects
//   GET  /api/teacher/topics?subject_id=
//   GET  /api/teacher/subtopics?topic_id=
//   GET  /api/users?role=student

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/apiClient';
import {
  Upload, FileText, Video, Music, Image, File,
  CheckCircle, AlertTriangle, X, Loader2,
  ChevronDown, Users, Tag, RefreshCw, Inbox, BookOpen, Trash2,
} from 'lucide-react';

/* ── Toast notification ───────────────────────────────────────────────────── */
function Toast({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300
            ${t.type === 'success' ? 'bg-green-600 text-white' : t.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'}`}
        >
          {t.type === 'success' && <CheckCircle size={16} className="shrink-0" />}
          {t.type === 'error'   && <AlertTriangle size={16} className="shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);
  return { toasts, show };
}

// Shared delete helper
async function deleteResource(id) {
  if (!window.confirm('Delete this file permanently? This also removes any student assignments to it.')) return false;
  try {
    await api.delete(`/resources/${id}`);
    return true;
  } catch (err) {
    alert(err?.message || 'Failed to delete file.');
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const extract = (r) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []);
const fmtSize = (b) => (!b ? '' : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

function FileIcon({ type, size = 16 }) {
  if (type === 'video') return <Video   size={size} className="text-blue-500"   />;
  if (type === 'pdf')   return <FileText size={size} className="text-red-500"    />;
  if (type === 'image') return <Image   size={size} className="text-green-500"  />;
  if (type === 'audio') return <Music   size={size} className="text-purple-500" />;
  return <File size={size} className="text-amber-500" />;
}

function StatusBadge({ staged }) {
  return staged
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Unassigned</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Assigned</span>;
}

// ── Cascade dropdowns hook ────────────────────────────────────────────────────
// All four levels (Exam Type → Subject → Topic → Subtopic) are independently
// usable. Subject is NOT gated by Exam Type — when no Exam Type is picked we
// load every active subject so admins can always tag a file. Picking an Exam
// Type filters the subject list down to that exam's subjects.
function useMeta() {
  const [examTypes,  setExamTypes]  = useState([]);
  const [subjects,   setSubjects]   = useState([]);
  const [topics,     setTopics]     = useState([]);
  const [subtopics,  setSubtopics]  = useState([]);

  // Always have ALL subjects available so the dropdown is never empty/locked.
  const loadAllSubjects = useCallback(() => {
    api.get('/catalog/all-subjects')
      .then(r => setSubjects(extract(r)))
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    api.get('/catalog/types').then(r => setExamTypes(extract(r))).catch(() => {});
    loadAllSubjects();
  }, [loadAllSubjects]);

  const loadSubjects = useCallback((typeId) => {
    setTopics([]); setSubtopics([]);
    if (!typeId) { loadAllSubjects(); return; }
    api.get(`/catalog/types/${typeId}/subjects`)
      .then(r => setSubjects(extract(r)))
      .catch(() => setSubjects([]));
  }, [loadAllSubjects]);

  const loadTopics = useCallback((subjectId) => {
    setTopics([]); setSubtopics([]);
    if (!subjectId) return;
    api.get('/teacher/topics', { params: { subject_id: String(subjectId) } })
      .then(r => setTopics(extract(r))).catch(() => {});
  }, []);

  const loadSubtopics = useCallback((topicId) => {
    setSubtopics([]);
    if (!topicId) return;
    api.get('/teacher/subtopics', { params: { topic_id: String(topicId) } })
      .then(r => setSubtopics(extract(r))).catch(() => {});
  }, []);

  return { examTypes, subjects, topics, subtopics, loadSubjects, loadTopics, loadSubtopics };
}

// ── Per-file metadata form ────────────────────────────────────────────────────
function MetaForm({ file, onSave, onDismiss, onSuccess }) {
  const [form, setForm] = useState({
    title:        file.title || '',
    examTypeId:   '',
    subjectId:    '',
    // Topic & subtopic are now free-text combo fields. We track BOTH the
    // chosen id (when the typed name matches an existing entry exactly) and
    // the raw name (so brand-new topics/subtopics can be created on save).
    topicId:      '',
    topicName:    '',
    subtopicId:   '',
    subtopicName: '',
    pushType:     'learning_material',
    contentKind:  'learning_material',
  });
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState('');
  const { examTypes, subjects, topics, subtopics, loadSubjects, loadTopics, loadSubtopics } = useMeta();

  // Resolve a free-text topic/subtopic name against the loaded list so that
  // an exact match still ends up linked to the existing row instead of
  // duplicating it.
  const matchByName = (list, name) => {
    if (!name) return '';
    const needle = name.trim().toLowerCase();
    const hit = list.find(x => (x.name || '').trim().toLowerCase() === needle);
    return hit ? hit.id : '';
  };

  const set = (field, val) => {
    setForm(f => {
      const next = { ...f, [field]: val };
      if (field === 'examTypeId') {
        next.subjectId = ''; next.topicId = ''; next.topicName = '';
        next.subtopicId = ''; next.subtopicName = '';
        loadSubjects(val);
      }
      if (field === 'subjectId') {
        next.topicId = ''; next.topicName = '';
        next.subtopicId = ''; next.subtopicName = '';
        loadTopics(val);
      }
      if (field === 'topicName') {
        next.topicId = matchByName(topics, val);
        // Subtopic options depend on the selected topic id; clear them when
        // the typed name no longer matches a known topic.
        if (!next.topicId) { next.subtopicId = ''; }
        else loadSubtopics(next.topicId);
      }
      if (field === 'subtopicName') {
        next.subtopicId = matchByName(subtopics, val);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.subjectId && !form.topicName.trim()) {
      setMsg('Please pick at least a subject or type a topic.');
      return;
    }
    setSaving(true); setMsg('');
    try {
      // 1) If the admin typed a brand-new topic, create it now and grab its id.
      let topicId = form.topicId;
      const topicName = form.topicName.trim();
      if (!topicId && topicName && form.subjectId) {
        try {
          const r = await api.post('/teacher/topics', {
            subject_id: form.subjectId,
            name:       topicName,
          });
          topicId = r?.data?.id || '';
        } catch (err) {
          setMsg(err?.message || 'Could not create the new topic.');
          setSaving(false);
          return;
        }
      }

      // 2) Same for subtopic — but only if we have a parent topic id.
      let subtopicId = form.subtopicId;
      const subtopicName = form.subtopicName.trim();
      if (!subtopicId && subtopicName && topicId) {
        try {
          const r = await api.post('/teacher/subtopics', {
            topic_id:   topicId,
            subject_id: form.subjectId || null,
            name:       subtopicName,
          });
          subtopicId = r?.data?.id || '';
        } catch (err) {
          setMsg(err?.message || 'Could not create the new subtopic.');
          setSaving(false);
          return;
        }
      }

      // 3) Save the resource metadata.
      await api.put(`/resources/${file.id}/assign-meta`, {
        title:        form.title.trim() || file.title,
        topic_id:     topicId    || null,
        subtopic_id:  subtopicId || null,
        subject_id:   form.subjectId   || null,
        push_type:    form.pushType    || 'learning_material',
        content_kind: form.contentKind || 'learning_material',
      });
      if (onSuccess) onSuccess(`✅ "${form.title.trim() || file.title}" saved & published successfully.`);
      onSave(file.id);
    } catch (err) {
      setMsg(err?.message || 'Save failed.');
      setSaving(false);
    }
  };

  // Dropdowns are always enabled — when the parent list is empty we surface
  // a clearly-worded placeholder option instead of locking the field.
  const sel = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
      <p className="text-xs font-semibold text-gray-600">Assign metadata to this file</p>

      {/* Title */}
      <input value={form.title} onChange={e => set('title', e.target.value)}
        placeholder="Title (leave blank to keep filename)"
        className={sel} />

      {/* Exam Type */}
      <select value={form.examTypeId} onChange={e => set('examTypeId', e.target.value)} className={sel}>
        <option value="">Select Exam Type (optional)…</option>
        {examTypes.map(t => {
          const emoji = t.icon_emoji?.trim();
          const safeIcon = (!emoji || emoji === '?' || emoji === '\uFFFD') ? '' : emoji;
          return <option key={t.id} value={t.id}>{safeIcon ? safeIcon + ' ' : ''}{t.name || t.code}</option>;
        })}
      </select>

      {/* Subject — always enabled. With no Exam Type, lists ALL subjects. */}
      <select value={form.subjectId} onChange={e => set('subjectId', e.target.value)} className={sel}>
        <option value="">
          {form.examTypeId ? 'Select Subject…' : 'Select Subject (showing all)…'}
        </option>
        {subjects.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}{s.exam_board_code ? ` · ${s.exam_board_code}` : ''}
          </option>
        ))}
      </select>

      {/* Topic — type to create a new one, or pick from the suggestions list. */}
      <div>
        <input
          list={`topic-suggestions-${file.id}`}
          value={form.topicName}
          onChange={e => set('topicName', e.target.value)}
          placeholder={
            !form.subjectId
              ? 'Pick a Subject first…'
              : topics.length === 0
                ? 'Type a topic name (none defined yet)'
                : 'Type a topic — or pick from suggestions'
          }
          disabled={!form.subjectId}
          className={sel + ' disabled:bg-gray-50 disabled:text-gray-400'}
        />
        <datalist id={`topic-suggestions-${file.id}`}>
          {topics.map(t => <option key={t.id} value={t.name} />)}
        </datalist>
        {form.subjectId && form.topicName.trim() && !form.topicId && (
          <p className="text-[10px] text-emerald-600 mt-1 ml-1">
            ✨ New topic — will be created on save
          </p>
        )}
      </div>

      {/* Subtopic — same combobox pattern. Requires a topic name first. */}
      <div>
        <input
          list={`subtopic-suggestions-${file.id}`}
          value={form.subtopicName}
          onChange={e => set('subtopicName', e.target.value)}
          placeholder={
            !form.topicName.trim()
              ? 'Type a Topic first…'
              : subtopics.length === 0
                ? 'Type a subtopic name (optional)'
                : 'Type a subtopic — or pick from suggestions'
          }
          disabled={!form.topicName.trim()}
          className={sel + ' disabled:bg-gray-50 disabled:text-gray-400'}
        />
        <datalist id={`subtopic-suggestions-${file.id}`}>
          {subtopics.map(s => <option key={s.id} value={s.name} />)}
        </datalist>
        {form.topicId && form.subtopicName.trim() && !form.subtopicId && (
          <p className="text-[10px] text-emerald-600 mt-1 ml-1">
            ✨ New subtopic — will be created on save
          </p>
        )}
      </div>

      {/* Content Kind — what this file actually IS for students */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Content Kind</p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => set('contentKind', 'learning_material')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              form.contentKind === 'learning_material'
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
            }`}>
            📖 Learning Material
          </button>
          <button type="button" onClick={() => set('contentKind', 'question_bank')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              form.contentKind === 'question_bank'
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'
            }`}>
            ❓ Question Bank (extract with AI)
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
          {form.contentKind === 'question_bank'
            ? 'On save, AI will read this file and create reviewable quiz questions for the chosen subject/topic. Students will see them as practice/quiz questions — not as a download.'
            : 'Students will see this as a downloadable resource (PDF, video, slides, etc.).'}
        </p>
      </div>

      {/* Push type */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Resource Type</p>
        <div className="flex gap-2 flex-wrap">
          {PUSH_TYPES.map(pt => (
            <button key={pt.value} type="button" onClick={() => set('pushType', pt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                form.pushType === pt.value
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
              }`}>
              {pt.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="text-xs text-red-600">{msg}</p>}

      {/* Enforce subject requirement before allowing publish */}
      {!form.subjectId && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ A <strong>Subject</strong> is required before publishing. Files without a subject cannot be found by students.
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !form.subjectId}
          title={!form.subjectId ? 'Select a Subject first' : ''}
          className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          Save & Publish
        </button>
        <button onClick={onDismiss} disabled={saving}
          className="px-3 py-2 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-100">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Push-type options ─────────────────────────────────────────────────────────
// Canonical vocabulary, shared with TeacherResourcesPage.jsx and the student
// categorizer in StudentFilesPage.jsx. Adding new values? Update all three.
const PUSH_TYPES = [
  { value: 'learning_material', label: '📚 Learning Material' },
  { value: 'practice_test',     label: '📝 Practice Test'     },
  { value: 'quiz',              label: '⚡ Quiz'               },
];

// ── Per-file assign-users form ────────────────────────────────────────────────
function AssignUsersForm({ file, onDone, onDismiss, onSuccess }) {
  const [students,      setStudents]      = useState([]);
  const [classes,       setClasses]       = useState([]);
  const [selected,      setSelected]      = useState([]);
  const [selectedClass, setSelectedClass] = useState([]);
  const [assignAll,     setAssignAll]     = useState(false);
  const [pushType,      setPushType]      = useState(file.push_type || 'learning_material');
  const [search,        setSearch]        = useState('');
  const [saving,        setSaving]        = useState(false);
  const [msg,           setMsg]           = useState('');
  // assignTarget: 'students' | 'class'  — mutually exclusive (A)
  const [assignTarget,  setAssignTarget]  = useState('students');

  useEffect(() => {
    api.get('/users', { params: { role: 'student' } }).then(r => setStudents(extract(r))).catch(() => {});
    api.get('/teacher/classes').then(r => setClasses(extract(r))).catch(() => {});
  }, []);

  // When target switches, clear the other selection (A — prevent broken assignments)
  const switchTarget = (t) => {
    setAssignTarget(t);
    setMsg('');
    if (t === 'students') { setSelectedClass([]); }
    if (t === 'class')    { setSelected([]); setAssignAll(false); }
  };

  const filtered = students.filter(s =>
    `${s.first_name} ${s.last_name} ${s.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStudent = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleClass   = (id) => setSelectedClass(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleAssign = async () => {
    // Guard: must have a target (A — no broken assignments)
    if (assignTarget === 'students' && !assignAll && selected.length === 0) {
      setMsg('Select at least one student, or tick "All active students".'); return;
    }
    if (assignTarget === 'class' && selectedClass.length === 0) {
      setMsg('Select at least one class.'); return;
    }
    setSaving(true); setMsg('');
    try {
      const result = await api.put(`/resources/${file.id}/assign-users`, {
        assign_all: assignTarget === 'students' && assignAll,
        user_ids:   assignTarget === 'students' && !assignAll ? selected : [],
        class_ids:  assignTarget === 'class' ? selectedClass : [],
        push_type:  pushType,
      });

      // Build a friendly summary message
      let summary = `✅ "${file.title}" pushed successfully.`;
      if (result?.student_count > 0 && result?.class_count > 0) {
        summary = `✅ "${file.title}" pushed to ${result.student_count} student(s) and ${result.class_count} class(es).`;
      } else if (result?.student_count > 0) {
        summary = assignAll
          ? `✅ "${file.title}" pushed to all active students.`
          : `✅ "${file.title}" pushed to ${result.student_count} student(s).`;
      } else if (result?.class_count > 0) {
        summary = `✅ "${file.title}" pushed to ${result.class_count} class(es).`;
      }
      if (onSuccess) onSuccess(summary);
      onDone(file.id);
    } catch (err) {
      setMsg(err?.message || 'Assignment failed.');
      setSaving(false);
    }
  };

  const tabCls = (t) => `px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
    assignTarget === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
  }`;

  return (
    <div className="border-t border-gray-100 bg-blue-50 px-4 py-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">Push resource to students / classes</p>

      {/* Resource type — lecture or question (A) */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Resource Type</p>
        <div className="flex gap-2 flex-wrap">
          {PUSH_TYPES.map(pt => (
            <button key={pt.value} type="button" onClick={() => setPushType(pt.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                pushType === pt.value
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
              }`}>
              {pt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target: Students OR Class — mutually exclusive (A) */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Assign To</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => switchTarget('students')} className={tabCls('students')}>👤 Individual Students</button>
          <button type="button" onClick={() => switchTarget('class')}    className={tabCls('class')}>🏫 A Class</button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Assign to students OR a class — not both at once.</p>
      </div>

      {/* Students pane */}
      {assignTarget === 'students' && (
        <>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={assignAll} onChange={e => setAssignAll(e.target.checked)} className="rounded text-blue-500" />
            <span className="text-xs text-gray-700 font-medium">All active students ({students.length})</span>
          </label>
          {!assignAll && (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search student by name or email…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                {filtered.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-4">No students found.</p>
                  : filtered.map(s => (
                    <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleStudent(s.id)} className="rounded text-blue-500" />
                      <span className="text-xs text-gray-800">{s.first_name} {s.last_name}</span>
                      <span className="text-xs text-gray-400 ml-auto truncate max-w-[120px]">{s.email}</span>
                    </label>
                  ))}
              </div>
              {selected.length > 0 && <p className="text-xs text-blue-600 font-medium">{selected.length} student(s) selected</p>}
            </>
          )}
        </>
      )}

      {/* Classes pane */}
      {assignTarget === 'class' && (
        <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg bg-white">
          {classes.length === 0
            ? <p className="text-xs text-gray-400 text-center py-4">No classes found.</p>
            : classes.map(c => (
              <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                <input type="checkbox" checked={selectedClass.includes(c.id)} onChange={() => toggleClass(c.id)} className="rounded text-blue-500" />
                <span className="text-xs text-gray-800">{c.name}</span>
                <span className="text-xs text-gray-400 ml-auto">{c.student_count ?? 0} students</span>
              </label>
            ))}
        </div>
      )}

      {msg && <p className="text-xs text-red-600 font-medium">{msg}</p>}

      <div className="flex gap-2">
        <button onClick={handleAssign} disabled={saving}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
          Push Resource
        </button>
        <button onClick={onDismiss} className="px-3 py-2 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-100">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RESOURCE LIBRARY — lets admin re-push any published resource (#9)
// ══════════════════════════════════════════════════════════════════════════════
function ResourceLibrarySection() {
  const [resources,     setResources]     = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [open,          setOpen]          = useState(false);
  const [pushing,       setPushing]       = useState(null); // resource id
  const [assigningMeta, setAssigningMeta] = useState(null); // resource id
  const [search,        setSearch]        = useState('');
  const { toasts, show: showToast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    api.get('/resources')
      .then(r => setResources(extract(r)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const filtered = resources.filter(r =>
    !r.is_staged &&
    `${r.title} ${r.subject_name || ''} ${r.resource_type || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <Toast toasts={toasts} />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-900">Resource Library</h3>
          <span className="text-xs text-gray-400">— re-push any published resource</span>
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className="text-xs font-semibold text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          {open ? 'Collapse ▲' : 'Browse Library ▼'}
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, subject or type…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No published resources found.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {filtered.map(file => {
                const hasMetadata = !!(file.subject_id || file.topic_id || file.subtopic_id);
                return (
                <div key={file.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <FileIcon type={file.resource_type} size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{file.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400 capitalize">{file.resource_type || 'file'}</span>
                        {file.subject_name && (
                          <><span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-blue-600">{file.subject_name}</span></>
                        )}
                        {file.push_type && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                            {file.push_type}
                          </span>
                        )}
                        {file.content_kind === 'question_bank' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            ❓ Question Bank
                          </span>
                        )}
                        {!hasMetadata && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            ⚠️ No subject/topic
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!hasMetadata) {
                          setAssigningMeta(assigningMeta === file.id ? null : file.id);
                          setPushing(null);
                        } else {
                          setPushing(pushing === file.id ? null : file.id);
                          setAssigningMeta(null);
                        }
                      }}
                      disabled={hasMetadata ? false : false}
                      title={!hasMetadata ? 'Assign a subject or topic before pushing' : 'Push to students'}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        !hasMetadata
                          ? assigningMeta === file.id
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'border-orange-300 text-orange-600 hover:bg-orange-50'
                          : pushing === file.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                      }`}
                    >
                      <Users size={11} />
                      {!hasMetadata
                        ? (assigningMeta === file.id ? 'Cancel' : 'Assign First')
                        : (pushing === file.id ? 'Cancel' : 'Push')
                      }
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await deleteResource(file.id);
                        if (ok) setResources(prev => prev.filter(r => r.id !== file.id));
                      }}
                      title="Delete file"
                      className="flex items-center justify-center text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {!hasMetadata && assigningMeta !== file.id && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                        ⚠️ No subject or topic assigned. Click <strong>Assign First</strong> above to add curriculum metadata, then you can push to students.
                      </p>
                    </div>
                  )}

                  {assigningMeta === file.id && (
                    <MetaForm
                      file={file}
                      onSave={(fileId) => {
                        setAssigningMeta(null);
                        // Refresh the library so the updated metadata shows
                        load();
                        showToast(`✅ "${file.title}" metadata saved. You can now push it to students.`, 'success');
                      }}
                      onDismiss={() => setAssigningMeta(null)}
                    />
                  )}

                  {pushing === file.id && (
                    <AssignUsersForm
                      file={file}
                      onDone={() => setPushing(null)}
                      onDismiss={() => setPushing(null)}
                      onSuccess={(msg) => showToast(msg, 'success')}
                    />
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminBulkUploadPanel() {
  const { toasts, show: showToast } = useToast();
  // ── Dropzone state ───────────────────────────────────────────────────────────
  const [pendingFiles, setPendingFiles] = useState([]);   // FileList objects not yet uploaded
  const [dragOver,     setDragOver]     = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [uploadProg,   setUploadProg]   = useState(0);    // overall %
  const fileInputRef = useRef(null);

  // ── Staged files (uploaded, awaiting metadata) ───────────────────────────────
  const [staged,       setStaged]       = useState([]);
  const [loadingStaged,setLoadingStaged]= useState(true);

  // ── Active actions per file ──────────────────────────────────────────────────
  const [assigningMeta,  setAssigningMeta]  = useState(null); // file id
  const [assigningUsers, setAssigningUsers] = useState(null); // file id

  // ── Upload result ────────────────────────────────────────────────────────────
  const [result, setResult] = useState(null); // { uploaded, failed, message, failures }

  // ── Load staged files on mount ───────────────────────────────────────────────
  const loadStaged = useCallback(() => {
    setLoadingStaged(true);
    api.get('/resources/staged')
      .then(r => setStaged(extract(r)))
      .catch(() => setStaged([]))
      .finally(() => setLoadingStaged(false));
  }, []);
  useEffect(loadStaged, [loadStaged]);

  // ── File selection ────────────────────────────────────────────────────────────
  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).slice(0, 20);
    setPendingFiles(arr);
    setResult(null);
  };

  const removePending = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  // ── Upload ────────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true); setUploadProg(0); setResult(null);

    const fd = new FormData();
    pendingFiles.forEach(f => fd.append('files', f));

    try {
      // Use same fallback as apiClient.js so XHR never hits the wrong server
      const envBase = import.meta.env.VITE_API_URL || '';
      const rawBase = envBase || 'https://www.aischoolonair.ng';
      const apiBase = rawBase.replace(/\/$/, '').endsWith('/api')
        ? rawBase.replace(/\/$/, '')
        : rawBase.replace(/\/$/, '') + '/api';
      const token   = getToken() || '';

      const res = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBase}/resources/bulk-upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadProg(Math.round(e.loaded / e.total * 100)); };
        xhr.onload = () => {
          try {
            const r = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(r);
            else reject(new Error(r.error || `Server error ${xhr.status}`));
          } catch { reject(new Error(`Server error ${xhr.status}`)); }
        };
        xhr.onerror = () => reject(new Error('Network error.'));
        xhr.send(fd);
      });

      setResult(res);
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadStaged(); // refresh staged list
    } catch (err) {
      setResult({ success: false, message: err.message, uploaded: 0, failed: pendingFiles.length });
    } finally {
      setUploading(false);
    }
  };

  // ── After metadata saved ──────────────────────────────────────────────────────
  const handleMetaSaved = (fileId) => {
    setAssigningMeta(null);
    setStaged(prev => prev.filter(f => f.id !== fileId));
  };

  // ── After users assigned ──────────────────────────────────────────────────────
  const handleUsersDone = (fileId) => {
    setAssigningUsers(null);
    // File stays in staged until metadata is also set — just close the form
  };

  // ── MIME guesser from filename extension ─────────────────────────────────────
  const guessType = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['mp4','webm','mov'].includes(ext)) return 'video';
    if (['mp3','wav','m4a'].includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
    return 'other';
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Toast toasts={toasts} />

      {/* ── Section header ── */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Bulk File Upload</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload up to 20 files at once. Files are saved immediately and held in a staging area.
          Assign each file an Exam Type, Subject and Topic to make it visible to students.
        </p>
      </div>

      {/* ══ STAGE 1: Drop Zone ══════════════════════════════════════════════════ */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !pendingFiles.length && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors
          ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}
          ${pendingFiles.length ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".mp4,.webm,.mov,.mp3,.wav,.m4a,.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp"
          onChange={e => handleFiles(e.target.files)}
        />
        {pendingFiles.length === 0 ? (
          <>
            <Upload size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-semibold text-gray-600">Drop up to 20 files here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, PPTX, MP4, MP3, Images · 500 MB max per file</p>
          </>
        ) : (
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">{pendingFiles.length} file(s) ready to upload</p>
              <button onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add more</button>
            </div>
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2">
                <FileIcon type={guessType(f)} size={16} />
                <span className="text-xs text-gray-700 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{fmtSize(f.size)}</span>
                <button onClick={e => { e.stopPropagation(); removePending(i); }}
                  className="text-gray-300 hover:text-red-500 shrink-0"><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload progress */}
      {uploading && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Uploading {pendingFiles.length} file(s)…</span>
            <span>{uploadProg}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-200" style={{ width: `${uploadProg}%` }} />
          </div>
        </div>
      )}

      {/* Upload button */}
      {pendingFiles.length > 0 && (
        <button onClick={handleUpload} disabled={uploading}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold
            py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
          {uploading
            ? <><Loader2 size={15} className="animate-spin" /> Uploading {uploadProg}%…</>
            : <><Upload size={15} /> Upload {pendingFiles.length} File{pendingFiles.length > 1 ? 's' : ''}</>}
        </button>
      )}

      {/* Upload result banner */}
      {result && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm
          ${result.uploaded > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {result.uploaded > 0
            ? <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
            : <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p className="font-semibold text-gray-800">{result.message}</p>
            {result.failures?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {result.failures.map((f, i) => (
                  <li key={i} className="text-xs text-red-600">✕ {f.filename}: {f.error}</li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={() => setResult(null)}><X size={14} className="text-gray-400" /></button>
        </div>
      )}

      {/* ══ STAGE 2: Staged files ═══════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Inbox size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-gray-900">Staged Files — Awaiting Assignment</h3>
            {staged.length > 0 && (
              <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {staged.length}
              </span>
            )}
          </div>
          <button onClick={loadStaged} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {loadingStaged ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        ) : staged.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-2xl text-gray-400">
            <CheckCircle size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No staged files — all files have been assigned.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staged.map(file => (
              <div key={file.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {/* File row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <FileIcon type={file.type} size={18} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{file.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400 capitalize">{file.type || 'file'}</span>
                      {file.file_size_bytes && <><span className="text-xs text-gray-300">·</span><span className="text-xs text-gray-400">{fmtSize(file.file_size_bytes)}</span></>}
                      {file.original_filename && file.original_filename !== file.title && (
                        <><span className="text-xs text-gray-300">·</span><span className="text-xs text-gray-400 truncate max-w-[150px]">{file.original_filename}</span></>
                      )}
                    </div>
                  </div>
                  <StatusBadge staged={true} />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setAssigningMeta(assigningMeta === file.id ? null : file.id);
                        setAssigningUsers(null);
                      }}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors
                        ${assigningMeta === file.id
                          ? 'bg-blue-500 text-white'
                          : 'border border-blue-200 text-blue-600 hover:bg-blue-50'}`}
                    >
                      <Tag size={12} />
                      {assigningMeta === file.id ? 'Cancel' : 'Assign'}
                    </button>
                    <button
                      onClick={() => {
                        setAssigningUsers(assigningUsers === file.id ? null : file.id);
                        setAssigningMeta(null);
                      }}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors
                        ${assigningUsers === file.id
                          ? 'bg-blue-600 text-white'
                          : 'border border-blue-200 text-blue-600 hover:bg-blue-50'}`}
                    >
                      <Users size={12} />
                      {assigningUsers === file.id ? 'Cancel' : 'Students'}
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await deleteResource(file.id);
                        if (ok) setStaged(prev => prev.filter(f => f.id !== file.id));
                      }}
                      title="Delete file"
                      className="flex items-center justify-center text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Assign metadata form */}
                {assigningMeta === file.id && (
                  <MetaForm
                    file={file}
                    onSave={handleMetaSaved}
                    onDismiss={() => setAssigningMeta(null)}
                    onSuccess={(msg) => showToast(msg, 'success')}
                  />
                )}

                {/* Assign users form */}
                {assigningUsers === file.id && (
                  <AssignUsersForm
                    file={file}
                    onDone={handleUsersDone}
                    onDismiss={() => setAssigningUsers(null)}
                    onSuccess={(msg) => showToast(msg, 'success')}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ RESOURCE LIBRARY — push any published resource ═════════════════ */}
      <ResourceLibrarySection />
    </div>
  );
}
