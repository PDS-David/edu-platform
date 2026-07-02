// client/src/pages/TeacherPastPapersPage.jsx
// URL: /teacher/past-papers
//
// Teachers upload past papers directly (PDF, single or bulk) — this is the
// reliable primary path, matching the admin panel's approach, since most
// external sites block scraping. Teachers can delete only the papers they
// themselves uploaded; the server enforces this via created_by ownership
// check (see DELETE /api/past-papers/:id in pastPaperRoutes.js).

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import TopNav from '../components/TopNav';
import UploadPastPaperForm from '../components/UploadPastPaperForm';
import {
  BookOpen, RefreshCw, Trash2, Loader2, CheckCircle, AlertTriangle, X,
} from 'lucide-react';

function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3
      rounded-2xl shadow-xl text-sm font-semibold text-white max-w-sm
      ${type === 'error' ? 'bg-red-600' : 'bg-gray-900'}`}>
      {type === 'error'
        ? <AlertTriangle size={14} className="shrink-0" />
        : <CheckCircle size={14} className="text-emerald-400 shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose}><X size={13} className="opacity-60" /></button>
    </div>
  );
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TeacherPastPapersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [papers, setPapers]     = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ msg: message, type });
  };

  const fetchPapers = async () => {
    setLoading(true);
    try {
      const r = await api.get('/past-papers');
      setPapers(r.data || []);
    } catch {
      setPapers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPapers(); }, []);

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => {
        const assigned = r.data || [];
        if (assigned.length > 0) {
          setSubjects(assigned);
        } else {
          // Teacher has no formal subject assignments — fall back to the full
          // catalog so they can still tag past papers with a subject.
          return api.get('/catalog/all-subjects')
            .then(r2 => setSubjects(r2.data || []))
            .catch(() => setSubjects([]));
        }
      })
      .catch(() =>
        api.get('/catalog/all-subjects')
          .then(r2 => setSubjects(r2.data || []))
          .catch(() => setSubjects([]))
      );
  }, []);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/past-papers/${id}`);
      showToast('Paper deleted');
      setPapers(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to delete paper', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Past Papers</h1>
            <p className="text-sm text-gray-400">
              Upload PDF past papers for your students. Once uploaded, every student on the
              platform can find it on the public Past Papers page (login required to download).
            </p>
          </div>
          <button
            onClick={() => navigate('/past-papers')}
            className="flex items-center gap-2 text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold px-4 py-2 rounded-xl shrink-0"
          >
            <BookOpen size={14} /> Student View
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

        <UploadPastPaperForm
          subjects={subjects}
          onUploaded={fetchPapers}
          showToast={showToast}
        />

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-800">All Papers in the Library</h2>
          <button onClick={fetchPapers} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        ) : papers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No past papers uploaded yet. Use the form above to add the first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-400 font-medium">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Subject</th>
                  <th className="text-left px-4 py-3">Exam Type</th>
                  <th className="text-left px-4 py-3">Year</th>
                  <th className="text-left px-4 py-3">Size</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {papers.map(p => {
                  const isMine = p.created_by === user?.id;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">
                        {p.title}
                        {isMine && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                            Yours
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.subject_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono bg-violet-50 text-violet-600 px-2 py-0.5 rounded">{p.exam_board}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.year || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{fmtSize(p.file_size_bytes)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.file_url && (
                            <a href={p.file_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-violet-600 hover:text-violet-800 font-semibold">
                              View
                            </a>
                          )}
                          {isMine ? (
                            <button
                              onClick={() => handleDelete(p.id, p.title)}
                              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          You can only delete past papers that you uploaded yourself. Papers uploaded by other
          teachers or by an admin can be viewed but not removed from here.
        </p>
      </div>
    </div>
  );
}
