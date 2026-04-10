// client/src/pages/TeacherResourcesPage.jsx
// Route: /teacher/resources
// Teachers upload and manage video/audio/document resources for students.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  Upload, Video, Music, FileText, Trash2,
  CheckCircle, AlertCircle, ChevronDown,
  FolderOpen, X, Clock, HardDrive,
  FilePlus, Filter, Search
} from 'lucide-react';
import TopNav   from '../components/TopNav';
import { useAuth } from '../context/AuthContext';



// ── Helpers ────────────────────────────────────────────────────────────────────
const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};

const guessType = (file) => {
  if (!file) return 'document';
  const mime = file.type || '';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
};

const TYPE_META = {
  video:    { icon: Video,     colour: 'text-teal-500',   bg: 'bg-teal-50',    label: 'Video',    emoji: '🎥' },
  audio:    { icon: Music,     colour: 'text-purple-500', bg: 'bg-purple-50',  label: 'Audio',    emoji: '🔊' },
  document: { icon: FileText,  colour: 'text-blue-500',   bg: 'bg-blue-50',    label: 'Document', emoji: '📄' },
};

// ── Small reusable select ──────────────────────────────────────────────────────
const Select = ({ value, onChange, disabled, placeholder, children, className = '' }) => (
  <div className={`relative ${className}`}>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm
        text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 transition-colors
        disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
  </div>
);

// ── Response shape helper ──────────────────────────────────────────────────────
const extractList = (r, ...keys) => {
  if (!r) return [];
  for (const key of keys) {
    if (Array.isArray(r[key])) return r[key];
  }
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r))      return r;
  return [];
};

// ══════════════════════════════════════════════════════════════════════════════
export default function TeacherResourcesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Upload form state ──────────────────────────────────────────────────────
  const [subjects,   setSubjects]   = useState([]);
  const [topics,     setTopics]     = useState([]);
  const [subtopics,  setSubtopics]  = useState([]);

  const [subjectId,  setSubjectId]  = useState('');
  const [topicId,    setTopicId]    = useState('');
  const [subtopicId, setSubtopicId] = useState('');
  const [title,      setTitle]      = useState('');
  const [file,       setFile]       = useState(null);
  const [source,     setSource]     = useState('');          // PATCH 1

  const [uploading,  setUploading]  = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [toast,      setToast]      = useState(null);

  // ── Resources list state ───────────────────────────────────────────────────
  const [resources,      setResources]      = useState([]);
  const [resLoading,     setResLoading]     = useState(true);
  const [filterSubject,  setFilterSubject]  = useState('');
  const [filterTopic,    setFilterTopic]    = useState('');
  const [filterTopics,   setFilterTopics]   = useState([]);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);

  const fileInputRef = useRef(null);
  const dropRef      = useRef(null);

  // ── Load subjects ─────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setSubjects(extractList(r, 'data', 'subjects')))
      .catch(() =>
        api.get('/subjects')
          .then(r => setSubjects(extractList(r, 'data', 'subjects')))
          .catch(() => {})
      );
  }, []);

  // ── Load topics when subject changes ──────────────────────────────────────
  useEffect(() => {
    setTopicId(''); setSubtopicId(''); setTopics([]); setSubtopics([]);
    if (!subjectId) return;
    api.get(`/topics?subject_id=${subjectId}`)
      .then(r => setTopics(extractList(r, 'topics', 'data')))
      .catch(() => {});
  }, [subjectId]);

  // ── Load subtopics when topic changes ─────────────────────────────────────
  useEffect(() => {
    setSubtopicId(''); setSubtopics([]);
    if (!topicId) return;
    api.get(`/subtopics?topic_id=${topicId}`)
      .then(r => setSubtopics(extractList(r, 'subtopics', 'data')))
      .catch(() => {});
  }, [topicId]);

  // ── Load resources list ───────────────────────────────────────────────────
  const loadResources = useCallback(() => {
    setResLoading(true);
    const params = new URLSearchParams();
    if (filterSubject) params.set('subject_id', filterSubject);
    if (filterTopic)   params.set('topic_id',   filterTopic);
    api.get(`/resources?${params}`)
      .then(r => setResources(extractList(r, 'resources', 'data')))
      .catch(() => setResources([]))
      .finally(() => setResLoading(false));
  }, [filterSubject, filterTopic]);

  useEffect(() => { loadResources(); }, [loadResources]);

  // ── Filter topics for resources filter bar ────────────────────────────────
  useEffect(() => {
    setFilterTopic('');
    if (!filterSubject) { setFilterTopics([]); return; }
    api.get(`/topics?subject_id=${filterSubject}`)
      .then(r => setFilterTopics(extractList(r, 'topics', 'data')))
      .catch(() => {});
  }, [filterSubject]);

  // ── Drag and drop ─────────────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!subjectId || !topicId || !title.trim() || !file) return;  // PATCH 4
    setUploading(true);
    setUploadPct(0);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('subject_id',  subjectId);
    fd.append('topic_id',    topicId);
    fd.append('subtopic_id', subtopicId);
    fd.append('title',       title.trim());
    fd.append('type',        guessType(file));
    fd.append('uploaded_by', user?.id || '');
    if (source.trim()) fd.append('source', source.trim());         // PATCH 3
    try {
      await api.post('/resources/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadPct(Math.round((e.loaded / e.total) * 100));
        },
      });
      setToast({ type: 'success', msg: 'Resource uploaded successfully!' });
      // PATCH 6 — include setSource('') in reset
      setSubjectId(''); setTopicId(''); setSubtopicId(''); setTitle(''); setFile(null); setSource('');
      loadResources();
    } catch {
      setToast({ type: 'error', msg: 'Upload failed. Please try again.' });
    } finally {
      setUploading(false);
      setUploadPct(0);
      setTimeout(() => setToast(null), 4000);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await api.delete(`/resources/${id}`);
      setResources(prev => prev.filter(r => r.id !== id));
      setToast({ type: 'success', msg: 'Resource deleted.' });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ type: 'error', msg: 'Delete failed.' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // PATCH 4 — subtopicId no longer required
  const canUpload = subjectId && topicId && title.trim() && file && !uploading;

  // ── Notes tab state ───────────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState('upload');
  const [noteSubjectId,   setNoteSubjectId]   = useState('');
  const [noteTopicId,     setNoteTopicId]     = useState('');
  const [noteSubtopicId,  setNoteSubtopicId]  = useState('');
  const [noteTopics,      setNoteTopics]      = useState([]);
  const [noteSubtopics,   setNoteSubtopics]   = useState([]);
  const [noteTitle,       setNoteTitle]       = useState('');
  const [noteContent,     setNoteContent]     = useState('');
  const [noteSaving,      setNoteSaving]      = useState(false);
  const [existingNotes,   setExistingNotes]   = useState([]);
  const [editingNote,     setEditingNote]     = useState(null);

  useEffect(() => {
    setNoteTopicId(''); setNoteSubtopicId(''); setNoteTopics([]); setNoteSubtopics([]);
    if (!noteSubjectId) return;
    api.get(`/topics?subject_id=${noteSubjectId}`)
      .then(r => setNoteTopics(extractList(r, 'topics', 'data')))
      .catch(() => {});
  }, [noteSubjectId]);

  useEffect(() => {
    setNoteSubtopicId(''); setNoteSubtopics([]);
    if (!noteTopicId) return;
    api.get(`/subtopics?topic_id=${noteTopicId}`)
      .then(r => setNoteSubtopics(extractList(r, 'subtopics', 'data')))
      .catch(() => {});
  }, [noteTopicId]);

  useEffect(() => {
    if (!noteSubtopicId) { setExistingNotes([]); return; }
    api.get(`/notes?subtopic_id=${noteSubtopicId}`)
      .then(r => setExistingNotes(extractList(r, 'data', 'notes')))
      .catch(() => {});
  }, [noteSubtopicId]);

  const handleSaveNote = async () => {
    if (!noteSubtopicId || !noteTitle.trim() || !noteContent.trim()) {
      setToast({ type: 'error', msg: 'Subtopic, title and content are required.' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setNoteSaving(true);
    try {
      if (editingNote) {
        await api.put(`/notes/${editingNote.id}`, { title: noteTitle, content_html: noteContent });
        setEditingNote(null);
      } else {
        await api.post('/notes', { subtopic_id: noteSubtopicId, title: noteTitle, content_html: noteContent });
      }
      setNoteTitle(''); setNoteContent('');
      setToast({ type: 'success', msg: editingNote ? 'Note updated.' : 'Note saved.' });
      api.get(`/notes?subtopic_id=${noteSubtopicId}`)
        .then(r => setExistingNotes(extractList(r, 'data', 'notes')))
        .catch(() => {});
    } catch {
      setToast({ type: 'error', msg: 'Failed to save note.' });
    } finally {
      setNoteSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleEditNote = (note) => {
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content_html);
  };

  const handleDeleteNote = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await api.delete(`/notes/${id}`);
      setExistingNotes(prev => prev.filter(n => n.id !== id));
      setToast({ type: 'success', msg: 'Note deleted.' });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ type: 'error', msg: 'Delete failed.' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const filteredResources = resources.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (r.title || '').toLowerCase().includes(q) ||
           (r.subject_name || '').toLowerCase().includes(q) ||
           (r.subtopic_name || '').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resource Library</h1>
          <p className="text-gray-500 text-sm mt-1">Upload and manage learning materials for your students</p>
        </div>

        {/* ── TAB BAR ────────────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {[
            { id: 'upload', label: 'Upload Resources' },
            { id: 'notes',  label: 'Revision Notes'  },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === t.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── NOTES TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'notes' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingNote ? 'Edit Note' : 'Write a Revision Note'}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <Select value={noteSubjectId} onChange={setNoteSubjectId} placeholder="Subject">
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Select value={noteTopicId} onChange={setNoteTopicId} placeholder="Topic" disabled={!noteSubjectId}>
                  {noteTopics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                <Select value={noteSubtopicId} onChange={setNoteSubtopicId} placeholder="Subtopic" disabled={!noteTopicId}>
                  {noteSubtopics.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </Select>
              </div>
              <input
                type="text"
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
                placeholder="Note title e.g. Key definitions for Cell Biology"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                rows={10}
                placeholder="Write your revision notes here. Markdown is supported: **bold**, _italic_, ## heading, - bullet"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 resize-y font-mono"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveNote}
                  disabled={noteSaving}
                  className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  {noteSaving
                    ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                    : (editingNote ? 'Update Note' : 'Save Note')
                  }
                </button>
                {editingNote && (
                  <button
                    onClick={() => { setEditingNote(null); setNoteTitle(''); setNoteContent(''); }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {existingNotes.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  Existing notes for this subtopic
                </p>
                {existingNotes.map(note => (
                  <div key={note.id} className="bg-white border border-gray-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{note.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          by {note.author_name} · {new Date(note.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-500 mt-2 line-clamp-2 font-mono">
                          {note.content_html.slice(0, 120)}{note.content_html.length > 120 ? '…' : ''}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleEditNote(note)} className="text-xs text-teal-600 hover:text-teal-800 font-medium">Edit</button>
                        <button onClick={() => handleDeleteNote(note.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── UPLOAD TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'upload' && (<>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <FilePlus size={16} className="text-teal-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Upload New Resource</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select value={subjectId} onChange={setSubjectId} placeholder="Select Subject">
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select value={topicId} onChange={setTopicId} disabled={!subjectId} placeholder="Select Topic">
                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <Select value={subtopicId} onChange={setSubtopicId} disabled={!topicId} placeholder="Select Sub-topic">
                {subtopics.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </Select>
            </div>

            {/* Helpful empty-state hints */}
            {subjectId && topics.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No topics found for this subject. Ask the admin to add topics under this subject first.
              </p>
            )}
            {topicId && subtopics.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No subtopics found for this topic. Ask the admin to add subtopics first.
              </p>
            )}

            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Resource title e.g. Introduction to Algebra — Video 1"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800
                placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 transition-colors"
            />

            {/* PATCH 2 — Source input */}
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="Source / Authority (optional) — e.g. WAEC Past Questions 2019, EAC AI-Generated"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800
                placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 transition-colors"
            />

            <div
              ref={dropRef}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl px-6 py-10 cursor-pointer text-center transition-colors
                ${file
                  ? 'border-teal-300 bg-teal-50'
                  : 'border-gray-200 bg-gray-50 hover:border-teal-300 hover:bg-teal-50/40'
                }`}
            >
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl ${TYPE_META[guessType(file)].bg} flex items-center justify-center`}>
                    {(() => { const I = TYPE_META[guessType(file)].icon; return <I size={22} className={TYPE_META[guessType(file)].colour} />; })()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatSize(file.size)} · {TYPE_META[guessType(file)].label}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null); }}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X size={12} /> Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                    <Upload size={20} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Drag &amp; drop or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">MP4, WebM, MP3, WAV, PDF, DOCX, PPTX — max 500 MB</p>
                  </div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx"
              className="hidden"
              onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }}
            />

            {uploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Uploading…</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 bg-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* PATCH 5 — Incomplete fields warning */}
            {file && !canUpload && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold mb-1.5">Complete these fields to enable upload:</p>
                {!subjectId    && <p className="flex items-center gap-1.5">⚠️ Select a subject</p>}
                {!topicId      && <p className="flex items-center gap-1.5">⚠️ Select a topic</p>}
                {!title.trim() && <p className="flex items-center gap-1.5">⚠️ Add a resource title</p>}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed
                  text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                {uploading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Upload size={15} />
                }
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>

          {/* ── RESOURCES LIST ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 text-gray-500 shrink-0">
                <Filter size={15} />
                <span className="text-sm font-medium text-gray-600">Filter:</span>
              </div>
              <Select value={filterSubject} onChange={setFilterSubject} placeholder="All Subjects" className="sm:w-44">
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select value={filterTopic} onChange={setFilterTopic} disabled={!filterSubject} placeholder="All Topics" className="sm:w-44">
                {filterTopics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search resources…"
                  className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm text-gray-700
                    placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 transition-colors bg-white"
                />
              </div>
            </div>

            <p className="text-xs text-gray-400 font-medium">
              {filteredResources.length} resource{filteredResources.length !== 1 ? 's' : ''}
            </p>

            {resLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-100 rounded w-3/4" />
                        <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                        <div className="h-2.5 bg-gray-100 rounded w-2/3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredResources.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                <FolderOpen size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-medium text-sm">No resources found</p>
                <p className="text-gray-300 text-xs mt-1">Upload your first resource above</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredResources.map(res => (
                  <ResourceCard
                    key={res.id}
                    resource={res}
                    onDelete={() => setDeleteConfirm(res.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>)}
      </div>

      {/* ── TOAST ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
          px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold transition-all
          ${toast.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'}`}
        >
          {toast.type === 'success'
            ? <CheckCircle size={16} className="text-teal-400" />
            : <AlertCircle size={16} className="text-red-200" />
          }
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ─────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 size={17} className="text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900">Delete Resource?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently remove the resource and it will no longer be visible to students.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Resource Card ──────────────────────────────────────────────────────────────
function ResourceCard({ resource, onDelete }) {
  const type = resource.type || 'document';
  const meta = TYPE_META[type] || TYPE_META.document;
  const Icon = meta.icon;

  const uploadDate = resource.created_at
    ? new Date(resource.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3
      hover:shadow-md hover:border-gray-200 transition-all group">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
          <Icon size={18} className={meta.colour} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate" title={resource.title}>
            {resource.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{meta.label}</p>
        </div>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete resource"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {resource.subject_name && (
          <span className="text-[10px] font-semibold bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">
            {resource.subject_name}
          </span>
        )}
        {resource.subtopic_name && (
          <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
            {resource.subtopic_name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {uploadDate && (
          <span className="flex items-center gap-1">
            <Clock size={11} /> {uploadDate}
          </span>
        )}
        {resource.file_size && (
          <span className="flex items-center gap-1">
            <HardDrive size={11} /> {typeof resource.file_size === 'number' ? formatSize(resource.file_size) : resource.file_size}
          </span>
        )}
        {resource.duration && (
          <span className="flex items-center gap-1">
            <Clock size={11} /> {resource.duration}
          </span>
        )}
      </div>
    </div>
  );
}
