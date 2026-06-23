// client/src/pages/AllQuizHistoryPage.jsx
// URL: /student/quiz-history
// Shows the student's complete quiz history across ALL subjects in one place.
// S8 fix: previously QuizHistoryPage was only reachable from within a specific
// subtopic — students had no way to see their history across subjects.

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import { Loader2, ChevronLeft, Trophy, Clock, BookOpen, RotateCcw, Filter } from 'lucide-react';

function fmtTime(secs) {
  if (!secs) return '—';
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime12(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function AllQuizHistoryPage() {
  const navigate = useNavigate();
  const [attempts, setAttempts]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [filter,   setFilter]     = useState('all'); // 'all' | subject name

  useEffect(() => {
    api.get('/quizzes/all-history', { params: { limit: 100 } })
      .then(r => setAttempts(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAttempts([]))
      .finally(() => setLoading(false));
  }, []);

  // Unique subjects for filter dropdown
  const subjects = ['all', ...new Set(attempts.map(a => a.subject_name).filter(Boolean))];

  const filtered = filter === 'all'
    ? attempts
    : attempts.filter(a => a.subject_name === filter);

  // Summary stats
  const totalAttempts = attempts.length;
  const avgAccuracy   = totalAttempts
    ? Math.round(attempts.reduce((s, a) => s + (a.accuracy_pct || 0), 0) / totalAttempts)
    : 0;
  const bestScore = totalAttempts
    ? Math.max(...attempts.map(a => a.accuracy_pct || 0))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-white/60 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-white/50 text-xs mb-0.5">All Subjects</p>
            <h1 className="text-white text-lg font-bold">Quiz History</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Summary cards */}
        {totalAttempts > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{totalAttempts}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total Quizzes</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{bestScore}%</p>
              <p className="text-xs text-gray-400 mt-0.5">Best Score</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{avgAccuracy}%</p>
              <p className="text-xs text-gray-400 mt-0.5">Average</p>
            </div>
          </div>
        )}

        {/* Subject filter */}
        {subjects.length > 2 && (
          <div className="flex items-center gap-2 mb-4">
            <Filter size={14} className="text-gray-400" />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
            >
              {subjects.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Subjects' : s}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Trophy size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No quiz attempts yet</p>
            <p className="text-xs mt-1">Take a quiz on any subject to see your history here</p>
            <button
              onClick={() => navigate('/student/subjects')}
              className="mt-4 flex items-center gap-2 mx-auto bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <BookOpen size={13} /> Browse Subjects
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((attempt, i) => {
              const pct = attempt.accuracy_pct || 0;
              const scoreColor = pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500';
              return (
                <div key={attempt.attempt_id || i} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4">
                  <div className={`text-2xl font-bold w-14 text-center shrink-0 ${scoreColor}`}>
                    {pct}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {attempt.subtopic_name || attempt.subject_name || 'Quiz'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {attempt.subject_name}{attempt.exam_board_code ? ` · ${attempt.exam_board_code}` : ''}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span>{attempt.questions_correct}/{attempt.questions_total} correct</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> {fmtTime(attempt.total_time_secs)}
                      </span>
                      <span>{fmtDate(attempt.attempted_at)} {fmtTime12(attempt.attempted_at)}</span>
                    </div>
                  </div>
                  {attempt.subtopic_id && (
                    <Link
                      to={`/student/subtopic/${attempt.subtopic_id}?tab=quiz`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 border border-blue-200 rounded-lg transition-colors shrink-0"
                    >
                      Retry
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <button
            onClick={() => navigate('/student/subjects')}
            className="mt-6 w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-400 rounded-2xl py-4 text-sm transition-colors"
          >
            <RotateCcw size={14} /> Practice more subjects
          </button>
        )}
      </div>
    </div>
  );
}
