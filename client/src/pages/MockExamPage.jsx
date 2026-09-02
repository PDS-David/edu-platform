// client/src/pages/MockExamPage.jsx
// Route: /student/mock/:subjectId
// 40-question timed mock exam (45 min). No AI feedback during exam.
// On submit → quiz-results page with isMock flag + predicted grade.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/apiClient';
import { ChevronLeft, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { UpgradeWall } from './PricingPage';

const LABELS     = ['01', '02', '03', '04', '05'];
const EXAM_DURATION = 45 * 60; // seconds

// ── Predicted grade from accuracy ────────────────────────────────────────────
function predictGrade(pct) {
  if (pct >= 90) return { grade: 'A*', color: 'text-blue-500',  bg: 'bg-blue-50'  };
  if (pct >= 80) return { grade: 'A',  color: 'text-green-600', bg: 'bg-green-50' };
  if (pct >= 70) return { grade: 'B',  color: 'text-blue-600',  bg: 'bg-blue-50'  };
  if (pct >= 60) return { grade: 'C',  color: 'text-amber-600', bg: 'bg-amber-50' };
  if (pct >= 50) return { grade: 'D',  color: 'text-orange-600',bg: 'bg-orange-50'};
  return              { grade: 'E',  color: 'text-red-600',   bg: 'bg-red-50'   };
}

// ── Timer display ─────────────────────────────────────────────────────────────
function Timer({ secondsLeft }) {
  const m   = Math.floor(secondsLeft / 60);
  const s   = secondsLeft % 60;
  const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const cls = secondsLeft <= 300
    ? 'bg-red-500 text-white'
    : secondsLeft <= 600
      ? 'bg-amber-500 text-white'
      : 'bg-[#0a4a3f] text-blue-300 border border-blue-700';
  return (
    <span className={`text-sm font-bold px-3 py-1.5 rounded-xl tabular-nums ${cls}`}>
      {str}
    </span>
  );
}

// ── MCQ card (exam mode — no result shown immediately) ────────────────────────
function ExamQuestion({ question, questionNumber, selected, onSelect }) {
  const diffBadge = { easy: 'bg-green-500', medium: 'bg-amber-500', hard: 'bg-red-500' };

  // GRADE-4 FIX: this component unconditionally rendered
  // `question.options?.map(...)` with no branching on question.type
  // anywhere in the file — the same blank-render bug as GRADE-3
  // (QuizPage.jsx), an independent implementation of the identical gap.
  // Mock Exam declares itself "MCQ only" (question_sub_type: 'mcq' in the
  // fetch below), but that param is currently a no-op server-side
  // (GRADE-6, documented separately, deliberately deferred) — so
  // structured/essay/short_answer questions can and do reach this page
  // right now, not just hypothetically once GRADE-6 is fixed. For any of
  // them, nothing rendered, onSelect never fired, and answers[q.id] stayed
  // undefined forever — that question submitted as selected_answer: null,
  // guaranteed zero marks with no way to have answered it.
  //
  // Unlike QuizPage.jsx's per-question immediate-submit design, this page
  // has no per-question result state at all (by design — "No AI feedback
  // during exam", see file header) and submits everything in one batch at
  // the end via POST /quizzes/attempt. That endpoint's structured-grading
  // branch already accepts selected_answer as a fallback when
  // essay_response is absent (`answer.essay_response ?? submittedAnswer`,
  // quizzes.js), and essay's still-deferred (GRADE-5) exact-match
  // fallthrough reads selected_answer too — so no submission-payload
  // change is needed here, only rendering. Reusing the existing
  // `selected`/`onSelect` string prop for typed text works identically to
  // how it already works for a clicked option's text.
  const qType         = question.type;
  const isEssay        = qType === 'essay';
  const isStructured   = qType === 'structured';
  const isFreeText     = isEssay || isStructured;
  const isShortAnswer  = qType === 'short_answer';
  const hasTextInput   = isFreeText || isShortAnswer;

  return (
    <div className="pb-20">
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4 flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded-full">
            Question {questionNumber}
          </span>
          {question.difficulty && (
            <span className={`text-xs text-white font-bold px-2.5 py-1 rounded-full ${diffBadge[question.difficulty] || 'bg-gray-400'}`}>
              {question.difficulty.toUpperCase()}
            </span>
          )}
          {question.marks && (
            <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-gray-800">
              {question.marks} Mark(s)
            </span>
          )}
          {isEssay && (
            <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-blue-500">Essay</span>
          )}
          {isStructured && (
            <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-blue-500">Structured</span>
          )}
          {isShortAnswer && (
            <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-teal-500">Short Answer</span>
          )}
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
                  key={opt.id}
                  onClick={() => onSelect(optText)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {LABELS[i]}
                  </span>
                  <span className="text-sm text-gray-800 flex-1">{opt.option_text}</span>
                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── GRADE-4 FIX: Short Answer — single-line <input>. Reuses the
            same `selected`/`onSelect` prop pair the MCQ options above use,
            since answers[q.id] is already a plain string in this page's
            design regardless of question type. ── */}
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

        {/* ── GRADE-4 FIX: Essay/Structured — <textarea>, same reuse of
            selected/onSelect as short_answer above. ── */}
        {isFreeText && (
          <div className="px-5 pb-5">
            <textarea
              value={selected || ''}
              onChange={e => onSelect(e.target.value)}
              rows={6}
              placeholder="Write your answer here…"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-blue-400 resize-y"
            />
            {question.marks && (
              <p className="text-xs text-gray-400 mt-1.5">{question.marks} mark{question.marks !== 1 ? 's' : ''} available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── In-app submit confirmation (replaces window.confirm) ──────────────────────
function SubmitConfirmModal({ onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-confirm-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="submit-confirm-title" className="text-base font-bold text-gray-900 mb-1.5">
          Submit your exam?
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          You cannot change your answers after this.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm py-2.5 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm py-2.5 transition-colors"
          >
            Submit Exam
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Submitting overlay ────────────────────────────────────────────────────────
function MarkingScreen() {
  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-5xl animate-bounce"></div>
      <p className="text-white text-xl font-bold">Marking your exam…</p>
      <p className="text-white/60 text-sm">The AI examiner is reviewing all 40 answers.</p>
      <Loader2 size={28} className="text-blue-400 animate-spin mt-2" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function MockExamPage() {
  const { subjectId } = useParams();
  const navigate      = useNavigate();
  const location      = useLocation();
  const { subjectName = 'Mock Exam', examBoardName = 'JAMB' } = location.state || {};

  const [questions,   setQuestions]   = useState([]);
  const [current,     setCurrent]     = useState(0);
  const [answers,     setAnswers]     = useState({}); // { [questionId]: optionText }
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [upgradeWall, setUpgradeWall] = useState(false);
  const [timeLeft,    setTimeLeft]    = useState(EXAM_DURATION);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const startTime = useRef(Date.now());
  const timerRef  = useRef(null);

  // ── Load questions ────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/questions/random', {
      params: { count: 40, board: examBoardName, subject_id: subjectId, question_sub_type: 'mcq' },
    })
      .then(r => setQuestions(r.data || []))
      .catch(err => {
        if (err.status === 403 && err?.message === 'free_limit_reached') {
          setUpgradeWall(true);
        }
      })
      .finally(() => setLoading(false));
  }, [subjectId, examBoardName]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || questions.length === 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleSubmit(true); // auto-submit
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, questions.length]); // eslint-disable-line

  const submitExam = useCallback(async () => {
    clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      // answers[q.id] stores option text (set by onSelect below)
      const answersArray = questions.map(q => ({
        question_id:     q.id,
        selected_answer: answers[q.id] || null,
        time_taken_seconds: Math.round((Date.now() - startTime.current) / 1000 / questions.length),
      }));

      const res = await api.post('/quizzes/attempt', {
          subtopic_id:   null,
          subject_id:    subjectId,
          paper_type:    'mock',
          total_time_ms: Date.now() - startTime.current,
          answers:       answersArray,
        });

      // S3 fix: use real attempt_id so refresh/share works via the GET endpoint
      const attemptId = res?.data?.attempt_id ?? res?.attempt_id ?? 'inline';
      // BUG FIX (results-showing-0-of-0): inlineResult must be res.data, not
      // res — res is the interceptor's normalised wrapper; the actual result
      // fields (total_score, answers, etc.) live one level deeper at res.data.
      // Passing res directly meant QuizResultsPage's inlineResult branch read
      // every field as undefined and fell through to its zero/empty defaults —
      // a real, correctly-graded 40-question mock rendering as "0 of 0".
      // Same bug, same fix, as QuizPage.jsx's submit handler.
      navigate(`/student/quiz-results/${attemptId}`, {
        state: { subjectId, subjectName, examBoardName, isMock: true, inlineResult: res.data },
      });
    } catch (err) {
      console.error('[MockExam] submit error:', err.message);
      alert('Failed to submit. Please try again.');
      setSubmitting(false);
    }
  }, [questions, answers, subjectId, subjectName, examBoardName, navigate]);

  // Manual submit opens the in-app confirmation modal (see SubmitConfirmModal
  // below) instead of the browser's native window.confirm — a plain OS dialog
  // stamped with the site's URL looked like a leftover debug prompt, not part
  // of the app. Auto-submit (timer hits zero) skips confirmation entirely,
  // same as before.
  const handleSubmit = useCallback((autoSubmit = false) => {
    if (autoSubmit) {
      submitExam();
    } else {
      setShowSubmitConfirm(true);
    }
  }, [submitExam]);

  if (submitting) return <MarkingScreen />;

  if (upgradeWall) return (
    <div className="min-h-screen bg-[#0a4a3f]">
      <UpgradeWall onRevise={() => navigate(-1)} />
    </div>
  );

  if (loading) return (
    <div className="min-h-screen bg-[#0a4a3f] flex items-center justify-center">
      <Loader2 size={32} className="text-blue-400 animate-spin" />
    </div>
  );

  if (questions.length === 0) return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-white font-semibold">No questions available for this mock exam.</p>
      <button onClick={() => navigate(-1)} className="text-blue-400 text-sm font-medium">Go back</button>
    </div>
  );

  const q          = questions[current];
  const answeredAll = Object.keys(answers).length;
  const pctDone    = Math.round((answeredAll / questions.length) * 100);

  return (
    <div className="min-h-screen bg-[#0a4a3f]">
      {/* Back to dashboard */}
      <div className="px-4 pt-3 pb-1">
        <button onClick={() => navigate('/student/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors">
          <ArrowLeft size={13} /> Dashboard
        </button>
      </div>

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#0a4a3f] border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
            <ChevronLeft size={16} /> Exit
          </button>

          <div className="flex items-center gap-3">
            {/* Assigned by banner */}
            <span className="text-white/60 text-xs hidden sm:inline">{examBoardName} {subjectName} Mock</span>
            <Timer secondsLeft={timeLeft} />
          </div>

          <span className="text-white/50 text-sm">{current + 1}/{questions.length}</span>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div className="h-full bg-blue-400 transition-all duration-300"
            style={{ width: `${((current) / questions.length) * 100}%` }} />
        </div>
      </div>

      {/* Answered progress row */}
      <div className="max-w-3xl mx-auto px-4 pt-3">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span>{answeredAll}/{questions.length} answered</span>
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white/40 rounded-full transition-all" style={{ width: `${pctDone}%` }} />
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <ExamQuestion
          key={q.id}
          question={q}
          questionNumber={current + 1}
          selected={answers[q.id] || null}
          onSelect={(optId) => setAnswers(prev => ({ ...prev, [q.id]: optId }))}
        />
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a4a3f] border-t border-white/10 px-4 py-3 z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
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
                onClick={() => handleSubmit(false)}
                disabled={answeredAll === 0}
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                Submit Exam
              </button>
            )}
          </div>
        </div>
      </div>

      {showSubmitConfirm && (
        <SubmitConfirmModal
          onCancel={() => setShowSubmitConfirm(false)}
          onConfirm={() => { setShowSubmitConfirm(false); submitExam(); }}
        />
      )}
    </div>
  );
}

export { predictGrade };
