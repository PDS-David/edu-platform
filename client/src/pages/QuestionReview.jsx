// client/src/pages/QuestionReview.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel: pending question submissions → approve or reject with feedback
// GET  /api/questions/pending
// PUT  /api/questions/:id/review
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight,
  User, Calendar, BookOpen, Tag, Loader, RefreshCw, AlertCircle,
  ArrowLeft,
} from 'lucide-react';


const PAGE_SIZE = 10;

const DIFFICULTY_COLORS = {
  easy:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard:   'bg-red-100 text-red-700',
};

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ─────────────────────────────────────────────────────────────────────────────

export default function QuestionReview() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [offset,    setOffset]    = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Review modal state
  const [reviewing, setReviewing] = useState(null); // question object
  const [action,    setAction]    = useState('');   // 'approve' | 'reject'
  const [feedback,  setFeedback]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPending = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(
        `${API}/questions/pending?limit=${PAGE_SIZE}&offset=${off}`,
        { headers: authHeader() }
      );
      setQuestions(data.data || []);
      setTotal(data.total || 0);
      setOffset(off);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load pending questions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(0); }, [fetchPending]);

  // ── Review submit ──────────────────────────────────────────────────────────

  const submitReview = async () => {
    if (!reviewing || !action) return;
    setSubmitting(true);
    try {
      const { data } = await axios.put(
        `${API}/questions/${reviewing.id}/review`,
        { action, feedback: feedback.trim() || undefined },
        { headers: authHeader() }
      );
      if (data.success) {
        setReviewing(null);
        setAction('');
        setFeedback('');
        // Remove from list immediately for instant feedback
        setQuestions(prev => prev.filter(q => q.id !== reviewing.id));
        setTotal(t => t - 1);
      }
    } catch (err) {
      alert(err?.response?.data?.error || 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Pagination ─────────────────────────────────────────────────────────────

  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!loading && !error && questions.length === 0 && offset === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">All caught up!</h2>
          <p className="text-gray-500 mb-6">No pending questions to review.</p>
          <button onClick={() => fetchPending(0)} className="flex items-center gap-2 mx-auto text-indigo-600 hover:text-indigo-700 font-medium">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl px-3 py-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-6 h-6 text-orange-500" /> Question Review Queue
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {loading ? 'Loading…' : `${total} pending submission${total !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchPending(offset)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-white transition-colors text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={() => fetchPending(0)} className="ml-auto text-xs font-medium underline">Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map(j => <div key={j} className="h-10 bg-gray-100 rounded-lg" />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Question cards */}
        {!loading && questions.length > 0 && (
          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Card header */}
                <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">
                    {q.exam_board_code} — {q.exam_board_name}
                  </span>
                  {q.topic && (
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {q.topic}
                    </span>
                  )}
                  {q.year && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {q.year}
                    </span>
                  )}
                  {q.difficulty && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${DIFFICULTY_COLORS[q.difficulty] || 'bg-gray-100 text-gray-600'}`}>
                      {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {q.submitter_first_name} {q.submitter_last_name}
                    {q.submitter_email && <span className="text-gray-300">· {q.submitter_email}</span>}
                  </span>
                </div>

                {/* Question text */}
                <div className="px-6 py-4">
                  <p className="text-gray-900 font-medium leading-relaxed">{q.question_text}</p>
                </div>

                {/* Options */}
                <div className="px-6 pb-4 grid grid-cols-2 gap-2">
                  {(q.options || []).map((opt, i) => (
                    <div
                      key={opt.id}
                      className={`flex items-center gap-2 p-3 rounded-xl border ${
                        opt.is_correct
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-100 bg-gray-50'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                        opt.is_correct ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {OPTION_LABELS[i]}
                      </span>
                      <span className="text-sm text-gray-800 truncate">{opt.option_text}</span>
                      {opt.is_correct && <CheckCircle className="w-4 h-4 text-green-500 ml-auto flex-shrink-0" />}
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="px-6 pb-5 flex gap-3">
                  <button
                    onClick={() => { setReviewing(q); setAction('approve'); setFeedback(''); }}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => { setReviewing(q); setAction('reject'); setFeedback(''); }}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => fetchPending(offset - PAGE_SIZE)}
              disabled={offset === 0}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => fetchPending(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Review Confirm Modal ─────────────────────────────────────────────── */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              {action === 'approve'
                ? <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
                : <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600" /></div>
              }
              <div>
                <h3 className="font-bold text-gray-900">
                  {action === 'approve' ? 'Approve Question' : 'Reject Question'}
                </h3>
                <p className="text-xs text-gray-500">Question #{reviewing.id}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-sm text-gray-700 line-clamp-3">{reviewing.question_text}</p>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Feedback to submitter <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={3}
                placeholder={action === 'reject' ? 'Reason for rejection…' : 'Any notes for the contributor…'}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setReviewing(null); setAction(''); setFeedback(''); }}
                disabled={submitting}
                className="flex-1 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={submitting}
                className={`flex-1 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm ${
                  action === 'approve'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                } disabled:opacity-50`}
              >
                {submitting ? <Loader className="w-4 h-4 animate-spin" /> : null}
                Confirm {action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
