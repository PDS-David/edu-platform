// client/src/pages/ExaminationsListPage.jsx
// Route: /student/examinations
// Lists every examination assigned to the logged-in student, grouped by
// computed_status (live / upcoming / completed) as returned by
// GET /students/examinations. This is the entry point into
// ExaminationPage.jsx — Phase 3 Part 1 built the backend for both list and
// detail, but no frontend page consumed either until now (confirmed via
// grep across client/src before writing this).

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import { Loader2, Clock, CheckCircle2, AlertCircle, PlayCircle, ArrowLeft } from 'lucide-react';

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }) {
  const map = {
    live:      { label: 'Live now',  cls: 'bg-red-100 text-red-700' },
    upcoming:  { label: 'Upcoming',  cls: 'bg-blue-100 text-blue-700' },
    completed: { label: 'Completed', cls: 'bg-gray-100 text-gray-600' },
  };
  const s = map[status] || map.upcoming;
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
}

function ExamCard({ exam, onOpen }) {
  const alreadySubmitted = !!exam.submitted_at;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <StatusBadge status={exam.computed_status} />
          {exam.subject_name && (
            <span className="text-xs text-gray-400">{exam.exam_board_name ? `${exam.exam_board_name} · ` : ''}{exam.subject_name}</span>
          )}
        </div>
        <p className="font-bold text-gray-900 truncate">{exam.title}</p>
        <p className="text-xs text-gray-500 mt-1">
          {formatWhen(exam.scheduled_start)} · {exam.duration_minutes} min · {exam.total_marks} mark{exam.total_marks !== 1 ? 's' : ''}
        </p>
        {alreadySubmitted && exam.score != null && (
          <p className="text-xs text-emerald-600 font-semibold mt-1">Scored {exam.score}/{exam.total_marks}</p>
        )}
      </div>

      {exam.computed_status === 'live' && !alreadySubmitted && (
        <button
          onClick={() => onOpen(exam)}
          className="shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          <PlayCircle size={16} /> {exam.started_at ? 'Continue' : 'Start'}
        </button>
      )}
      {exam.computed_status === 'live' && alreadySubmitted && (
        <span className="shrink-0 inline-flex items-center gap-1.5 text-emerald-600 text-sm font-semibold">
          <CheckCircle2 size={16} /> Submitted
        </span>
      )}
      {exam.computed_status === 'completed' && !alreadySubmitted && (
        <span className="shrink-0 inline-flex items-center gap-1.5 text-gray-400 text-sm">
          <AlertCircle size={16} /> Missed
        </span>
      )}
      {exam.computed_status === 'upcoming' && (
        <span className="shrink-0 inline-flex items-center gap-1.5 text-gray-400 text-sm">
          <Clock size={16} /> Not yet open
        </span>
      )}
    </div>
  );
}

export default function ExaminationsListPage() {
  const navigate = useNavigate();
  const [exams, setExams]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/students/examinations')
      .then(r => setExams(r?.data || []))
      .catch(err => setError(err?.message || 'Could not load examinations.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openExam = (exam) => navigate(`/student/examination/${exam.id}`);

  const live      = exams.filter(e => e.computed_status === 'live');
  const upcoming  = exams.filter(e => e.computed_status === 'upcoming');
  const completed = exams.filter(e => e.computed_status === 'completed');

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button
        onClick={() => navigate('/student/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
      >
        <ArrowLeft size={14} /> Dashboard
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Examinations</h1>
      <p className="text-sm text-gray-500 mb-6">
        Assigned by your teachers — unlike Mock Exam or Practice, these have a fixed date and time.
      </p>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="text-blue-500 animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && exams.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-gray-500 text-sm">No examinations have been assigned to you yet.</p>
        </div>
      )}

      {!loading && !error && exams.length > 0 && (
        <div className="space-y-8">
          {live.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Live now</h2>
              <div className="space-y-3">{live.map(e => <ExamCard key={e.id} exam={e} onOpen={openExam} />)}</div>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Upcoming</h2>
              <div className="space-y-3">{upcoming.map(e => <ExamCard key={e.id} exam={e} onOpen={openExam} />)}</div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Completed</h2>
              <div className="space-y-3">{completed.map(e => <ExamCard key={e.id} exam={e} onOpen={openExam} />)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
