// client/src/pages/TeacherResourcesPage.jsx
// URL: /teacher/resources
// Tab 1 — Upload Resource → POST /api/resources/upload (multipart)
// Tab 2 — My Resources   → GET/DELETE /api/resources
// Tab 3 — Add Question   → POST /api/teacher/questions

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import {
  Upload, FileText, Video, Music, Trash2, Loader2,
  CheckCircle, AlertTriangle, X, Plus, BookOpen,
  File,
} from 'lucide-react';

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3
      rounded-2xl shadow-xl text-sm font-semibold text-white max-w-sm
      ${type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
      {type === 'success'
        ? <CheckCircle size={14} className="text-blue-400 shrink-0" />
        : <AlertTriangle size={14} className="shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose}><X size={13} className="opacity-60" /></button>
    </div>
  );
}

// ── File type icon ─────────────────────────────────────────────────────────────
function FileTypeIcon({ type, size = 20 }) {
  if (type === 'video')  return <Video    size={size} className="text-blue-500" />;
  if (type === 'audio')  return <Music    size={size} className="text-purple-500" />;
  if (type === 'pdf')    return <FileText size={size} className="text-red-500" />;
  if (type === 'other')  return <FileText size={size} className="text-amber-500" />;
  return <File size={size} className="text-gray-400" />;
}

// ── Format file size ──────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Safe list extractor — handles { success, data: [...] } or plain array ─────
function extractList(r) {
  if (Array.isArray(r))        return r;
  if (Array.isArray(r?.data))  return r.data;
  return [];
}

// ── Subject label with exam board ─────────────────────────────────────────────
function subjectLabel(s) {
  const board = s.exam_board_code || s.exam_board_name || '';
  return board ? `${s.name} (${board})` : s.name;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Upload Resource
// ══════════════════════════════════════════════════════════════════════════════
function UploadTab({ showToast }) {
  const [subjects,  setSubjects]  = useState([]);
  const [topics,    setTopics]    = useState([]);
  const [subtopics, setSubtopics] = useState([]);
  const [form,      setForm]      = useState({
    subject_id: '', topic_id: '', subtopic_id: '', title: '',
  });
  const [file,      setFile]      = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [dragOver,  setDragOver]  = useState(false);
  const fileRef = useRef(null);

  // ── Load teacher's assigned subjects ────────────────────────────────────────
  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setSubjects(extractList(r)))
      .catch(() => {});
  }, []);

  // ── Load topics when subject changes ────────────────────────────────────────
  useEffect(() => {
    setTopics([]);
    setSubtopics([]);
    setForm(f => ({ ...f, topic_id: '', subtopic_id: '' }));
    if (!form.subject_id) return;

    api.get('/teacher/topics', { params: { subject_id: String(form.subject_id) } })
      .then(r => setTopics(extractList(r)))
      .catch(() => setTopics([]));
  }, [form.subject_id]); // eslint-disable-line

  // ── Load subtopics when topic changes ───────────────────────────────────────
  useEffect(() => {
    setSubtopics([]);
    setForm(f => ({ ...f, subtopic_id: '' }));
    if (!form.topic_id) return;

    api.get('/teacher/subtopics', { params: { topic_id: String(form.topic_id) } })
      .then(r => setSubtopics(extractList(r)))
      .catch(() => setSubtopics([]));
  }, [form.topic_id]); // eslint-disable-line

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    if (!form.title) setForm(p => ({ ...p, title: f.name.replace(/\.[^/.]+$/, '') }));
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file)             { showToast('Please select a file.', 'error'); return; }
    if (!form.title.trim()){ showToast('Please enter a title.', 'error'); return; }

    setUploading(true);
    setProgress(0);

    const fd = new FormData();
    fd.append('file',  file);
    fd.append('title', form.title.trim());
    // NOTE: uploaded_by is set server-side from req.user.id — do NOT send it from frontend
    if (form.topic_id)    fd.append('topic_id',    String(form.topic_id));
    if (form.subtopic_id) fd.append('subtopic_id', String(form.subtopic_id));

    try {
      const rawBase = import.meta.env.VITE_API_URL || '';
      const apiBase = rawBase.endsWith('/api')
        ? rawBase
        : (rawBase ? `${rawBase}/api` : '/api');
      const token = localStorage.getItem('token') || '';

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBase}/resources/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && res.success) resolve(res);
            else reject(new Error(res.error || `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Server error (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error — check your connection.'));
        xhr.send(fd);
      });

      showToast('Resource uploaded successfully!');
      setFile(null);
      setProgress(0);
      setForm(f => ({ ...f, title: '', topic_id: '', subtopic_id: '' }));
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      showToast(err.message || 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const sel = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400';
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1.5';

  return (
    <div className="max-w-xl space-y-5">

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors
          ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".mp4,.webm,.mov,.mp3,.wav,.m4a,.pdf,.doc,.docx,.ppt,.pptx"
          onChange={e => handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileTypeIcon
              type={
                file.type.startsWith('video/') ? 'video' :
                file.type.startsWith('audio/') ? 'audio' :
                file.type === 'application/pdf' ? 'pdf' : 'other'
              }
              size={24}
            />
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 truncate max-w-xs">{file.name}</p>
              <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="ml-2 text-gray-400 hover:text-red-500"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-semibold text-gray-600">Drop file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">MP4, WebM, MP3, WAV, PDF, DOCX, PPTX · Max 500 MB</p>
          </>
        )}
      </div>

      {/* Title */}
      <div>
        <label className={lbl}>Title *</label>
        <input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Introduction to Cell Biology"
          className={sel}
        />
      </div>

      {/* Subject — shows full label with exam board */}
      <div>
        <label className={lbl}>
          Subject * <span className="text-gray-400 font-normal">(your assigned subjects only)</span>
        </label>
        <select
          value={form.subject_id}
          onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}
          className={sel}
        >
          <option value="">Select subject…</option>
          {subjects.map(s => (
            <option key={s.id} value={s.id}>
              {subjectLabel(s)}
            </option>
          ))}
        </select>
        {subjects.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            No subjects assigned yet. Ask your admin to assign subjects to your account.
          </p>
        )}
      </div>

      {/* Topic */}
      <div>
        <label className={lbl}>
          Topic <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <select
          value={form.topic_id}
          onChange={e => setForm(f => ({ ...f, topic_id: e.target.value }))}
          disabled={!form.subject_id}
          className={sel}
        >
          <option value="">All topics / General</option>
          {topics.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {form.subject_id && topics.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">
            No topics created for this subject yet. Create topics in the Content section.
          </p>
        )}
      </div>

      {/* Subtopic */}
      <div>
        <label className={lbl}>
          Subtopic <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <select
          value={form.subtopic_id}
          onChange={e => setForm(f => ({ ...f, subtopic_id: e.target.value }))}
          disabled={!form.topic_id}
          className={sel}
        >
          <option value="">All subtopics / General</option>
          {subtopics.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Progress bar */}
      {uploading && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Uploading…</span><span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={uploading || !file || !form.title.trim()}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold
          py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
      >
        {uploading
          ? <><Loader2 size={15} className="animate-spin" /> Uploading {progress}%…</>
          : <><Upload size={15} /> Upload Resource</>}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — My Resources
// ══════════════════════════════════════════════════════════════════════════════
function ResourcesTab({ showToast }) {
  const [resources,   setResources]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [deleting,    setDeleting]    = useState(null);
  const [pushing,     setPushing]     = useState(null); // resource id being pushed
  const [students,    setStudents]    = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [pushForm,    setPushForm]    = useState({ push_type: 'learning_material', student_ids: [], class_ids: [], assign_all: false });
  const [pushSearch,  setPushSearch]  = useState('');
  const [pushSaving,  setPushSaving]  = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/resources')
      .then(r => setResources(extractList(r)))
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Lazy-load students & classes when push panel opens
  const openPush = (id) => {
    setPushing(id);
    setPushForm({ push_type: 'learning_material', student_ids: [], class_ids: [], assign_all: false });
    setPushSearch('');
    if (students.length === 0) {
      // /teacher/students returns class members (fallback: all students)
      api.get('/teacher/students').then(r => setStudents(extractList(r))).catch(() => {
        api.get('/users', { params: { role: 'student', limit: 200 } }).then(r => setStudents(extractList(r))).catch(() => {});
      });
    }
    if (classes.length === 0) {
      api.get('/teacher/classes').then(r => setClasses(extractList(r))).catch(() => {});
    }
  };

  const handleDelete = async (id, title) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/resources/${id}`);
      setResources(prev => prev.filter(r => r.id !== id));
      showToast('Resource deleted.');
    } catch (err) {
      showToast(err?.error || 'Failed to delete.', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handlePush = async () => {
    const hasTarget = pushForm.assign_all || pushForm.student_ids.length > 0 || pushForm.class_ids.length > 0;
    if (!hasTarget) { showToast('Select at least one student or class.', 'error'); return; }
    setPushSaving(true);
    try {
      const res = await api.put(`/resources/${pushing}/assign-users`, {
        assign_all: pushForm.assign_all,
        user_ids:   pushForm.assign_all ? [] : pushForm.student_ids,
        class_ids:  pushForm.class_ids,
        push_type:  pushForm.push_type,
      });
      showToast(res?.message || 'Resource pushed successfully!');
      setPushing(null);
    } catch (err) {
      showToast(err?.error || 'Push failed.', 'error');
    } finally {
      setPushSaving(false);
    }
  };

  const toggleStudent = (id) => setPushForm(f => ({
    ...f, student_ids: f.student_ids.includes(id) ? f.student_ids.filter(x => x !== id) : [...f.student_ids, id],
  }));
  const toggleClass = (id) => setPushForm(f => ({
    ...f, class_ids: f.class_ids.includes(id) ? f.class_ids.filter(x => x !== id) : [...f.class_ids, id],
  }));

  const filteredStudents = students.filter(s =>
    `${s.first_name} ${s.last_name} ${s.email}`.toLowerCase().includes(pushSearch.toLowerCase())
  );

  const PUSH_TYPES = [
    { value: 'learning_material', label: '📚 Learning Material' },
    { value: 'practice_test',     label: '📝 Practice Test'     },
    { value: 'quiz',              label: '⚡ Quiz'               },
  ];

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 size={24} className="animate-spin text-blue-400" />
    </div>
  );

  if (resources.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">No resources uploaded yet.</p>
      <p className="text-xs mt-1">Switch to the Upload tab to add your first resource.</p>
    </div>
  );

  return (
    <div className="space-y-3 max-w-3xl">
      {resources.map(r => (
        <div key={r.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Resource row */}
          <div className="p-4 flex items-center gap-4">
            <FileTypeIcon type={r.type || r.resource_type || 'other'} size={22} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{r.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-400 capitalize">{r.type || r.resource_type || 'file'}</span>
                {(r.file_size_bytes || r.file_size) && (
                  <><span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{fmtSize(r.file_size_bytes || r.file_size)}</span></>
                )}
                {r.subject_name && (
                  <><span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-blue-600">{r.subject_name}</span></>
                )}
                {r.push_type && r.push_type !== 'learning_material' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.push_type === 'quiz' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {r.push_type === 'quiz' ? '⚡ Quiz' : '📝 Practice Test'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a href={r.url || r.file_url} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 border border-blue-200 rounded-lg transition-colors">
                View
              </a>
              <button
                onClick={() => pushing === r.id ? setPushing(null) : openPush(r.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  pushing === r.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                }`}>
                {pushing === r.id ? 'Cancel' : '↑ Push'}
              </button>
              <button onClick={() => handleDelete(r.id, r.title)} disabled={deleting === r.id}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                {deleting === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>

          {/* Push panel */}
          {pushing === r.id && (
            <div className="border-t border-gray-100 bg-indigo-50 px-4 py-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Push "{r.title}" to students or classes</p>

              {/* Push type */}
              <div className="flex gap-2 flex-wrap">
                {PUSH_TYPES.map(pt => (
                  <button key={pt.value} type="button"
                    onClick={() => setPushForm(f => ({ ...f, push_type: pt.value }))}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      pushForm.push_type === pt.value
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}>
                    {pt.label}
                  </button>
                ))}
              </div>

              {/* All students */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={pushForm.assign_all}
                  onChange={e => setPushForm(f => ({ ...f, assign_all: e.target.checked }))}
                  className="rounded text-indigo-500" />
                <span className="text-xs text-gray-700 font-medium">All students ({students.length})</span>
              </label>

              {!pushForm.assign_all && (
                <>
                  <input value={pushSearch} onChange={e => setPushSearch(e.target.value)}
                    placeholder="Search student…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  {filteredStudents.length > 0 && (
                    <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                      {filteredStudents.map(s => (
                        <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                          <input type="checkbox" checked={pushForm.student_ids.includes(s.id)} onChange={() => toggleStudent(s.id)} className="rounded" />
                          <span className="text-xs">{s.first_name} {s.last_name}</span>
                          {s.class_name && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{s.class_name}</span>}
                          <span className="text-xs text-gray-400 ml-auto">{s.email}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Classes */}
                  {classes.length > 0 && (
                    <>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase">Or push to class</p>
                      <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                        {classes.map(c => (
                          <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                            <input type="checkbox" checked={pushForm.class_ids.includes(c.id)} onChange={() => toggleClass(c.id)} className="rounded" />
                            <span className="text-xs">{c.name}</span>
                            <span className="text-xs text-gray-400 ml-auto">{c.student_count ?? 0} students</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              <button onClick={handlePush} disabled={pushSaving}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5">
                {pushSaving ? <Loader2 size={12} className="animate-spin" /> : '↑ Push Resource'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Add Question
// ══════════════════════════════════════════════════════════════════════════════
function QuestionsTab({ showToast }) {
  const [subjects,  setSubjects]  = useState([]);
  const [topics,    setTopics]    = useState([]);
  const [subtopics, setSubtopics] = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [form, setForm] = useState({
    question_text: '',
    subject_id:    '',
    topic_id:      '',
    subtopic_id:   '',
    difficulty:    'medium',
    explanation:   '',
    options: [
      { text: '', is_correct: true  },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  });

  // Load assigned subjects
  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setSubjects(extractList(r)))
      .catch(() => {});
  }, []);

  // Load topics when subject changes
  useEffect(() => {
    setTopics([]); setSubtopics([]);
    setForm(f => ({ ...f, topic_id: '', subtopic_id: '' }));
    if (!form.subject_id) return;
    api.get('/teacher/topics', { params: { subject_id: String(form.subject_id) } })
      .then(r => setTopics(extractList(r)))
      .catch(() => {});
  }, [form.subject_id]); // eslint-disable-line

  // Load subtopics when topic changes
  useEffect(() => {
    setSubtopics([]);
    setForm(f => ({ ...f, subtopic_id: '' }));
    if (!form.topic_id) return;
    api.get('/teacher/subtopics', { params: { topic_id: String(form.topic_id) } })
      .then(r => setSubtopics(extractList(r)))
      .catch(() => {});
  }, [form.topic_id]); // eslint-disable-line

  const setOption = (idx, field, val) => {
    setForm(f => {
      const opts = f.options.map((o, i) =>
        field === 'is_correct'
          ? { ...o, is_correct: i === idx }
          : i === idx ? { ...o, [field]: val } : o
      );
      return { ...f, options: opts };
    });
  };

  const handleSubmit = async () => {
    const { question_text, subject_id, options, difficulty } = form;
    if (!question_text.trim())          { showToast('Question text is required.', 'error'); return; }
    if (!subject_id)                    { showToast('Please select a subject.', 'error'); return; }
    if (options.some(o => !o.text.trim())) { showToast('All 4 options must be filled.', 'error'); return; }
    if (!options.some(o => o.is_correct))  { showToast('Mark one option as correct.', 'error'); return; }

    setSaving(true);
    try {
      await api.post('/teacher/questions', {
        question_text: question_text.trim(),
        subject_id,
        subtopic_id:   form.subtopic_id || null,
        difficulty,
        explanation:   form.explanation.trim() || null,
        options:       options.map(o => ({ option_text: o.text.trim(), is_correct: o.is_correct })),
      });
      showToast('Question submitted and approved!');
      setForm(f => ({
        ...f,
        question_text: '',
        explanation:   '',
        topic_id:      '',
        subtopic_id:   '',
        options: [
          { text: '', is_correct: true  },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
        ],
      }));
    } catch (err) {
      showToast(err?.error || err?.message || 'Failed to submit question.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400';
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1.5';
  const LABELS = ['A', 'B', 'C', 'D'];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-700">
        Questions you submit here are <strong>automatically approved</strong> and will immediately appear in quizzes for your assigned subjects.
      </div>

      {/* Question text */}
      <div>
        <label className={lbl}>Question *</label>
        <textarea
          value={form.question_text}
          onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
          rows={3}
          placeholder="Type your question here…"
          className={inp + ' resize-none'}
        />
      </div>

      {/* Subject + Difficulty */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Subject *</label>
          <select
            value={form.subject_id}
            onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}
            className={inp}
          >
            <option value="">Select…</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {subjectLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>Difficulty</label>
          <select
            value={form.difficulty}
            onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
            className={inp}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Topic — shown when subject selected */}
      {form.subject_id && (
        <div>
          <label className={lbl}>
            Topic <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            value={form.topic_id}
            onChange={e => setForm(f => ({ ...f, topic_id: e.target.value }))}
            className={inp}
          >
            <option value="">No specific topic</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Subtopic — shown when topic selected */}
      {form.topic_id && (
        <div>
          <label className={lbl}>
            Subtopic <span className="text-gray-400 font-normal">(optional — links question to specific content)</span>
          </label>
          <select
            value={form.subtopic_id}
            onChange={e => setForm(f => ({ ...f, subtopic_id: e.target.value }))}
            className={inp}
          >
            <option value="">No specific subtopic</option>
            {subtopics.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Options */}
      <div>
        <label className={lbl}>
          Answer Options * <span className="text-gray-400 font-normal">(click the circle to mark correct answer)</span>
        </label>
        <div className="space-y-2">
          {form.options.map((opt, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 border-2 rounded-xl px-3 py-2.5 transition-colors
                ${opt.is_correct ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
            >
              <button
                onClick={() => setOption(i, 'is_correct', true)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                  ${opt.is_correct ? 'border-blue-500 bg-blue-500' : 'border-gray-300 hover:border-blue-300'}`}
              >
                {opt.is_correct && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
              </button>
              <span className="text-xs font-bold text-gray-500 shrink-0 w-4">{LABELS[i]}</span>
              <input
                value={opt.text}
                onChange={e => setOption(i, 'text', e.target.value)}
                placeholder={`Option ${LABELS[i]}…`}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder-gray-300"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <div>
        <label className={lbl}>
          Explanation <span className="text-gray-400 font-normal">(optional — shown after student answers)</span>
        </label>
        <textarea
          value={form.explanation}
          onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
          rows={2}
          placeholder="Why is the correct answer right? What concept does this test?"
          className={inp + ' resize-none'}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold
          py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
      >
        {saving
          ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
          : <><Plus size={15} /> Submit Question</>}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function TeacherResourcesPage({ defaultTab = 'upload' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [toast,     setToast]     = useState(null);

  const showToast = useCallback((msg, type = 'success') => setToast({ msg, type }), []);

  const tabs = [
    { id: 'upload',    label: 'Upload Resource', icon: Upload   },
    { id: 'resources', label: 'My Resources',    icon: BookOpen },
    { id: 'questions', label: 'Add Question',    icon: Plus     },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Header */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-white/50 text-xs mb-1">Teacher</p>
            <h1 className="text-white text-xl font-bold">Resources &amp; Content</h1>
            <p className="text-white/60 text-sm mt-0.5">Upload files and add questions for your students</p>
          </div>
          <Link
            to="/teacher/dashboard"
            className="text-white/70 hover:text-white text-sm transition-colors shrink-0"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === t.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'upload'    && <UploadTab    showToast={showToast} />}
        {activeTab === 'resources' && <ResourcesTab showToast={showToast} />}
        {activeTab === 'questions' && <QuestionsTab showToast={showToast} />}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
