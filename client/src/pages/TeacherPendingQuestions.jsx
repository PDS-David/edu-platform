// client/src/pages/TeacherPendingQuestions.jsx
// Route: /teacher/pending-questions
// Shows the teacher all questions they have submitted, grouped by status.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import {
  Clock, CheckCircle, XCircle, BookOpen,
  ArrowLeft, Plus, RefreshCw, Loader2, AlertTriangle,
} from 'lucide-react';
import TopNav from '../components/TopNav';

const STATUS_META = {
  pending:  { label: 'Pending Review', color: 'bg-amber-100 text-amber-700',  icon: Clock,         border: 'border-amber-200' },
  approved: { label: 'Approved',       color: 'bg-green-100 text-green-700',  icon: CheckCircle,   border: 'border-green-200' },
  rejected: { label: 'Rejected',       color: 'bg-red-100 text-red-700',      icon: XCircle,       border: 'border-red-200'   },
};

const TYPE_META = {
  mcq:   { label: 'MCQ',   bg: 'bg-indigo-100 text-indigo-700' },
  essay: { label: 'Essay', bg: 'bg-teal-100 text-teal-700'     },
};

export default function TeacherPendingQuestions() {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // GET /api/questions/my-submissions — returns questions submitted by the logged-in teacher
      const res = await api.get('/questions/my-submissions');
      setQuestions(res.data || res || []);
    } catch (err) {
      setError(err?.error || 'Failed to load your questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all'
    ? questions
    : questions.filter(q => q.status === filter);

  const counts = {
    all:      questions.length,
    pending:  questions.filter(q => q.status === 'pending').length,
    approved: questions.filter(q => q.status === 'approved').length,
    rejected: questions.filter(q => q.status === 'rejected').length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" /> My Submitted Questions
            </h1>
            <p className="text-sm text-gray-500">Track the status of all questions you have contributed</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="p-2 hover:bg-white rounded-lg border border-gray-200 transition-colors text-gray-500"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              to="/contribute"
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Question
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {[
            { key: 'all',      label: `All (${counts.all})`              },
            { key: 'pending',  label: `⏳ Pending (${counts.pending})`   },
            { key: 'approved', label: `✅ Approved (${counts.approved})` },
            { key: 'rejected', label: `❌ Rejected (${counts.rejected})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                filter === f.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin mr-3" />
            <span className="text-gray-500">Loading your questions…</span>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-600 text-sm font-medium">{error}</p>
            <button onClick={load} className="mt-3 text-sm text-red-500 hover:underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium text-sm">
              {filter === 'all' ? 'No questions submitted yet.' : `No ${filter} questions.`}
            </p>
            <Link
              to="/contribute"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              <Plus className="w-4 h-4" /> Contribute your first question
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((q) => {
              const sm  = STATUS_META[q.status] || STATUS_META.pending;
              const tm  = TYPE_META[q.question_type] || TYPE_META.mcq;
              const SI  = sm.icon;

              return (
                <div
                  key={q.id}
                  className={`bg-white rounded-2xl border-2 ${sm.border} p-4`}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <SI className={`w-4 h-4 mt-0.5 shrink-0 ${sm.color.split(' ')[1]}`} />
                      <p className="text-sm font-medium text-gray-800 leading-snug">
                        {q.question_text}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tm.bg}`}>
                        {tm.label}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.color}`}>
                        {sm.label}
                      </span>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2 ml-6 text-xs text-gray-400">
                    {q.exam_board_name && (
                      <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                        {q.exam_board_name}
                      </span>
                    )}
                    {q.subject_name && (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{q.subject_name}</span>
                    )}
                    {q.topic && <span>{q.topic}</span>}
                    {q.year  && <span>{q.year}</span>}
                    {q.difficulty && (
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        q.difficulty === 'easy'   ? 'bg-green-50 text-green-700'  :
                        q.difficulty === 'medium' ? 'bg-amber-50 text-amber-700'  :
                                                    'bg-red-50 text-red-700'
                      }`}>
                        {q.difficulty}
                      </span>
                    )}
                    {q.source && (
                      <span className="italic text-gray-300">Source: {q.source}</span>
                    )}
                    <span className="ml-auto text-gray-300">
                      {q.created_at ? new Date(q.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                    </span>
                  </div>

                  {/* Rejection reason */}
                  {q.status === 'rejected' && q.rejection_reason && (
                    <div className="ml-6 mt-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-600">
                      <strong>Reason:</strong> {q.rejection_reason}
                    </div>
                  )}

                  {/* MCQ options preview */}
                  {q.question_type === 'mcq' && q.options?.length > 0 && (
                    <div className="ml-6 mt-2 grid grid-cols-2 gap-1">
                      {q.options.map((o, i) => (
                        <div
                          key={i}
                          className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1.5 ${
                            o.is_correct
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-gray-50 text-gray-500'
                          }`}
                        >
                          <span className="font-bold">{String.fromCharCode(65 + i)}.</span>
                          <span className="truncate">{o.option_text || o.text}</span>
                          {o.is_correct && <CheckCircle className="w-3 h-3 shrink-0 ml-auto" />}
                        </div>
                      ))}
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
