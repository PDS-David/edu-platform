// client/src/pages/TeacherResultsPage.jsx
// Routes: /teacher/tests/:id/results, /teacher/examinations/:id/results
//
// This page did not exist before — confirmed via grep across
// teacherRoutes.js and adminRoutes.js that neither Tests nor Examinations
// had any endpoint or page that let a teacher see student scores at all.
// A teacher could create and assign both, but never actually see how
// students did. Built as one shared component for both, since the shape
// (a list of students with a score, a completion timestamp, and a
// needs_manual_review flag) is the same either way — the `type` prop
// picks the right endpoint and a couple of label differences.

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import {
  ArrowLeft, Loader2, AlertCircle, Users, CheckCircle,
  Clock, AlertTriangle, FileText,
} from 'lucide-react';

function fmtDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function TeacherResultsPage({ type }) {
  // type: 'test' | 'examination'
  const { id } = useParams();
  const navigate = useNavigate();
  const [data,    setData]    = useState(null); // { test|examination, results }
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const endpoint = type === 'examination'
    ? `/teacher/examinations/${id}/results`
    : `/teacher/tests/${id}/results`;
  const parentKey = type === 'examination' ? 'examination' : 'test';
  const completedField = type === 'examination' ? 'submitted_at' : 'completed_at';

  useEffect(() => {
    api.get(endpoint)
      .then(r => setData(r.data))
      .catch(err => setError(err?.response?.data?.error || err?.message || 'Could not load results.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="text-violet-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-violet-600 hover:text-violet-700 font-medium">
          Go back
        </button>
      </div>
    );
  }

  const parent  = data?.[parentKey] || {};
  const results = data?.results || [];
  const submittedCount = results.filter(r => r[completedField]).length;
  const flaggedCount   = results.filter(r => r.needs_manual_review).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
          <FileText size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{parent.title || 'Results'}</h1>
          <p className="text-sm text-gray-500">
            {submittedCount} of {results.length} {results.length === 1 ? 'student has' : 'students have'} submitted
            {flaggedCount > 0 && (
              <span className="text-amber-600 font-medium"> · {flaggedCount} need{flaggedCount === 1 ? 's' : ''} your review</span>
            )}
          </p>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Users size={28} className="text-gray-300" />
          <p className="text-sm text-gray-400">No students have been assigned this {type === 'examination' ? 'examination' : 'test'} yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-50 overflow-hidden">
          {results.map(r => {
            const submitted = !!r[completedField];
            return (
              <div key={r.assignment_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.first_name} {r.last_name}</p>
                  <p className="text-xs text-gray-400 truncate">{r.email}</p>
                </div>

                {r.needs_manual_review && (
                  <span title="An answer in this submission needs your review"
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 shrink-0">
                    <AlertTriangle size={11} /> Needs review
                  </span>
                )}

                {submitted ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-green-50 text-green-700 shrink-0">
                    <CheckCircle size={11} />
                    {r.score != null ? `${r.score}${parent.total_marks ? ` / ${parent.total_marks}` : ''}` : 'Submitted'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-500 shrink-0">
                    <Clock size={11} /> Not yet
                  </span>
                )}

                <span className="text-xs text-gray-400 shrink-0 hidden sm:block w-28 text-right">
                  {submitted ? fmtDateTime(r[completedField]) : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
