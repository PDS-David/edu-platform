// client/src/pages/TeacherPendingQuestions.jsx
// T2: show ALL submitted questions with real status badges, rejection feedback,
// and tab filters (All / Pending / Approved / Rejected).

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import {
  CheckCircle, Loader2, BookOpen, Plus, Clock, XCircle,
} from 'lucide-react';

const STATUS_META = {
  approved: {
    label: 'Approved',
    icon: <CheckCircle size={12} />,
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  active: {
    label: 'Approved',
    icon: <CheckCircle size={12} />,
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rejected: {
    label: 'Rejected',
    icon: <XCircle size={12} />,
    cls: 'bg-red-50 text-red-700 border-red-200',
  },
  pending: {
    label: 'Pending',
    icon: <Clock size={12} />,
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

const DIFF_CLS = {
  easy:   'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard:   'bg-red-100 text-red-700',
};

const TABS = ['all', 'pending', 'approved', 'rejected'];

export default function TeacherPendingQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('all');

  useEffect(() => {
    // T2: fetch ALL questions (no status filter) so teacher can see every outcome
    api.get('/teacher/questions')
      .then(r => setQuestions(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { all: questions.length, pending: 0, approved: 0, rejected: 0 };
    questions.forEach(q => {
      const s = (q.status || 'pending').toLowerCase();
      if (s === 'pending')                   c.pending++;
      else if (s === 'approved' || s === 'active') c.approved++;
      else if (s === 'rejected')             c.rejected++;
    });
    return c;
  }, [questions]);

  const visible = useMemo(() => {
    if (tab === 'all') return questions;
    return questions.filter(q => {
      const s = (q.status || 'pending').toLowerCase();
      if (tab === 'approved') return s === 'approved' || s === 'active';
      return s === tab;
    });
  }, [questions, tab]);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Header */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/teacher/dashboard"
              className="text-white/50 text-xs mb-1 hover:text-white/80 flex items-center gap-1">
              ← Dashboard
            </Link>
            <h1 className="text-white text-xl font-bold">My Questions</h1>
            <p className="text-white/60 text-sm mt-0.5">
              Questions you have submitted for review
            </p>
          </div>
          <Link to="/teacher/resources?tab=questions"
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={14} /> Add Question
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Tab filters */}
        {!loading && questions.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${
                  tab === t
                    ? 'bg-[#0a4a3f] text-white border-[#0a4a3f]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === t ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {counts[t === 'approved' ? 'approved' : t] ?? 0}
                </span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>

        ) : questions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">You haven't submitted any questions yet.</p>
            <Link to="/teacher/resources"
              className="mt-4 inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              <Plus size={14} /> Add your first question
            </Link>
          </div>

        ) : visible.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No {tab} questions.
          </div>

        ) : (
          <div className="space-y-3">
            {visible.map(q => {
              const status = (q.status || 'pending').toLowerCase();
              const meta   = STATUS_META[status] || STATUS_META.pending;
              const isRejected = status === 'rejected';

              return (
                <div key={q.id}
                  className={`bg-white border rounded-2xl overflow-hidden ${
                    isRejected ? 'border-red-100' : 'border-gray-100'
                  }`}>
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-gray-800 text-sm leading-relaxed flex-1">
                        {q.question_text}
                      </p>
                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${meta.cls}`}>
                        {meta.icon} {meta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      {q.subject_name && (
                        <span className="text-xs text-gray-400">{q.subject_name}</span>
                      )}
                      {q.difficulty && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${DIFF_CLS[q.difficulty] || 'bg-gray-100 text-gray-500'}`}>
                          {q.difficulty}
                        </span>
                      )}
                      {q.question_type && (
                        <span className="text-xs text-gray-300">
                          {q.question_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* T2: rejection feedback */}
                  {isRejected && q.feedback && (
                    <div className="px-5 py-3 bg-red-50 border-t border-red-100 flex items-start gap-2">
                      <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-600 mb-0.5">
                          Rejection reason
                        </p>
                        <p className="text-xs text-red-500 leading-relaxed">{q.feedback}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
