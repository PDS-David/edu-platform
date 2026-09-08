// client/src/pages/ExaminationPage.jsx
// Route: /student/examination/:id
// Fetches GET /students/examination/:id, renders questions by type
// (mcq/true_false/short_answer/essay/structured), holds answers in state,
// shows a countdown against the exam's actual scheduled window (not a
// fixed local timer — refresh-resilient, computed from wall-clock
// scheduled_start + duration_minutes every time), and submits via
// POST /students/examination/:id/submit.
//
// Question-type rendering and the Timer component are adapted from
// MockExamPage.jsx's ExamQuestion — same visual conventions, but this
// page's countdown is driven by the exam's real end-of-window timestamp
// rather than a fixed 45-minute local counter, since an Examination's
// duration is teacher/admin-set and the window is shared wall-clock time,
// not a per-session clock that starts when this component happens to mount.
//
// marking_guide is never present anywhere in this page's data at all —
// GET /students/examination/:id's backend response deliberately excludes
// it via an explicit column list (see that route's own comment), so there
// is nothing to guard against here beyond simply never referencing a
// field that was never sent.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import { ChevronLeft, Loader2, ArrowLeft, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const LABELS = ['01', '02', '03', '04', '05', '06'];

// ── Countdown, driven by an absolute end-of-window timestamp ────────────────
function Timer({ secondsLeft }) {
  const clamped = Math.max(0, secondsLeft);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const str = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const cls = clamped <= 300
    ? 'bg-red-500 text-white'
    : clamped <= 600
      ? 'bg-amber-500 text-white'
      : 'bg-[#0a4a3f] text-blue-300 border border-blue-700';
  return (
    <span className={`text-sm font-bold px-3 py-1.5 rounded-xl tabular-nums ${cls}`}>
      {str}
    </span>
  );
}

// ── Question card, rendered by type ──────────────────────────────────────────
function ExamQuestion({ question, questionNumber, selected, onSelect }) {
  const diffBadge = { easy: 'bg-green-500', medium: 'bg-amber-500', hard: 'bg-red-500' };
  const qType        = question.type;
  const isEssay       = qType === 'essay';
  const isStructured  = qType === 'structured';
  const isFreeText    = isEssay || isStructured;
  const isShortAnswer = qType === 'short_answer';
  const hasTextInput  = isFreeText || isShortAnswer;

  return (
    <div className="pb-20">
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded-full">
            Question {questionNumber}
          </span>
          {question.difficulty && (
            <span className={`text-xs text-white font-bold px-2.5 py-1 rounded-full ${diffBadge[question.difficulty] || 'bg-gray-400'}`}>
              {question.difficulty.toUpperCase()}
            </span>
          )}
          {question.marks_allocated != null && (
            <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-gray-800">
              {question.marks_allocated} Mark{question.marks_allocated !== 1 ? 's' : ''}
            </span>
          )}
          {isEssay && <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-blue-500">Essay</span>}
          {isStructured && <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-blue-500">Structured</span>}
          {isShortAnswer && <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-teal-500">Short Answer</span>}
        </div>

        <div className="px-5 py-4">
          <p className="text-gray-900 text-sm leading-relaxed">{question.question_text}</p>
        </div>

        {!hasTextInput && (
          <div className="px-5 pb-5 space-y-2">
            {question.options?.map((opt, i) => {
              const optText = opt.option_text || opt.text || String(opt.id ?? '');
              const isSelected = selected === optText;
              return (
                <button
                  key={opt.id ?? i}
                  onClick={() => onSelect(optText)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {LABELS[i] || i + 1}
                  </span>
                  <span className="text-sm text-gray-800 flex-1">{optText}</span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}

        {isShortAnswer && (
          <div className="px-5 pb-5">
            <input
              type="text"
              value={selected || ''}
              onChange={e => onSelect(e.target.value)}
              placeholder="Type your answer here…"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-blue-400 transition-all"
            />
          </div>
        )}

        {isFreeText && (
          <div className="px-5 pb-5">
            <textarea
              value={selected || ''}
              onChange={e => onSelect(e.target.value)}
              rows={6}
              placeholder="Write your answer here…"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-blue-400 resize-y"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── In-app submit confirmation ────────────────────────────────────────────
function SubmitConfirmModal({ unanswered, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/60" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="font-bold text-gray-900 mb-2">Submit examination?</h3>
        <p className="text-sm text-gray-600 mb-1">This cannot be undone.</p>
        {unanswered > 0 && (
          <p className="text-sm text-amber-600 mb-4">{unanswered} question{unanswered !== 1 ? 's are' : ' is'} still unanswered.</p>
        )}
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Keep working
          </button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Results, shown inline after submission — there is no dedicated exam
// results route, so this renders directly from the submit response
// (total_score, max_score, accuracy_pct, per-question feedback). ─────────────
function ResultsView({ result, examTitle, onDone }) {
  const pct = result.accuracy_pct ?? 0;
  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {result.already_submitted ? 'Already submitted' : 'Examination submitted'}
        </h1>
        <p className="text-sm text-gray-500 mb-6">{examTitle}</p>

        <div className="flex items-center gap-6 mb-6">
          <div className="text-center">
            <p className="text-3xl font-extrabold text-gray-900">{result.total_score}/{result.max_score}</p>
            <p className="text-xs text-gray-500">Score</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-extrabold text-blue-600">{pct}%</p>
            <p className="text-xs text-gray-500">Accuracy</p>
          </div>
        </div>

        {Array.isArray(result.answers) && result.answers.length > 0 && (
          <div className="space-y-2 mb-6">
            {result.answers.map((a, i) => (
              <div key={a.question_id ?? i} className="flex items-start gap-2 text-sm border-b border-gray-100 pb-2">
                {a.is_correct
                  ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  : <AlertCircle size={16} className="text-gray-300 shrink-0 mt-0.5" />}
                <div>
                  <p className="text-gray-700">Question {i + 1} — {a.marks_awarded}/{a.max_marks} mark{a.max_marks !== 1 ? 's' : ''}</p>
                  {a.feedback && <p className="text-xs text-gray-400 mt-0.5">{a.feedback}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {result.already_submitted && (!result.answers || result.answers.length === 0) && (
          <p className="text-xs text-gray-400 mb-6">
            Per-question breakdown is only available right after submitting — only your final score is kept afterward.
          </p>
        )}

        <button onClick={onDone} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm">
          Back to Examinations
        </button>
      </div>
    </div>
  );
}

export default function ExaminationPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(null); // { message, computed_status }
  const [exam, setExam]         = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers]   = useState({});
  const [current, setCurrent]   = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting]   = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [result, setResult]     = useState(null);

  const timerRef   = useRef(null);
  const startTime  = useRef(Date.now());
  const endTimeRef = useRef(null); // absolute ms — computed once from server data, not re-derived from a local counter

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    // GET /students/examination/:id itself has no submitted_at in its
    // response shape (by design — it only tracks the live time window,
    // not submission state) — checked directly against its own current
    // code before relying on this. Without this extra check, a student
    // navigating back to this page after already submitting (browser
    // back button, stale tab) would see the full question-answering UI
    // again, only failing on the actual submit click with a 409 — a
    // confusing "looks open, isn't" state. Cheap enough to always do:
    // GET /students/examinations is a lightweight list query.
    api.get('/students/examinations')
      .then(r => {
        const listEntry = (r?.data || []).find(e => e.id === id);
        if (listEntry?.submitted_at) {
          setResult({
            total_score: listEntry.score ?? 0,
            max_score: listEntry.total_marks ?? 0,
            accuracy_pct: listEntry.total_marks ? Math.round(((listEntry.score ?? 0) / listEntry.total_marks) * 100) : 0,
            answers: [],
            already_submitted: true,
          });
          setExam(listEntry);
          setLoading(false);
          return null; // signal: don't proceed to the detail fetch below
        }
        return api.get(`/students/examination/${id}`);
      })
      .then(r => {
        if (!r) return; // already handled above
        const data = r?.data || r;
        setExam(data);
        setQuestions(data.questions || []);
        const end = new Date(data.scheduled_start).getTime() + data.duration_minutes * 60 * 1000;
        endTimeRef.current = end;
        setSecondsLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
        startTime.current = Date.now();
        setLoading(false);
      })
      .catch(err => {
        // Backend returns 403 with computed_status for upcoming/completed/
        // not-assigned — surface that message directly rather than a
        // generic error, so a student sees "hasn't started yet" or
        // "has ended" instead of a raw failure.
        setLoadError({
          message: err?.message || 'Could not load this examination.',
          computed_status: err?.raw?.response?.data?.computed_status || null,
        });
        setLoading(false);
      });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Countdown ticks off the real end-of-window timestamp, not a fixed
  // local duration — a refresh mid-exam re-fetches and recomputes this
  // from scheduled_start + duration_minutes again, so remaining time is
  // always correct regardless of when the tab was opened.
  useEffect(() => {
    if (loading || loadError || !endTimeRef.current) return;
    timerRef.current = setInterval(() => {
      const remaining = Math.round((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setSecondsLeft(0);
        submitExam(true);
        return;
      }
      setSecondsLeft(remaining);
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError]);

  // Warn on tab close/refresh while genuinely mid-exam — not a hard block
  // (can't be, browsers don't allow that), just the standard confirmation
  // prompt, matching ordinary exam-integrity expectations.
  useEffect(() => {
    if (loading || loadError || result) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [loading, loadError, result]);

  const submitExam = useCallback(async (autoSubmit = false) => {
    if (submitting || result) return;
    clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const answersArray = questions.map(q => ({
        question_id:     q.id,
        selected_answer: answers[q.id] ?? null,
        time_taken_ms:   Math.round((Date.now() - startTime.current) / questions.length),
      }));
      const res = await api.post(`/students/examination/${id}/submit`, {
        answers:       answersArray,
        total_time_ms: Date.now() - startTime.current,
      });
      setResult(res?.data || res);
    } catch (err) {
      console.error('[ExaminationPage] submit error:', err.message);
      if (err?.raw?.response?.status === 409) {
        // Already submitted — a genuine race (double-click, another tab),
        // since load() above already checks for this before showing the
        // question UI at all. Fetch the real score rather than showing a
        // hardcoded 0.
        try {
          const listRes = await api.get('/students/examinations');
          const listEntry = (listRes?.data || []).find(e => e.id === id);
          setResult({
            total_score: listEntry?.score ?? 0,
            max_score: listEntry?.total_marks ?? exam?.total_marks ?? 0,
            accuracy_pct: listEntry?.total_marks ? Math.round(((listEntry.score ?? 0) / listEntry.total_marks) * 100) : 0,
            answers: [],
            already_submitted: true,
          });
        } catch {
          setResult({ total_score: 0, max_score: exam?.total_marks || 0, accuracy_pct: 0, answers: [], already_submitted: true });
        }
      } else {
        alert(err?.message || 'Failed to submit. Please try again.');
        setSubmitting(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, id, submitting, result]);

  const handleSubmitClick = () => setShowSubmitConfirm(true);

  // ── Render states ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a4a3f] flex items-center justify-center">
        <Loader2 size={32} className="text-blue-400 animate-spin" />
      </div>
    );
  }

  if (loadError) {
    const map = {
      upcoming:  "This examination hasn't started yet.",
      completed: 'This examination has ended.',
    };
    return (
      <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Clock size={32} className="text-white/40" />
        <p className="text-white font-semibold">{map[loadError.computed_status] || loadError.message}</p>
        <p className="text-white/50 text-sm">{loadError.message}</p>
        <button
          onClick={() => navigate('/student/examinations')}
          className="inline-flex items-center gap-1.5 text-blue-400 text-sm font-medium hover:text-blue-300"
        >
          <ArrowLeft size={14} /> Back to Examinations
        </button>
      </div>
    );
  }

  if (result) {
    return <ResultsView result={result} examTitle={exam?.title} onDone={() => navigate('/student/examinations')} />;
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4">
        <Loader2 size={32} className="text-blue-400 animate-spin" />
        <p className="text-white/70 text-sm">Submitting your examination…</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white font-semibold">No questions found in this examination.</p>
        <button onClick={() => navigate('/student/examinations')} className="text-blue-400 text-sm font-medium">Go back</button>
      </div>
    );
  }

  const q           = questions[current];
  const answeredAll = Object.values(answers).filter(v => v != null && v !== '').length;
  const unanswered  = questions.length - answeredAll;

  return (
    <div className="min-h-screen bg-[#0a4a3f]">
      <div className="px-4 pt-3 pb-1">
        <span className="inline-flex items-center gap-1.5 text-sm text-white/60">
          <ChevronLeft size={13} /> {exam?.title}
        </span>
      </div>

      <div className="sticky top-0 z-40 bg-[#0a4a3f] border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-white/60 text-xs hidden sm:inline">Examination — no leaving this page once started</span>
          <div className="flex items-center gap-3 ml-auto">
            <Timer secondsLeft={secondsLeft} />
          </div>
          <span className="text-white/50 text-sm ml-3">{current + 1}/{questions.length}</span>
        </div>
        <div className="h-1 bg-white/10">
          <div className="h-full bg-blue-400 transition-all duration-300" style={{ width: `${(current / questions.length) * 100}%` }} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-3">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span>{answeredAll}/{questions.length} answered</span>
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white/40 rounded-full transition-all" style={{ width: `${(answeredAll / questions.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        <ExamQuestion
          key={q.id}
          question={q}
          questionNumber={current + 1}
          selected={answers[q.id] ?? null}
          onSelect={(val) => setAnswers(prev => ({ ...prev, [q.id]: val }))}
        />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#0a4a3f] border-t border-white/10 px-4 py-3 z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {current > 0 && (
              <button
                onClick={() => setCurrent(c => c - 1)}
                className="text-white/60 hover:text-white text-sm font-medium px-3 py-2"
              >
                Back
              </button>
            )}
          </div>
          <span className="text-white/50 text-sm">{current + 1} of {questions.length}</span>
          <div className="flex items-center gap-2">
            {current + 1 < questions.length ? (
              <button
                onClick={() => setCurrent(c => c + 1)}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmitClick}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                Submit Exam
              </button>
            )}
          </div>
        </div>
      </div>

      {showSubmitConfirm && (
        <SubmitConfirmModal
          unanswered={unanswered}
          onCancel={() => setShowSubmitConfirm(false)}
          onConfirm={() => { setShowSubmitConfirm(false); submitExam(false); }}
        />
      )}
    </div>
  );
}
