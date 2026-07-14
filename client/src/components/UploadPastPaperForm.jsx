// client/src/components/UploadPastPaperForm.jsx
// Direct PDF upload for past papers — the reliable primary path for both
// admin and teacher (URL scraping is kept as a secondary convenience tool
// elsewhere, not removed, not modified here).
//
// Supports:
//   - Single file upload with full metadata
//   - Bulk upload (multiple files at once) with shared defaults applied to
//     every file, since teachers/admins typically have a folder of papers
//     accumulated over time rather than one at a time.
//
// Each file is POSTed individually to POST /api/past-papers (the existing,
// unmodified single-file endpoint) — no new server endpoint is introduced,
// keeping this purely additive on the client side.

import { useState, useRef } from 'react';
import api from '../services/apiClient';
import { Upload, FileText, X, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

const EXAM_BOARDS = ['JAMB', 'WAEC', 'NECO', 'GCE_OL', 'GCE_AL', 'IELTS', 'TOEFL', 'SAT', 'JUPEB'];
const PAPER_TYPES = ['Objective', 'Theory', 'Practical', 'Listening', 'Speaking'];

export default function UploadPastPaperForm({ subjects = [], onUploaded, showToast }) {
  const fileInputRef = useRef(null);
  const [files, setFiles]           = useState([]);   // [{ file, title, status, error }]
  const [examBoard, setExamBoard]   = useState('');
  const [subjectId, setSubjectId]   = useState('');
  const [year, setYear]             = useState('');
  const [paperType, setPaperType]   = useState('');
  const [uploading, setUploading]   = useState(false);

  const handlePick = (e) => {
    const picked = Array.from(e.target.files || []);
    const pdfOnly = picked.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfOnly.length < picked.length) {
      showToast?.('Some files were skipped — only PDF files are accepted', 'error');
    }
    const next = pdfOnly.map(f => ({
      file:   f,
      title:  f.name.replace(/\.pdf$/i, ''),
      status: 'pending',
      error:  null,
    }));
    setFiles(prev => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const updateTitle = (idx, title) => {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, title } : f));
  };

  const reset = () => {
    setFiles([]);
    setExamBoard('');
    setSubjectId('');
    setYear('');
    setPaperType('');
  };

  const handleUploadAll = async () => {
    if (files.length === 0) {
      showToast?.('Select at least one PDF first', 'error');
      return;
    }
    if (!examBoard) {
      showToast?.('Exam type is required', 'error');
      return;
    }
    // CONFIRMED LIVE BUG: past_papers.subject_id is NOT NULL in the DB, but
    // nothing here previously required a subject to be picked before
    // submitting. Reproduced directly against the real endpoint with valid
    // PDFs and no subject_id: every file in the batch failed with a raw
    // Postgres NOT NULL violation and a generic "Upload failed for all
    // files" toast with no indication why.
    if (!subjectId) {
      showToast?.('Subject is required — please select one before uploading', 'error');
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      if (entry.status === 'done') continue;

      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading', error: null } : f));

      try {
        const formData = new FormData();
        formData.append('file', entry.file);
        formData.append('title', entry.title.trim() || entry.file.name);
        formData.append('exam_board', examBoard);
        if (subjectId)  formData.append('subject_id', subjectId);
        if (year)       formData.append('year', year);
        if (paperType)  formData.append('paper_type', paperType);

        await api.post('/past-papers', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done' } : f));
        successCount++;
      } catch (err) {
        const message = err?.response?.data?.error || err?.message || 'Upload failed';
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: message } : f));
        failCount++;
      }
    }

    setUploading(false);

    if (successCount > 0) {
      showToast?.(
        failCount === 0
          ? `${successCount} past paper${successCount > 1 ? 's' : ''} uploaded successfully`
          : `${successCount} uploaded, ${failCount} failed — see errors below`,
        failCount === 0 ? 'success' : 'error'
      );
      onUploaded?.();
    } else {
      showToast?.('Upload failed for all files', 'error');
    }

    setFiles(prev => prev.filter(f => f.status !== 'done'));
    if (successCount > 0 && failCount === 0) {
      setExamBoard(''); setSubjectId(''); setYear(''); setPaperType('');
    }
  };

  const inputCls = 'border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300';

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Upload size={15} className="text-violet-600" /> Upload Past Papers
        </h3>
        <p className="text-xs text-gray-400">PDF only · select multiple files to upload in bulk</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <select value={examBoard} onChange={e => setExamBoard(e.target.value)} className={inputCls}>
          <option value="">Exam Type *</option>
          {EXAM_BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inputCls}>
          <option value="">Subject (required)</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          type="number" min="1990" max={new Date().getFullYear()} placeholder={`Year (e.g. ${new Date().getFullYear()})`}
          value={year} onChange={e => setYear(e.target.value)} className={inputCls}
        />
        <select value={paperType} onChange={e => setPaperType(e.target.value)} className={inputCls}>
          <option value="">Paper Type (optional)</option>
          {PAPER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 hover:border-violet-300 rounded-xl py-6 cursor-pointer transition-colors">
        <Upload size={20} className="text-gray-400" />
        <span className="text-sm text-gray-600 font-medium">Click to select PDF file(s)</span>
        <span className="text-xs text-gray-400">You can select multiple files at once</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={handlePick}
          className="hidden"
        />
      </label>

      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <FileText size={14} className="text-gray-400 shrink-0" />
              <input
                value={entry.title}
                onChange={e => updateTitle(idx, e.target.value)}
                disabled={entry.status === 'uploading' || entry.status === 'done'}
                className="flex-1 bg-transparent text-sm text-gray-700 focus:outline-none disabled:text-gray-400"
              />
              <span className="text-xs text-gray-400 shrink-0">
                {(entry.file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              {entry.status === 'pending' && (
                <button onClick={() => removeFile(idx)} className="text-gray-400 hover:text-red-500 shrink-0">
                  <X size={14} />
                </button>
              )}
              {entry.status === 'uploading' && <Loader2 size={14} className="animate-spin text-violet-500 shrink-0" />}
              {entry.status === 'done' && <CheckCircle size={14} className="text-emerald-500 shrink-0" />}
              {entry.status === 'error' && (
                <span title={entry.error} className="flex items-center gap-1 text-xs text-red-500 shrink-0">
                  <AlertTriangle size={13} /> Failed
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={handleUploadAll}
          disabled={uploading || files.length === 0}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {uploading
            ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
            : <><Upload size={14} /> Upload {files.length > 0 ? `(${files.length})` : ''}</>}
        </button>
        {files.length > 0 && !uploading && (
          <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
