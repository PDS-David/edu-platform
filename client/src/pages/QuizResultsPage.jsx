// client/src/pages/QuizResultsPage.jsx
// URL: /student/quiz-results/:attemptId
// Calls GET /api/quizzes/attempt/:attemptId on mount.
// Shows: score ring, examiner recommendation, benchmark row,
//        per-question accordion with AI marking scheme.
// When router state isMock=true: also shows predicted grade badge.

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../services/api';
import {
  ChevronDown, ChevronUp, CheckCircle, XCircle,
  Loader2, RotateCcw, ArrowLeft, Trophy, Clock, Target,
} from 'lucide-react';
import { predictGrade } from './MockExamPage';



// ── Score donut ring ──────────────────────────────────────────────────────────
function ScoreRing({ pct, score, max }) {
  const r     = 54;
  const circ  = 2 * Math.PI * r;
  const fill  = circ * (pct / 100);
  const color = pct >= 70 ? '#2dd4bf' : pct >= 40 ? '#f59e0b' : '#f87171';

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r}
          fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white text-2xl font-black">{pct}%</span>
        <span className="text-white/50 text-xs">{score}/{max}</span>
      </div>
    </div>
  );
}

// ── Per-question accordion ─────────────────────────────────────────────────
function QuestionAccordion({ answer, index }) {
  const [open, setOpen] = useState(false);
  const ms = answer.ai_marking_scheme || {};

  const statusColor = {
    correct:        'bg-green-500',
    partial:        'bg-amber-500',
    incorrect:      'bg-red-500',
    'needs-review': 'bg-purple-500',
  }[ms.status] || 'bg-gray-500';

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">

      {/* Always-visible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {answer.is_correct
          ? <CheckCircle size={16} className="text-teal-400 shrink-0" />
          : <XCircle    size={16} className="text-red-400  shrink-0" />}
        <span className="text-white/40 text-xs font-medium shrink-0">Q{index + 1}</span>
        <span className="text-white/80 text-sm flex-1 truncate">{answer.question_text}</span>
        <span className="text-white/40 text-xs shrink-0">
          {answer.marks_awarded ?? 0}/{answer.max_marks ?? 1}
        </span>
        {open
          ? <ChevronUp   size={14} className="text-white/40 shrink-0" />
          : <ChevronDown size={14} className="text-white/40 shrink-0" />}
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-4 pb-4 border-t border-white/10 pt-3 space-y-3">

          {/* Your answer vs correct */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-xs mb-1">Your answer</p>
              <p className="text-white/80 text-sm">{answer.selected_option_text || '—'}</p>
            </div>
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3">
              <p className="text-teal-400/70 text-xs mb-1">Correct answer</p>
              <p className="text-teal-300 text-sm">
                {answer.correct_options?.map(o => o.option_text).join(', ') || '—'}
              </p>
            </div>
          </div>

          {/* AI marking scheme */}
          {Object.keys(ms).length > 0 && (
            <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-3 space-y-2.5">
              {ms.status && (
                <span className={`inline-block text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${statusColor}`}>
                  {ms.status}
                </span>
              )}
              {ms.whyExplanation && (
                <p className="text-blue-200 text-xs leading-relaxed">{ms.whyExplanation}</p>
              )}
              {ms.stepByStep?.length > 0 && (
                <div>
                  <p className="text-blue-300/70 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Step by step</p>
                  <ol className="space-y-1">
                    {ms.stepByStep.map((step, i) => (
                      <li key={i} className="flex gap-2 text-xs text-blue-200">
                        <span className="text-blue-400/60 shrink-0 font-medium">{i + 1}.</span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {ms.examinersRequirement && (
                <div>
                  <p className="text-blue-300/70 text-[10px] font-semibold uppercase tracking-wide mb-1">Examiner's requirement</p>
                  <p className="text-blue-200 text-xs leading-relaxed">{ms.examinersRequirement}</p>
                </div>
              )}
              {ms.modelAnswer && (
                <div className="bg-white/5 rounded-lg p-2.5">
                  <p className="text-blue-300/70 text-[10px] font-semibold uppercase tracking-wide mb-1">Model answer</p>
                  <p className="text-white/70 text-xs leading-relaxed">{ms.modelAnswer}</p>
                </div>
              )}
            </div>
          )}

          {/* Fallback plain explanation */}
          {!Object.keys(ms).length && answer.ai_explanation && (
            <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-3">
              <p className="text-blue-200 text-xs leading-relaxed">{answer.ai_explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function QuizResultsPage() {
  const { attemptId } = useParams();
  const navigate      = useNavigate();
  const location      = useLocation();

  const {
    subtopicId, subtopicName = '', subjectName = '',
    examBoardName = '', isMock = false,
  } = location.state || {};

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!attemptId) return;
    api.get(`/quizzes/attempt/${attemptId}`)
      .then(r  => setData(r.data))
      .catch(() => setError('Could not load results. Please try again.'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4">
      <Loader2 size={32} className="text-teal-400 animate-spin" />
      <p className="text-white/60 text-sm">Loading your results…</p>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl"></div>
      <p className="text-white font-semibold">{error || 'No results found.'}</p>
      <button onClick={() => navigate(-1)}
        className="mt-2 text-teal-400 hover:text-teal-300 text-sm font-medium flex items-center gap-1">
        <ArrowLeft size={14} /> Go back
      </button>
    </div>
  );

  const { attempt, benchmark, examiner_recommendation, answers = [] } = data;
  const pct      = Math.round(attempt?.accuracy_pct ?? 0);
  const score    = attempt?.total_score ?? 0;
  const max      = attempt?.max_score   ?? answers.length;
  const correct  = answers.filter(a => a.is_correct).length;
  const timeSecs = Math.round((attempt?.total_time_ms ?? 0) / 1000);
  const fmtTime  = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;

  const backSubtopicId = subtopicId || attempt?.subtopic_id;

  // Predicted grade (mock only)
  const grade = isMock ? predictGrade(pct) : null;

  return (
    <div className="min-h-screen bg-[#0a4a3f]">

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#0a4a3f] border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => backSubtopicId
              ? navigate(`/student/subtopic/${backSubtopicId}?tab=quiz`)
              : navigate(-1)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <p className="text-white/70 text-sm font-medium flex-1 truncate">
            {attempt?.subtopic_name || subtopicName || 'Results'}
            {isMock && <span className="ml-2 text-xs text-amber-400 font-semibold">Mock Exam</span>}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Score ring + headline */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center gap-4">
          <ScoreRing pct={pct} score={score} max={max} />

          {/* Predicted grade badge — mock only */}
          {grade && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${grade.bg}`}>
              <span className={`text-2xl font-black ${grade.color}`}>{grade.grade}</span>
              <span className={`text-xs font-semibold ${grade.color}`}>Predicted Grade</span>
            </div>
          )}

          <p className="text-white text-base font-bold">
            {correct} of {answers.length} Questions Correct
          </p>

          {/* Stat pills */}
          <div className="flex flex-wrap justify-center gap-3">
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
              <Trophy size={13} className="text-teal-400" />
              <span className="text-white/80 text-xs font-medium">Score: {score}/{max}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
              <Clock size={13} className="text-purple-400" />
              <span className="text-white/80 text-xs font-medium">Time: {fmtTime(timeSecs)}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
              <Target size={13} className="text-pink-400" />
              <span className="text-white/80 text-xs font-medium">Accuracy: {pct}%</span>
            </div>
          </div>

          {/* Mock exam conditions report */}
          {isMock && (
            <div className="w-full bg-white/5 rounded-2xl p-4 text-xs space-y-1.5">
              <p className="text-white/50 font-semibold uppercase tracking-wide text-[10px] mb-2">Exam conditions report</p>
              <div className="flex justify-between text-white/70">
                <span>Time used</span>
                <span className="font-semibold">{fmtTime(timeSecs)} / 45m 00s</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Questions answered</span>
                <span className="font-semibold">{answers.filter(a => a.selected_option_text).length} / {answers.length}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Correct answers</span>
                <span className="font-semibold text-teal-300">{correct}</span>
              </div>
            </div>
          )}
        </div>

        {/* Examiner recommendation */}
        {examiner_recommendation && (
          <div className="bg-teal-900/30 border border-teal-500/20 rounded-2xl p-4">
            <p className="text-teal-400 text-xs font-semibold uppercase tracking-wide mb-2">
              Examiner's Recommendation
            </p>
            <p className="text-white/80 text-sm leading-relaxed">{examiner_recommendation}</p>
          </div>
        )}

        {/* Benchmark */}
        {benchmark && (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
            <span className="text-white/60 text-xs">
              Your score: <span className="text-white font-semibold">{pct}%</span>
            </span>
            {benchmark.avg_score !== undefined && (
              <span className="text-white/60 text-xs">
                Class average: <span className="text-white font-semibold">{Math.round(benchmark.avg_score)}%</span>
              </span>
            )}
            {benchmark.avg_time_seconds !== undefined && (
              <span className="text-white/60 text-xs">
                Avg time: <span className="text-white font-semibold">{fmtTime(Math.round(benchmark.avg_time_seconds))}</span>
              </span>
            )}
          </div>
        )}

        {/* Question breakdown */}
        <div>
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wide mb-3 px-1">
            Question breakdown
          </p>
          <div className="space-y-2">
            {answers.map((ans, i) => (
              <QuestionAccordion key={i} answer={ans} index={i} />
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pb-8">
          {backSubtopicId && (
            <Link
              to={`/student/subtopic/${backSubtopicId}?tab=practice`}
              className="flex-1 flex items-center justify-center gap-2 border border-white/20 hover:bg-white/5 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              <ArrowLeft size={14} /> Back to Subtopic
            </Link>
          )}
          {backSubtopicId && (
            <button
              onClick={() => navigate(
                isMock
                  ? `/student/mock/${attempt?.subject_id || ''}`
                  : `/student/quiz/${backSubtopicId}`,
                { state: { subtopicName, subjectName, examBoardName } }
              )}
              className="flex-1 flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              <RotateCcw size={14} /> Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
