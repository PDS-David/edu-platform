// client/src/pages/QuizHistoryPage.jsx
// URL: /student/subtopic/:subtopicId/quiz-history
// Shows a student's past quiz attempts for a subtopic.

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { Loader2, ChevronLeft, Trophy, Clock, Target, RotateCcw } from 'lucide-react';

function fmtTime(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function QuizHistoryPage() {
  const { subtopicId } = useParams();
  const navigate       = useNavigate();
  const [attempts, setAttempts] = useState([]);
  const [subtopic, setSubtopic] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!subtopicId) return;
    Promise.all([
      api.get(`/subtopics/${subtopicId}`).catch(() => null),
      api.get(`/quizzes/history`, { params: { subtopic_id: subtopicId } }).catch(() => null),
    ]).then(([subRes, histRes]) => {
      if (subRes?.data) setSubtopic(subRes.data);
      const list = histRes?.data ?? histRes ?? [];
      setAttempts(Array.isArray(list) ? list : []);
    }).finally(() => setLoading(false));
  }, [subtopicId]);

  const best = attempts.length
    ? Math.max(...attempts.map(a => Math.round(a.accuracy_pct ?? (a.score / (a.total_marks || 1)) * 100)))
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-white/60 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-white/50 text-xs mb-0.5">Quiz History</p>
            <h1 className="text-white text-lg font-bold">{subtopic?.name || 'Subtopic'}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Summary */}
        {attempts.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{attempts.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Attempts</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{best}%</p>
              <p className="text-xs text-gray-400 mt-0.5">Best score</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">
                {Math.round(attempts.reduce((s, a) => s + (a.accuracy_pct ?? 0), 0) / attempts.length)}%
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Average</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : attempts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Trophy size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No quiz attempts yet</p>
            <p className="text-xs mt-1">Take a quiz to see your history here</p>
            <button
              onClick={() => navigate(`/student/subtopic/${subtopicId}?tab=quiz`)}
              className="mt-4 flex items-center gap-2 mx-auto bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <RotateCcw size={13} /> Take a Quiz
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((attempt, i) => {
              const pct = Math.round(attempt.accuracy_pct ?? ((attempt.score / (attempt.total_marks || 1)) * 100));
              const scoreColor = pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500';
              return (
                <div key={attempt.id || i} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-4">
                  <div className={`text-2xl font-bold w-14 text-center shrink-0 ${scoreColor}`}>
                    {pct}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {attempt.score ?? '—'} / {attempt.total_marks ?? attempt.total ?? '—'} correct
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {fmtTime(attempt.total_time_ms)}
                      </span>
                      <span>{fmtDate(attempt.created_at || attempt.submitted_at)}</span>
                    </div>
                  </div>
                  {attempt.id && (
                    <Link
                      to={`/student/quiz-results/${attempt.id}`}
                      state={{ subtopicId, subtopicName: subtopic?.name }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 border border-blue-200 rounded-lg transition-colors shrink-0"
                    >
                      Review
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Retry button */}
        {!loading && (
          <button
            onClick={() => navigate(`/student/subtopic/${subtopicId}?tab=quiz`)}
            className="mt-6 w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-400 rounded-2xl py-4 text-sm transition-colors"
          >
            <RotateCcw size={14} /> Take another quiz
          </button>
        )}
      </div>
    </div>
  );
}
