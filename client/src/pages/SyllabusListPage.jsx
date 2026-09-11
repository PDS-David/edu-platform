// client/src/pages/SyllabusListPage.jsx
//
// Syllabus-driven topic mapping — Prompt 3, Part 3 of 3 (entry points +
// navigation + wiring). Part 1 (backend: server/routes/syllabusRoutes.js)
// and Part 2 (client/src/pages/SyllabusReviewPage.jsx, the editable-tree
// review screen) already merged. This is the missing piece connecting
// them to the rest of the app: an upload form and a list of existing
// documents, each linking into the review screen.
//
// Mounted at BOTH /admin/syllabus and /teacher/syllabus (same component,
// same pattern as QuestionReview.jsx being reused at /teacher/review and
// /admin/questions/review) — role-derived base path below, not hardcoded,
// so "Review" links and the post-upload redirect land on the right prefix
// regardless of which role is viewing it.
//
// UPLOAD PICKER: deliberately mirrors AssignExamTypeModal.jsx's two-step
// board -> subject flow (useCatalog().examTypes for Step 1,
// fetchSubjectsForType(board.id) for Step 2), not a new picker pattern.
// Also matches that modal's own is_active filter on the subject list
// (see its BUG FIX comment) — otherwise an inactive subject would be
// selectable here as a normal option.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../hooks/useCatalog';
import {
  Loader2, AlertTriangle, FileText, Upload, ChevronLeft,
  CheckCircle, Clock, XCircle, FileSearch, X,
} from 'lucide-react';

const STATUS_META = {
  uploaded:   { label: 'Queued',            icon: Clock,       cls: 'text-gray-500 bg-gray-100'   },
  processing: { label: 'Processing…',       icon: Loader2,     cls: 'text-blue-600 bg-blue-50', spin: true },
  extracted:  { label: 'Ready for review',  icon: FileSearch,  cls: 'text-amber-700 bg-amber-50'  },
  confirmed:  { label: 'Confirmed',         icon: CheckCircle, cls: 'text-green-700 bg-green-50'  },
  failed:     { label: 'Failed',            icon: XCircle,     cls: 'text-red-700 bg-red-50'      },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.uploaded;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.cls}`}>
      <Icon size={12} className={meta.spin ? 'animate-spin' : ''} />
      {meta.label}
    </span>
  );
}

export default function SyllabusListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const basePath = user?.role === 'admin' ? '/admin/syllabus' : '/teacher/syllabus';

  const { examTypes, loadingTypes, typesError, fetchSubjectsForType } = useCatalog();

  // ── Upload form state ──────────────────────────────────────────────────
  const [showUpload,    setShowUpload]    = useState(false);
  const [pickStep,      setPickStep]      = useState(1); // 1: board, 2: subject
  const [board,         setBoard]         = useState(null);
  const [subjects,      setSubjects]      = useState([]);
  const [loadingSubs,   setLoadingSubs]   = useState(false);
  const [subject,       setSubject]       = useState(null);
  const [title,         setTitle]         = useState('');
  const [file,          setFile]          = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [uploadError,   setUploadError]   = useState('');

  // ── Document list state ────────────────────────────────────────────────
  const [docs,        setDocs]        = useState(null); // null = not yet loaded
  const [listLoading,  setListLoading]  = useState(true);
  const [listError,    setListError]    = useState('');

  const loadDocs = useCallback(() => {
    setListLoading(true);
    setListError('');
    api.get('/syllabus')
      .then(r => setDocs(r.data || []))
      .catch(err => setListError(err?.response?.data?.error || err?.message || 'Could not load syllabus documents.'))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const goToBoard = async (b) => {
    setBoard(b);
    setSubject(null);
    setUploadError('');
    setLoadingSubs(true);
    try {
      const subs = await fetchSubjectsForType(b.id);
      // Same reasoning as AssignExamTypeModal.jsx's goToSubjects: the
      // shared /catalog/types/:id/subjects endpoint intentionally returns
      // inactive subjects too (other consumers need to manage them), so
      // filter here rather than showing a selectable option that would
      // fail validation server-side.
      setSubjects(subs.filter(s => s.is_active !== false));
      setPickStep(2);
    } catch {
      setUploadError('Could not load subjects for this exam board.');
    } finally {
      setLoadingSubs(false);
    }
  };

  const resetUploadForm = () => {
    setPickStep(1); setBoard(null); setSubject(null);
    setSubjects([]); setTitle(''); setFile(null); setUploadError('');
  };

  const handleUpload = async () => {
    if (!board || !subject) { setUploadError('Pick an exam board and subject first.'); return; }
    if (!file) { setUploadError('Choose a PDF or Word file to upload.'); return; }

    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('exam_board_id', String(board.id));
      formData.append('subject_id', String(subject.id));
      if (title.trim()) formData.append('title', title.trim());

      const res = await api.post('/syllabus', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Straight into the review screen — it already polls while
      // status === 'processing', so there's nothing more to wait for here.
      navigate(`${basePath}/${res.data.id}`);
    } catch (err) {
      setUploadError(err?.response?.data?.error || err?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={18} className="text-gray-400" /> Syllabus Review
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a syllabus or scheme of work — AI extracts the topic structure, you review and confirm it, then it becomes real topics and subtopics.
          </p>
        </div>
        {!showUpload && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shrink-0">
            <Upload size={15} /> Upload Syllabus
          </button>
        )}
      </div>

      {/* ── Upload form ──────────────────────────────────────────────── */}
      {showUpload && (
        <div className="rounded-2xl border border-gray-100 p-5 mb-8 bg-gray-50/60">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Upload a new syllabus</h2>
            <button onClick={() => { setShowUpload(false); resetUploadForm(); }}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-100" title="Close">
              <X size={16} />
            </button>
          </div>

          {/* Step 1: exam board */}
          {pickStep === 1 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Step 1 — Exam board</p>
              {loadingTypes ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 size={14} className="animate-spin" /> Loading exam boards…</div>
              ) : typesError ? (
                <div className="flex items-center gap-2 text-sm text-red-500 py-4"><AlertTriangle size={14} /> {typesError}</div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {examTypes.filter(t => t.is_active !== false).map(b => (
                    <button key={b.id} onClick={() => goToBoard(b)} disabled={loadingSubs}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors text-left disabled:opacity-50">
                      <span className="text-lg shrink-0 w-6">{b.icon_emoji || '📋'}</span>
                      <p className="text-sm font-semibold text-gray-800 truncate">{b.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 2: subject, then title + file */}
          {pickStep === 2 && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setPickStep(1)} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
                  <ChevronLeft size={13} /> {board?.name}
                </button>
              </div>

              {!subject ? (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Step 2 — Subject</p>
                  {loadingSubs ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 size={14} className="animate-spin" /> Loading subjects…</div>
                  ) : subjects.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4">No subjects found for {board?.name}.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {subjects.map(s => (
                        <button key={s.id} onClick={() => setSubject(s)}
                          className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-100 bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors">
                          <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-800">{subject.name}</span> · {board?.name}
                    </p>
                    <button onClick={() => setSubject(null)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Change</button>
                  </div>

                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Title (optional)</label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Defaults to the file name if left blank"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />

                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Syllabus file (PDF or Word)</label>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="w-full text-sm mb-4 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-semibold hover:file:bg-blue-100"
                  />

                  {uploadError && (
                    <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {uploadError}
                    </div>
                  )}

                  <button onClick={handleUpload} disabled={uploading || !file}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    {uploading ? 'Uploading…' : 'Upload & Extract'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Document list ────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Syllabus documents</h2>
      {listLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : listError ? (
        <div className="flex items-center gap-2 text-sm text-red-500 py-4"><AlertTriangle size={14} /> {listError}</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-2xl">
          No syllabus documents yet — upload one above to get started.
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {docs.map(d => (
            <button key={d.id} onClick={() => navigate(`${basePath}/${d.id}`)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{d.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{d.subject_name} · {d.exam_board_name}</p>
              </div>
              <StatusBadge status={d.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
