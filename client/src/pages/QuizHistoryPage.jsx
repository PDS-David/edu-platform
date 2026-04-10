// client/src/pages/QuizHistoryPage.jsx
// TASK 10: Shows past quiz attempts for a given subtopic.
// URL: /student/subtopic/:subtopicId/quiz-history
// Calls: GET /api/quizzes/history?subtopic_id=:subtopicId

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, Trophy, Clock, Target, ArrowRight } from 'lucide-react';
import api from '../services/api';

export default function QuizHistoryPage() {
  const { subtopicId } = useParams();
  const navigate = useNavigate();

  const [attempts, setAttempts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/quizzes/history', { params: { subtopic_id: subtopicId } });
        setAttempts(res.data || []);
      } catch {
        setError('Failed to load quiz history.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [subtopicId]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const formatTime = (ms) => {
    if (!ms) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const gradeBadge = (pct) => {
    if (pct >= 80) return 'bg-green-100 text-green-700';
    if (pct >= 60) return 'bg-blue-100 text-blue-700';
    if (pct >= 40) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="text-sm font-semibold text-gray-800">Quiz History</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {!loading && !error && attempts.length === 0 && (
          <div className="text-center py-20">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No attempts yet</p>
            <p className="text-gray-400 text-sm mt-1">Complete a quiz to see your history here.</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              Start a Quiz
            </button>
          </div>
        )}

        {!loading && attempts.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-1">{attempts.length} attempt{attempts.length !== 1 ? 's' : ''} recorded</p>
            {attempts.map((attempt, i) => {
              const pct = attempt.total_marks > 0
                ? Math.round((attempt.score / attempt.total_marks) * 100)
                : 0;
              return (
                <div
                  key={attempt.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4"
                >
                  {/* Rank / number */}
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                    {i + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeBadge(pct)}`}>
                        {pct}%
                      </span>
                      <span className="text-xs text-gray-400">
                        {attempt.score}/{attempt.total_marks} marks
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(attempt.time_taken_ms)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        {formatDate(attempt.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Link to results */}
                  <button
                    onClick={() => navigate(`/student/quiz-results/${attempt.id}`)}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium flex-shrink-0"
                  >
                    Review <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
