// client/src/pages/StudentSubjectsPage.jsx
// Route: /student/subjects
// Shows the student's enrolled subjects grouped by exam board.
// Clean list-row layout — no cards.

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { BookOpen, Loader2, Plus, ArrowLeft, ChevronRight } from 'lucide-react';

export default function StudentSubjectsPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [loading,  setLoading]  = useState(true);

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

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <TopNav />

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
            onClick={() => navigate('/subjects')}
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
            <button onClick={() => navigate('/subjects')}
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
                    <button
                      key={subject.id}
                      onClick={() => navigate(`/student/subject/${subject.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-blue-50 transition-colors group"
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
                  ))}
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
