// client/src/pages/StudentSubjectsPage.jsx
// Route: /student/subjects
// Shows the student's enrolled subjects, grouped by exam board.
// From here the student clicks a subject → SubjectPage → pick Resources/Practice/Quiz.

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { BookOpen, ChevronRight, Loader2, Plus, ArrowLeft } from 'lucide-react';

export default function StudentSubjectsPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [subjects,    setSubjects]    = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    api.get('/students/my-subjects')
      .then(r => setSubjects(r.data || []))
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
  }, []);

  // Group by exam board
  const byBoard = {};
  for (const s of subjects) {
    const board = s.exam_board_name || s.exam_board_code || 'Other';
    if (!byBoard[board]) byBoard[board] = [];
    byBoard[board].push(s);
  }

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <TopNav />

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Back */}
        <Link to="/student/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">My Subjects</h1>
            <p className="text-sm text-gray-400 mt-0.5">Select a subject to access resources, practice questions and quizzes</p>
          </div>
          <button
            onClick={() => navigate('/student/exam-types')}
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors">
            <Plus size={13} /> Add Exam Type
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
            <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700 mb-1">No subjects enrolled yet</p>
            <p className="text-xs text-gray-400 mb-4">Browse the catalog and enroll in your exam subjects to begin studying.</p>
            <button onClick={() => navigate('/student/exam-types')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
              Browse Exam Types
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byBoard).map(([board, subs]) => (
              <div key={board}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{board}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-300">{subs.length} subject{subs.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {subs.map(subject => (
                    <button
                      key={subject.id}
                      onClick={() => navigate(`/student/subject/${subject.id}`)}
                      className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-blue-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl shrink-0 group-hover:bg-blue-100 transition-colors">
                          {subject.icon_emoji || '📚'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700 transition-colors">{subject.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{subject.exam_board_code || board}</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                      </div>
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
