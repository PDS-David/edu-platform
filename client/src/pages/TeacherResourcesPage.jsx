// client/src/pages/TeacherResourcesPage.jsx
// URL: /teacher/resources  (also /teacher/upload-video, /teacher/add-questions)
// Props: defaultTab — "upload" | "resources" | "questions"
//
// Tab 1 — Upload: file picker → POST /api/resources/upload (multipart)
// Tab 2 — My Resources: list + delete → GET/DELETE /api/resources
// Tab 3 — Add Questions: MCQ submission → POST /api/teacher/questions

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import TopNav from '../components/TopNav';
import {
  Upload, FileText, Video, Music, Trash2, Loader2,
  CheckCircle, AlertTriangle, X, Plus, BookOpen,
  ChevronDown, File,
} from 'lucide-react';

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3
      rounded-2xl shadow-xl text-sm font-semibold text-white
      ${type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
      {type === 'success'
        ? <CheckCircle size={14} className="text-teal-400 shrink-0" />
        : <AlertTriangle size={14} className="shrink-0" />}
      <span>{msg}</span>
      <button onClick={onClose}><X size={13} className="opacity-60" /></button>
    </div>
  );
}

// ── File type icon ────────────────────────────────────────────────────────────
function FileTypeIcon({ type, size = 20 }) {
  if (type === 'video')    return <Video    size={size} className="text-blue-500" />;
  if (type === 'audio')    return <Music    size={size} className="text-purple-500" />;
  if (type === 'document') return <FileText size={size} className="text-amber-500" />;
  return <File size={size} className="text-gray-400" />;
}

// ── Format file size ─────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Upload Resource
// ══════════════════════════════════════════════════════════════════════════════
function UploadTab({ showToast }) {
  const [subjects,    setSubjects]    = useState([]);
  const [topics,      setTopics]      = useState([]);
  const [subtopics,   setSubtopics]   = useState([]);
  const [form,        setForm]        = useState({
    subject_id: '', topic_id: '', subtopic_id: '', title: '',
  });
  const [file,        setFile]        = useState(null);
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [dragOver,    setDragOver]    = useState(false);
  const fileRef = useRef(null);

  // Load teacher's assigned subjects
  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => {
        const list = Array.isArray(r) ? r : (r.data ?? []);
        setSubjects(list);
      })
      .catch(() => {});
  }, []);

  // Load topics when subject changes
  useEffect(() => {
    setTopics([]); setSubtopics([]);
    setForm(f => ({ ...f, topic_id: '', subtopic_id: '' }));
    if (!form.subject_id) return;
    api.get('/teacher/topics', { params: { subject_id: form.subject_id } })
      .then(r => setTopics(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => {});
  }, [form.subject_id]);

  // Load subtopics when topic changes
  useEffect(() => {
    setSubtopics([]);
    setForm(f => ({ ...f, subtopic_id: '' }));
    if (!form.topic_id) return;
    api.get('/teacher/subtopics', { params: { topic_id: form.topic_id } })
      .then(r => setSubtopics(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => {});
  }, [form.topic_id]);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    if (!form.title) setForm(prev => ({ ...prev, title: f.name.replace(/\.[^/.]+$/, '') }));
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file || !form.title.trim()) {
      showToast('Please select a file and enter a title.', 'error');
      return;
    }
    setUploading(true);
    setProgress(0);

    const fd = new FormData();
    fd.append('file',  file);
    fd.append('title', form.title.trim());
    if (form.topic_id)    fd.append('topic_id',    form.topic_id);
    if (form.subtopic_id) fd.append('subtopic_id', form.subtopic_id);
    if (form.description) fd.append('description', form.description);

    try {
      // Use raw fetch for upload progress (axios doesn't stream progress well here)
      const rawBase = import.meta.env.VITE_API_URL || '';
      const apiBase = rawBase.endsWith('/api') ? rawBase : (rawBase ? `${rawBase}/api` : '/api');
      const token   = localStorage.getItem('token') || sessionStorage.getItem('token') ||
                      document.cookie.match(/token=([^;]+)/)?.[1] || '';

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBase}/resources/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.success) resolve(res);
          else reject(new Error(res.error || 'Upload failed'));
        };
        xhr.onerror = () => reject(new Error('Network error'));
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

  const sel = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300';
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
          ${dragOver ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'}`}
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
            <FileTypeIcon type={file.type.split('/')[0] === 'video' ? 'video' : file.type.startsWith('audio') ? 'audio' : 'document'} size={24} />
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 truncate max-w-xs">{file.name}</p>
              <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
            </div>
            <button onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="ml-2 text-gray-400 hover:text-red-500">
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

      {/* Subject */}
      <div>
        <label className={lbl}>Subject * <span className="text-gray-400 font-normal">(your assigned subjects only)</span></label>
        <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className={sel}>
          <option value="">Select subject…</option>
          {subjects.map(s => (
            <option key={s.id} value={s.id}>{s.icon_emoji || '📚'} {s.name} {s.exam_board_code ? `(${s.exam_board_code})` : ''}</option>
          ))}
        </select>
      </div>

      {/* Topic (optional) */}
      <div>
        <label className={lbl}>Topic <span className="text-gray-400 font-normal">(optional)</span></label>
        <select value={form.topic_id} onChange={e => setForm(f => ({ ...f, topic_id: e.target.value }))}
          disabled={!form.subject_id || topics.length === 0} className={sel}>
          <option value="">All topics / General</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Subtopic (optional) */}
      <div>
        <label className={lbl}>Subtopic <span className="text-gray-400 font-normal">(optional)</span></label>
        <select value={form.subtopic_id} onChange={e => setForm(f => ({ ...f, subtopic_id: e.target.value }))}
          disabled={!form.topic_id || subtopics.length === 0} className={sel}>
          <option value="">All subtopics / General</option>
          {subtopics.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Progress bar */}
      {uploading && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Uploading…</span><span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={uploading || !file || !form.title.trim()}
        className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold
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
  const [resources, setResources] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [deleting,  setDeleting]  = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/resources')
      .then(r => setResources(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

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

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-teal-400" /></div>;

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
        <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
          <FileTypeIcon type={r.resource_type} size={22} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{r.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-400 capitalize">{r.resource_type}</span>
              {r.file_size_bytes && <span className="text-xs text-gray-300">·</span>}
              {r.file_size_bytes && <span className="text-xs text-gray-400">{fmtSize(r.file_size_bytes)}</span>}
              {r.subject_name && <span className="text-xs text-gray-300">·</span>}
              {r.subject_name && <span className="text-xs text-teal-600">{r.subject_name}</span>}
              {r.subtopic_name && <span className="text-xs text-gray-300">·</span>}
              {r.subtopic_name && <span className="text-xs text-gray-400">{r.subtopic_name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={r.file_url} target="_blank" rel="noreferrer"
              className="text-xs text-teal-600 hover:text-teal-800 font-medium px-3 py-1.5 border border-teal-200 rounded-lg transition-colors">
              View
            </a>
            <button
              onClick={() => handleDelete(r.id, r.title)}
              disabled={deleting === r.id}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Add Question
// ══════════════════════════════════════════════════════════════════════════════
function QuestionsTab({ showToast }) {
  const [subjects,   setSubjects]   = useState([]);
  const [subtopics,  setSubtopics]  = useState([]);
  const [saving,     setSaving]     = useState(false);
  const EMPTY_OPT = { text: '', is_correct: false };
  const [form, setForm] = useState({
    question_text: '',
    subject_id:    '',
    subtopic_id:   '',
    difficulty:    'medium',
    explanation:   '',
    options:       [
      { text: '', is_correct: true  },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  });

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setSubjects(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSubtopics([]);
    setForm(f => ({ ...f, subtopic_id: '' }));
    if (!form.subject_id) return;
    // Fetch all subtopics for the subject by fetching topics first
    api.get('/teacher/topics', { params: { subject_id: form.subject_id } })
      .then(async r => {
        const topicList = Array.isArray(r) ? r : (r.data ?? []);
        const allSubs = [];
        await Promise.all(topicList.map(t =>
          api.get('/teacher/subtopics', { params: { topic_id: t.id } })
            .then(sr => {
              const subs = Array.isArray(sr) ? sr : (sr.data ?? []);
              allSubs.push(...subs);
            })
            .catch(() => {})
        ));
        setSubtopics(allSubs);
      })
      .catch(() => {});
  }, [form.subject_id]);

  const setOption = (idx, field, val) => {
    setForm(f => {
      const opts = [...f.options];
      if (field === 'is_correct') {
        // Only one option can be correct
        opts.forEach((o, i) => { opts[i] = { ...o, is_correct: i === idx }; });
      } else {
        opts[idx] = { ...opts[idx], [field]: val };
      }
      return { ...f, options: opts };
    });
  };

  const handleSubmit = async () => {
    const { question_text, subject_id, options, difficulty } = form;
    if (!question_text.trim()) { showToast('Question text is required.', 'error'); return; }
    if (!subject_id)           { showToast('Please select a subject.', 'error'); return; }
    if (options.some(o => !o.text.trim())) { showToast('All 4 options must be filled.', 'error'); return; }
    if (!options.some(o => o.is_correct))  { showToast('Mark one option as correct.', 'error'); return; }

    setSaving(true);
    try {
      await api.post('/teacher/questions', {
        question_text:    question_text.trim(),
        subject_id,
        subtopic_id:      form.subtopic_id || null,
        difficulty,
        explanation:      form.explanation.trim() || null,
        options:          options.map(o => ({ option_text: o.text.trim(), is_correct: o.is_correct })),
      });
      showToast('Question submitted and approved!');
      setForm(f => ({
        ...f,
        question_text: '',
        explanation:   '',
        subtopic_id:   '',
        options: [
          { text: '', is_correct: true  },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
        ],
      }));
    } catch (err) {
      showToast(err?.error || 'Failed to submit question.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300';
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1.5';
  const LABELS = ['A', 'B', 'C', 'D'];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 text-xs text-teal-700">
        ✅ Questions you submit here are <strong>automatically approved</strong> and will immediately appear in quizzes for your assigned subjects.
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
          <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className={inp}>
            <option value="">Select…</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Difficulty</label>
          <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} className={inp}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Subtopic (optional) */}
      <div>
        <label className={lbl}>Subtopic <span className="text-gray-400 font-normal">(optional — links question to specific content)</span></label>
        <select value={form.subtopic_id} onChange={e => setForm(f => ({ ...f, subtopic_id: e.target.value }))}
          disabled={subtopics.length === 0} className={inp}>
          <option value="">No specific subtopic</option>
          {subtopics.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Options */}
      <div>
        <label className={lbl}>Answer Options * <span className="text-gray-400 font-normal">(click the circle to mark correct answer)</span></label>
        <div className="space-y-2">
          {form.options.map((opt, i) => (
            <div key={i} className={`flex items-center gap-3 border-2 rounded-xl px-3 py-2.5 transition-colors ${opt.is_correct ? 'border-teal-400 bg-teal-50' : 'border-gray-200'}`}>
              <button
                onClick={() => setOption(i, 'is_correct', true)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${opt.is_correct ? 'border-teal-500 bg-teal-500' : 'border-gray-300 hover:border-teal-300'}`}
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
        <label className={lbl}>Explanation <span className="text-gray-400 font-normal">(optional — shown after student answers)</span></label>
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
        className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold
          py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : <><Plus size={15} /> Submit Question</>}
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

  const showToast = (msg, type = 'success') => setToast({ msg, type });

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
            <h1 className="text-white text-xl font-bold">Resources & Content</h1>
            <p className="text-white/60 text-sm mt-0.5">Upload files and add questions for your students</p>
          </div>
          <Link to="/teacher/dashboard"
            className="text-white/70 hover:text-white text-sm transition-colors shrink-0">
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
                    ? 'border-teal-500 text-teal-600'
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
