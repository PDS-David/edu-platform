// client/src/pages/MockExamHistoryPage.jsx
// Route: /student/mock-history
// S6 fix: shows all past mock exam attempts so students can track
// improvement over time and revisit their results.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import {
  ClipboardList, ArrowLeft, Loader2, CheckCircle,
  XCircle, Clock, Calendar, TrendingUp, AlertCircle,
} from 'lucide-react';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtTime(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function gradeColor(pct) {
  if (pct >= 80) return 'text-green-600 bg-green-50';
  if (pct >= 60) return 'text-blue-600 bg-blue-50';
  if (pct >= 50) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

function GradeBadge({ pct }) {
  const cls = gradeColor(pct);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold ${cls}`}>
      {pct}%
    </span>
  );
}

export default function MockExamHistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    api.get('/quizzes/mock-history')
      .then(r => setHistory(r.data || []))
      .catch(() => setError('Could not load mock exam history.'))
      .finally(() => setLoading(false));
  }, []);

  // Best and most recent stats for the summary bar
  const best   = history.length ? Math.max(...history.map(h => h.accuracy_pct)) : null;
  const avg    = history.length
    ? Math.round(history.reduce((s, h) => s + h.accuracy_pct, 0) / history.length)
    : null;

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#0a4a3f] flex items-center justify-center">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Examination History</h1>
            <p className="text-sm text-gray-500">All your past mock exam attempts</p>
          </div>
        </div>

        {/* Summary bar */}
        {history.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-black text-gray-900">{history.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Attempts</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-black text-green-600">{best}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Best Score</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-black text-blue-600">{avg}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Average</p>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="text-[#0a4a3f] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertCircle size={32} className="text-red-400" />
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <ClipboardList size={28} className="text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">No mock exams yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Complete a mock exam and it will appear here.
              </p>
            </div>
            <button
              onClick={() => navigate('/student/dashboard')}
              className="mt-2 bg-[#0a4a3f] hover:bg-[#0a4a3f]/90 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, i) => (
              <div
                key={item.session_id || i}
                className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {item.subject_name}
                      </p>
                      {/* Trend icon: better than previous */}
                      {i < history.length - 1 && (
                        item.accuracy_pct > history[i + 1].accuracy_pct
                          ? <TrendingUp size={13} className="text-green-500" />
                          : null
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} /> {fmtDate(item.attempted_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {fmtTime(item.time_taken_seconds)}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle size={11} className="text-green-400" />
                        {item.correct}/{item.total} correct
                      </span>
                    </div>
                  </div>
                  <GradeBadge pct={item.accuracy_pct} />
                </div>

                {/* Score bar */}
                <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.accuracy_pct >= 60 ? 'bg-green-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${item.accuracy_pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
