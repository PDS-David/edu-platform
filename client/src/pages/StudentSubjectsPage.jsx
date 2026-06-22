// client/src/pages/StudentSubjectsPage.jsx
// Route: /student/subjects
// Shows the student's enrolled subjects grouped by exam board.
// S2a: students can unenrol from a subject via a trash icon + confirm dialog.

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import {
  BookOpen, Loader2, Plus, ArrowLeft, ChevronRight,
  Trash2, AlertTriangle, X,
} from 'lucide-react';

export default function StudentSubjectsPage() {
  const navigate = useNavigate();
  const [subjects,   setSubjects]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [confirm,    setConfirm]    = useState(null);   // subject to confirm-remove
  const [removing,   setRemoving]   = useState(null);   // id being removed
  const [toast,      setToast]      = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    api.get('/students/my-subjects')
      .then(r => setSubjects(r.data || []))
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
  }, []);

  // Group by exam board name
  const byBoard = {};
  for (const s of subjects) {
    const board = s.exam_board_name || s.exam_board_code || 'Other';
    if (!byBoard[board]) byBoard[board] = [];
    byBoard[board].push(s);
  }

  const handleUnenrol = async () => {
    if (!confirm) return;
    const subject = confirm;
    setConfirm(null);
    setRemoving(subject.id);
    try {
      await api.delete(`/students/subjects/${subject.id}`);
      setSubjects(prev => prev.filter(s => s.id !== subject.id));
      showToast(`Unenrolled from ${subject.name}`);
    } catch (err) {
      showToast(err?.message || 'Could not unenrol. Please try again.', false);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f7f4]">

      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Back */}
        <Link to="/student/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors">
          <ArrowLeft size={13} /> Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-gray-900">My Subjects</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Select a subject to study, practise or take a quiz
            </p>
          </div>
          <button
            onClick={() => navigate('/student/exam-types')}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={12} /> Add Subject
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={22} className="animate-spin text-blue-400" />
          </div>

        ) : subjects.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
            <BookOpen size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-600 mb-1">No subjects enrolled yet</p>
            <p className="text-xs text-gray-400 mb-4">Browse subjects and enroll to start studying.</p>
            <button onClick={() => navigate('/student/exam-types')}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors">
              Browse Subjects
            </button>
          </div>

        ) : (
          <div className="space-y-6">
            {Object.entries(byBoard).map(([board, subs]) => (
              <div key={board}>

                {/* Board heading */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{board}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[10px] text-gray-300">{subs.length}</span>
                </div>

                {/* Subject list */}
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-white">
                  {subs.map(subject => (
                    <div
                      key={subject.id}
                      className="flex items-center gap-3 px-4 py-3.5 group hover:bg-blue-50 transition-colors"
                    >
                      {/* Navigate area — takes up all space except the trash icon */}
                      <button
                        onClick={() => navigate(`/student/subject/${subject.id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <span className="text-xl shrink-0 w-8 text-center">
                          {subject.icon_emoji || '📚'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700 transition-colors">
                            {subject.name}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {subject.exam_board_code || board}
                            {subject.level ? ` · ${subject.level}` : ''}
                          </p>
                        </div>
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
                      </button>

                      {/* S2a: unenrol button */}
                      {removing === subject.id ? (
                        <Loader2 size={14} className="animate-spin text-red-300 shrink-0 ml-2" />
                      ) : (
                        <button
                          onClick={() => setConfirm(subject)}
                          title="Unenrol from this subject"
                          className="ml-2 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            ))}
          </div>
        )}

      </div>

      {/* S2a: Confirm unenrol dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Unenrol from {confirm.name}?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  You'll lose access to topics, resources and practice questions for this subject.
                  You can re-enrol from the Exam Types page at any time.
                </p>
              </div>
              <button
                onClick={() => setConfirm(null)}
                className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-500 transition-colors ml-auto">
                <X size={15} />
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleUnenrol}
                className="flex-1 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl transition-colors">
                Unenrol
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold border ${
          toast.ok
            ? 'bg-white border-emerald-200 text-emerald-700'
            : 'bg-white border-red-200 text-red-600'
        }`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  );
}
