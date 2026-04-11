// client/src/pages/TeacherPendingQuestions.jsx
// TASK 14: Shows questions submitted by this teacher, with status badges.
// Since Task 3/5 auto-approve all teacher questions, most will show "Approved".
// Route: /teacher/pending-questions

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, CheckCircle, Clock, XCircle, BookOpen, RefreshCw, Plus, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const STATUS_CONFIG = {
  approved: { label: 'Approved',       icon: CheckCircle, classes: 'bg-green-100 text-green-700',  border: 'border-green-200'  },
  pending:  { label: 'Pending Review', icon: Clock,       classes: 'bg-amber-100 text-amber-700',  border: 'border-amber-200'  },
  rejected: { label: 'Rejected',       icon: XCircle,     classes: 'bg-red-100 text-red-700',      border: 'border-red-200'    },
};

const TYPE_META = {
  mcq:   { label: 'MCQ',   bg: 'bg-indigo-100 text-indigo-700' },
  essay: { label: 'Essay', bg: 'bg-teal-100 text-teal-700'     },
};

export default function TeacherPendingQuestions() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [filter,    setFilter]    = useState('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/teacher/questions');
      setQuestions(res.data || []);
    } catch {
      setError('Failed to load your questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? questions : questions.filter(q => q.status === filter);
  const counts = {
    all:      questions.length,
    pending:  questions.filter(q => q.status === 'pending').length,
    approved: questions.filter(q => q.status === 'approved').length,
    rejected: questions.filter(q => q.status === 'rejected').length,
  };

  const statusCfg = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/teacher/dashboard')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Dashboard
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="text-sm font-semibold text-gray-800">My Submitted Questions</h1>
        {questions.length > 0 && (
          <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {questions.length}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link to="/contribute" className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Question
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="border-b border-gray-100 bg-white px-4">
        <div className="max-w-3xl mx-auto flex gap-1 overflow-x-auto">
          {[
            { key: 'all',      label: `All (${counts?.all ?? 0})`               },
            { key: 'pending',  label: `⏳ Pending (${counts?.pending ?? 0})`    },
            { key: 'approved', label: `✅ Approved (${counts?.approved ?? 0})`  },
            { key: 'rejected', label: `❌ Rejected (${counts?.rejected ?? 0})`  },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                filter === f.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-600 text-sm font-medium">{error}</p>
            <button onClick={load} className="mt-3 text-sm text-red-500 hover:underline">Retry</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No questions submitted yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Questions you submit via the Resources page will appear here.
            </p>
            <button
              onClick={() => navigate('/teacher/add-questions')}
              className="mt-5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              Add Questions
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map(q => {
              const cfg = statusCfg(q.status);
              const StatusIcon = cfg.icon;
              let opts = q.options;
              if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = []; } }
              if (!Array.isArray(opts)) opts = [];

              return (
                <div key={q.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${cfg.border || 'border-gray-100'}`}>
                  <div className="px-5 pt-4 pb-3">
                    {/* Status + meta */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.classes}`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      {(() => { const tm = TYPE_META[q.question_type] || TYPE_META.mcq; return (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tm.bg}`}>{tm.label}</span>
                      ); })()}
                      {q.subject_name && (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full">
                          {q.subject_name}
                        </span>
                      )}
                      {q.difficulty && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full capitalize">
                          {q.difficulty}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-gray-400">
                        {new Date(q.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </span>
                    </div>

                    {/* Question text */}
                    <p className="text-gray-900 font-medium text-sm leading-relaxed">{q.question_text}</p>
                  </div>

                  {/* Source attribution */}
                  {q.source && (
                    <p className="text-xs text-gray-400 italic px-5 pb-1">Source: {q.source}</p>
                  )}

                  {/* Rejection reason */}
                  {q.status === 'rejected' && q.rejection_reason && (
                    <div className="mx-5 mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-600">
                      <strong>Reason:</strong> {q.rejection_reason}
                    </div>
                  )}

                  {/* Options */}
                  {opts.length > 0 && (
                    <div className="px-5 pb-4 grid grid-cols-2 gap-2">
                      {opts.map((opt, i) => (
                        <div
                          key={i}
                          className={`text-xs px-3 py-2 rounded-lg border ${
                            opt.is_correct
                              ? 'border-green-300 bg-green-50 text-green-800 font-semibold'
                              : 'border-gray-100 bg-gray-50 text-gray-600'
                          }`}
                        >
                          {['A','B','C','D'][i]}. {opt.option_text}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="mx-5 mb-4 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                      <p className="text-xs text-blue-700">{q.explanation}</p>
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
