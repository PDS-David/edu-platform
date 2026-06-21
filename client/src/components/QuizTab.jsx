// client/src/components/QuizTab.jsx
// Renders inside SubtopicPage when activeTab === 'quiz'
// Three phases: setup → in-progress → results

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import {
  ArrowLeft, Pencil, Clock, ChevronLeft, ChevronRight,
  X, Flag, Upload, Sigma, Lightbulb, Sparkles,
  Trophy, Target, ThumbsUp, RotateCcw, CheckCircle2,
  ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';



// ─── helpers ──────────────────────────────────────────────────────────────────
const formatTime = (secs) => {
  if (secs <= 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const DiffBadge = ({ level }) => {
  const map = { EASY: 'bg-green-500', MEDIUM: 'bg-amber-500', HARD: 'bg-red-500' };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${map[(level || '').toUpperCase()] || 'bg-gray-500'}`}>
      {(level || '').toUpperCase()}
    </span>
  );
};

// Bold **text** markdown → <strong>
const BoldMarkdown = ({ text = '' }) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
      )}
    </span>
  );
};

const TILE_COLOURS = [
  'bg-pink-400','bg-amber-400','bg-blue-400','bg-purple-400',
  'bg-blue-400','bg-green-400','bg-orange-400','bg-rose-400',
];

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function QuizTab({ subtopicId, subtopic, onQuizComplete }) {
  const [phase, setPhase]           = useState('setup');   // setup | inprogress | results
  const [attemptId, setAttemptId]   = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [selectedPaper, setSelectedPaper] = useState('all');
  const [attemptCount, setAttemptCount]   = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    api.get(`/quizzes/attempt-count?subtopic_id=${subtopicId}`)
      .then(r => setAttemptCount(r.count || 0))
      .catch(() => {});
  }, [subtopicId]);

  if (phase === 'setup') return (
    <SetupScreen
      subtopic={subtopic}
      subtopicId={subtopicId}
      attemptCount={attemptCount}
      selectedPaper={selectedPaper}
      setSelectedPaper={setSelectedPaper}
      onStart={() => setPhase('inprogress')}
      navigate={navigate}
    />
  );

  if (phase === 'inprogress') return (
    <InProgressScreen
      subtopicId={subtopicId}
      subtopic={subtopic}
      selectedPaper={selectedPaper}
      onFinish={(id, error) => { setAttemptId(id); setSubmitError(error || null); setPhase('results'); }}
      navigate={navigate}
    />
  );

  return (
    <ResultsScreen
      subtopicId={subtopicId}
      subtopic={subtopic}
      attemptId={attemptId}
      submitError={submitError}
      onRevise={() => navigate(`/student/subtopic/${subtopicId}?tab=practice`)}
      onQuizComplete={onQuizComplete}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — SETUP
// ══════════════════════════════════════════════════════════════════════════════
function SetupScreen({ subtopic, subtopicId, attemptCount, selectedPaper, setSelectedPaper, onStart, navigate }) {
  const [expanded, setExpanded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [noQuestions, setNoQuestions] = useState(false);

  const handleStart = async () => {
    setChecking(true);
    setNoQuestions(false);
    try {
      // FIX: was dynamic import('../services/apiClient').then(m => m.default.get(...))
      // Dynamic import bypasses the axios interceptor that attaches the Bearer token → 401.
      // Use the static 'api' instance already imported at the top of this file instead.
      const r = await api.get(`/questions/random?subtopic_id=${subtopicId}&count=1`);
      const qs = r.data || [];
      if (!Array.isArray(qs) || qs.length === 0) {
        setNoQuestions(true);
        setChecking(false);
        return;
      }
    } catch {
      // If check fails, proceed anyway — server will return empty and InProgress will handle it
    }
    setChecking(false);
    onStart();
  };

  const curName  = subtopic?.curriculum_name || '';
  const subjName = subtopic?.subject_name    || '';
  const stName   = subtopic?.name            || 'this subtopic';
  const letters  = 'QUIZTIME'.split('');

  const papers = [
    { key: 'all',        label: 'All' },
    { key: 'paper1',     label: 'Paper 1' },
    { key: 'structured', label: 'Structured Questions' },
  ];

  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2 border border-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
          <Pencil size={12} />
          Total Attempts: {attemptCount}+
        </div>
      </div>

      {/* Centre content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-lg mx-auto w-full">

        {/* QUIZTIME tiles */}
        <div className="grid grid-cols-4 gap-2 mb-8">
          {letters.map((l, i) => (
            <div
              key={i}
              className={`w-14 h-14 rounded-xl ${TILE_COLOURS[i]} flex items-center justify-center
                text-white text-2xl font-black shadow-lg`}
            >
              {l}
            </div>
          ))}
        </div>

        <h2 className="text-white text-xl font-bold mb-3">About This Quiz</h2>

        <p className="text-white/80 text-sm text-center leading-relaxed mb-2">
          Get ready for your {curName} {subjName} quiz on <span className="font-semibold text-white">{stName}</span>.
        </p>

        <p className="text-white/70 text-sm text-center leading-relaxed mb-1">
          This quiz will test your understanding of {stName} through a series of carefully crafted questions
          designed to challenge and reinforce your knowledge.{' '}
          {!expanded && (
            <button onClick={() => setExpanded(true)} className="text-blue-300 underline text-xs">more</button>
          )}
        </p>
        {expanded && (
          <p className="text-white/60 text-xs text-center leading-relaxed mb-2">
            Each question is mapped to the official curriculum and comes with AI-powered marking guidance.
            Take your time, read carefully, and do your best!
          </p>
        )}

        {/* Info pills */}
        <div className="flex gap-3 my-4 flex-wrap justify-center">
          {['10 Questions', 'Mixed Difficulty Level'].map(t => (
            <span key={t} className="border border-white/40 text-white/90 text-xs font-medium px-4 py-1.5 rounded-full">
              {t}
            </span>
          ))}
        </div>

        {/* Paper selector */}
        <p className="text-white text-sm font-semibold mb-2">Select a paper:</p>
        <div className="flex gap-2 mb-6 flex-wrap justify-center">
          {papers.map(p => (
            <button
              key={p.key}
              onClick={() => setSelectedPaper(p.key)}
              className={`text-sm font-semibold px-4 py-2 rounded-full border transition-colors ${
                selectedPaper === p.key
                  ? 'bg-white text-gray-900 border-white'
                  : 'bg-transparent border-white/40 text-white hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Start button */}
        {noQuestions && (
          <div className="w-full bg-red-500/20 border border-red-400/40 text-red-300 text-sm text-center px-4 py-3 rounded-xl mb-3">
            No questions are available for this subtopic yet. Ask your teacher to add questions.
          </div>
        )}
        <button
          onClick={handleStart}
          disabled={checking}
          className="w-full bg-white hover:bg-white/90 text-gray-900 font-bold text-base py-3.5 rounded-xl shadow-lg transition-colors mb-3 disabled:opacity-60"
        >
          {checking ? 'Checking...' : 'Start a Quiz'}
        </button>

        <button
          onClick={() => navigate(`/student/subtopic/${subtopic?.id || ''}/quiz-history`)}
          className="text-blue-300 text-sm hover:underline"
        >
          Quiz History
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — IN PROGRESS
// ══════════════════════════════════════════════════════════════════════════════
function InProgressScreen({ subtopicId, subtopic, selectedPaper, onFinish, navigate, onNoQuestions }) {
  const [questions,  setQuestions]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [current,    setCurrent]    = useState(0);
  const [flagged,    setFlagged]    = useState(new Set());
  const [hintOpen,   setHintOpen]   = useState(false);
  const [hintHover,  setHintHover]  = useState(false);
  const [confirmOpen,setConfirmOpen]= useState(false);

  // Timer — useRef so never causes question re-render
  const TOTAL_SECS = 30 * 60;
  const remainingRef = useRef(TOTAL_SECS);
  const [displayTime, setDisplayTime] = useState(formatTime(TOTAL_SECS));
  const [timerWarn,   setTimerWarn]   = useState(false);

  // Answers stored in ref — no re-render on answer change
  const answersRef = useRef({});

  // Textarea answers need state (controlled inputs)
  const [openAnswers, setOpenAnswers] = useState({});

  const handleAutoSubmit = useCallback(() => submitQuiz(true), []);

  useEffect(() => {
    const interval = setInterval(() => {
      remainingRef.current -= 1;
      setDisplayTime(formatTime(remainingRef.current));
      if (remainingRef.current <= 300) setTimerWarn(true);
      if (remainingRef.current <= 0) { clearInterval(interval); handleAutoSubmit(); }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get(`/questions/random?subtopic_id=${subtopicId}&type=${selectedPaper}&count=10`)
      .then(r => setQuestions(r.questions || r.data || []))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, [subtopicId, selectedPaper]);

  const submitQuiz = async (auto = false) => {
    setConfirmOpen(false);
    // Merge open answers into answersRef
    Object.entries(openAnswers).forEach(([i, txt]) => {
      answersRef.current[i] = txt;
    });
    try {
      const res = await api.post('/quizzes/attempt', {
        subtopic_id:   subtopicId,
        subject_id:    subtopic?.subject_id || null,
        paper_type:    selectedPaper,
        total_time_ms: (TOTAL_SECS - remainingRef.current) * 1000,
        answers: questions.map((q, i) => ({
          question_id:        q.id,
          selected_option_id: answersRef.current[i] ?? null,
          time_taken_ms:      0,
        })),
      });
      onFinish(res.data?.attempt_id ?? res.attempt_id ?? res.id ?? null);
    } catch (err) {
      // BUG FIX: previously this swallowed every error and always called
      // onFinish(null), which sent the student to the results screen with
      // no data and only "Could not load results. Please try again." — no
      // indication of what went wrong or what to do next. Now the actual
      // error (e.g. "These questions are no longer available") is passed
      // through and shown directly, and the failure is logged so it's
      // diagnosable instead of silent.
      console.error('[QuizTab] submitQuiz failed:', err);
      onFinish(null, err?.message || 'Failed to submit your answers. Please try again.');
    }
  };

  const handleSubmitClick = () => {
    const unanswered = questions.filter((_, i) =>
      answersRef.current[i] == null && !openAnswers[i]
    ).length;
    if (unanswered > 0) {
      setConfirmOpen(true);
    } else {
      submitQuiz();
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a4a3f] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-300 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // No questions available — show a clear message instead of a blank green screen
  if (!loading && questions.length === 0) return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
        <AlertCircle size={32} className="text-white/60" />
      </div>
      <div>
        <h2 className="text-white text-xl font-bold mb-2">No Questions Available</h2>
        <p className="text-white/70 text-sm leading-relaxed max-w-xs">
          There are no questions for this subtopic yet. Check back later or ask your teacher to add questions.
        </p>
      </div>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 border border-white/40 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-white/10 transition-colors"
      >
        <ArrowLeft size={16} /> Go Back
      </button>
    </div>
  );

  const q = questions[current];
  const isMCQ = !q?.type || q?.type === 'mcq' || (q?.options && q.options.length > 0);
  const answered = Object.keys(answersRef.current).length + Object.keys(openAnswers).length;
  const unansweredCount = questions.length - answered;

  const curName  = subtopic?.curriculum_name || 'Curriculum';
  const subjName = subtopic?.subject_name    || 'Subject';
  const topName  = subtopic?.topic_name      || 'Topic';
  const stName   = subtopic?.name            || 'Subtopic';

  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col">
      {/* Top: breadcrumb + timer */}
      <div className="px-6 pt-4 pb-2 space-y-2">
        <nav className="text-white/50 text-xs flex items-center gap-1 flex-wrap">
          <span className="hover:text-white/80 cursor-pointer" onClick={() => navigate('/student/dashboard')}>Home</span>
          {[curName, subjName, topName, stName, 'Quiz'].map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-white/30">›</span>
              <span className={i === 4 ? 'text-white/80 font-medium' : ''}>{seg}</span>
            </span>
          ))}
        </nav>
        <div className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
          timerWarn ? 'border-red-400 text-red-300' : 'border-white/40 text-white'
        }`}>
          <Clock size={12} />
          {displayTime}
        </div>
      </div>

      {/* Two-column question area */}
      {q && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[45%_55%] gap-6 px-4 lg:px-8 py-4">

          {/* Left — question card */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 space-y-4 h-fit">
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-full font-medium">
                Question {current + 1}
              </span>
              {q.marks && (
                <span className="text-[10px] bg-gray-900/70 text-white px-2 py-0.5 rounded-full font-bold">
                  {q.marks} Mark{q.marks !== 1 ? 's' : ''}
                </span>
              )}
              {q.difficulty && <DiffBadge level={q.difficulty} />}
              <button
                onClick={() => setFlagged(prev => {
                  const n = new Set(prev);
                  n.has(current) ? n.delete(current) : n.add(current);
                  return n;
                })}
                className={`ml-auto p-1.5 rounded-lg transition-colors ${
                  flagged.has(current) ? 'text-amber-400' : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Flag size={14} />
              </button>
            </div>

            {/* Question text */}
            <p className="text-white text-base leading-relaxed">{q.question_text || q.text}</p>

            {/* Hint button */}
            <div className="relative pt-2">
              <button
                onMouseEnter={() => setHintHover(true)}
                onMouseLeave={() => setHintHover(false)}
                onClick={() => setHintOpen(true)}
                className="flex items-center gap-1.5 border border-white/30 text-white/80 hover:text-white hover:border-white/60 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
              >
                <Lightbulb size={13} /> Need Hint? Ask AI 
              </button>
              {hintHover && !hintOpen && (
                <div className="absolute left-0 top-full mt-1 bg-amber-400 text-gray-900 text-xs rounded-xl px-3 py-2 w-64 shadow-lg z-20">
                  Stuck on this question? No worries! Click the AI Hint button to get a helpful clue.
                </div>
              )}
            </div>
          </div>

          {/* Right — options or textarea */}
          <div className="space-y-3">
            {isMCQ ? (
              <div className="space-y-2">
                {(q.options || []).map((opt, i) => {
                  // BUG FIX: previously stored/compared the array INDEX
                  // (opt.id || i) as the selected answer, but the server
                  // scores by comparing this value as plain TEXT against
                  // question.correct_answer (also plain text — see
                  // POST /quizzes/attempt and POST /questions/:id/answer).
                  // An index like 0/1/2/3 can only equal correct-answer
                  // text like "naoh" by coincidence, so most MCQ answers
                  // were being scored as wrong regardless of what the
                  // student actually selected. opt.id was dead code: no
                  // option shape in this codebase (teacher-created,
                  // AI-extracted, or the answer_options-table fallback)
                  // ever sets an `id` field — all use option_text/text.
                  const optionText = opt.text || opt.option_text || '';
                  const isSelected = answersRef.current[current] === optionText;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        answersRef.current[current] = optionText;
                        // force re-render
                        setCurrent(c => c); // same index triggers re-render
                        setOpenAnswers(prev => ({ ...prev }));
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-full border transition-all text-left ${
                        isSelected
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'bg-white border-white text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-white/20 text-white' : 'border-2 border-gray-200 text-gray-400'
                      }`}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <span className="text-sm">{optionText}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <OpenAnswerArea
                value={openAnswers[current] || ''}
                onChange={v => setOpenAnswers(prev => ({ ...prev, [current]: v }))}
              />
            )}

            {/* Nav row */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => current > 0 && setCurrent(c => c - 1)}
                disabled={current === 0}
                className="flex items-center gap-1 border border-white/30 text-white/70 text-sm px-4 py-2 rounded-full disabled:opacity-30 hover:bg-white/10 transition-colors"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={() => current < questions.length - 1 && setCurrent(c => c + 1)}
                disabled={current === questions.length - 1}
                className="flex items-center gap-1 border border-white/30 text-white/70 text-sm px-4 py-2 rounded-full disabled:opacity-30 hover:bg-white/10 transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom: question nav + submit */}
      <div className="px-4 lg:px-8 pb-6 pt-2">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {questions.map((_, i) => {
            const isAnswered = answersRef.current[i] != null || openAnswers[i];
            const isCurrent  = i === current;
            return (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-9 h-9 rounded-lg text-xs font-bold transition-colors ${
                  isCurrent
                    ? 'bg-blue-400 text-white border-b-2 border-blue-200'
                    : isAnswered
                      ? 'bg-white/40 text-white'
                      : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
          <button
            onClick={handleSubmitClick}
            className="ml-auto bg-blue-500 hover:bg-blue-400 text-white font-bold text-sm px-6 py-2 rounded-full transition-colors"
          >
            Submit
          </button>
        </div>
      </div>

      {/* Hint Modal */}
      {hintOpen && (
        <HintModal
          question={q}
          onClose={() => setHintOpen(false)}
        />
      )}

      {/* Unanswered confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={20} className="text-amber-500" />
              <h3 className="font-bold text-gray-900">Unanswered Questions</h3>
            </div>
            <p className="text-sm text-gray-600 mb-1">You have <strong>{unansweredCount}</strong> unanswered question{unansweredCount !== 1 ? 's' : ''}.</p>
            <p className="text-sm text-gray-500 mb-5">Would you still like to end the quiz?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Continue solving
              </button>
              <button
                onClick={() => submitQuiz()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Open Answer area (shared) ──────────────────────────────────────────────────
function OpenAnswerArea({ value, onChange }) {
  const [formulaTip, setFormulaTip] = useState(false);
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Type your answer here ..."
        className="w-full bg-white rounded-2xl border-0 px-4 py-4 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[200px]"
      />
      <div className="absolute bottom-3 right-3 flex gap-2">
        <div className="relative">
          {formulaTip && (
            <div className="absolute bottom-9 right-0 bg-gray-900 text-white text-xs rounded-xl px-3 py-2 w-52 shadow-lg z-10">
              <div className="flex justify-between items-start gap-2">
                <span>Formulae available! Tap the formula icon to check.</span>
                <button onClick={() => setFormulaTip(false)} className="text-white/60 hover:text-white mt-0.5">
                  <X size={11} />
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => setFormulaTip(f => !f)}
            className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-colors"
          >
            <Sigma size={13} />
          </button>
        </div>
        <button className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white hover:bg-purple-600 transition-colors">
          <Upload size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Hint Modal ─────────────────────────────────────────────────────────────────
function HintModal({ question, onClose }) {
  const [hints,   setHints]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.post('/ai/hint', { question_id: question.id, hint_level: 1 })
      .then(r => {
        const raw = r.hints || r.content || r.hint || '';
        // Split by newlines or bullets
        const lines = typeof raw === 'string'
          ? raw.split(/\n|•|-/).map(s => s.trim()).filter(Boolean)
          : Array.isArray(raw) ? raw : [String(raw)];
        setHints(lines.slice(0, 5));
      })
      .catch(() => setHints(['Focus on the key concepts of the question.', 'Re-read the question carefully.', 'Think about related formulas or definitions.']))
      .finally(() => setLoading(false));
  }, [question.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X size={18} />
        </button>
        <h2 className="text-center text-lg font-bold mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Hint 
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ul className="space-y-3">
            {hints.map((hint, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <BoldMarkdown text={hint} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — RESULTS
// ══════════════════════════════════════════════════════════════════════════════
function ResultsScreen({ subtopicId, subtopic, attemptId, submitError, onRevise, onQuizComplete }) {
  const [results,       setResults]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState(null);
  const [submitProgress,setSubmitProgress]= useState(null); // "Submitting question X of Y..."
  const [selectedQ,     setSelectedQ]     = useState(0);
  const [schemeOpen,    setSchemeOpen]    = useState({});
  const [reviseToast,   setReviseToast]   = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!attemptId) { setLoading(false); return; }
      try {
        const r = await api.get(`/quizzes/attempt/${attemptId}`);
        setResults(r);
        // Mark quiz complete
        await api.post(`/subtopic-progress/${subtopicId}`, { task: 'quiz' });
        onQuizComplete?.();
      } catch (err) {
        // BUG FIX: previously this caught and discarded the error entirely
        // (empty catch block), so a 404/500 from /quizzes/attempt/:id looked
        // identical to "attemptId was never set" — both showed the same
        // generic, undiagnosable message. Now logged and the message is
        // surfaced to the student.
        console.error('[ResultsScreen] Failed to load quiz results:', err);
        setLoadError(err?.message || null);
        setResults(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [attemptId, subtopicId]);

  if (loading) return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4 px-4">
      <div className="w-10 h-10 border-4 border-blue-300 border-t-transparent rounded-full animate-spin" />
      <p className="text-white/80 text-sm">
        {submitProgress || 'Submitting your answers...'}
      </p>
      <div className="w-48 bg-white/20 rounded-full h-2">
        <div className="h-2 bg-blue-400 rounded-full transition-all duration-500" style={{ width: '80%' }} />
      </div>
    </div>
  );

  if (!results) return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
        <AlertCircle size={26} className="text-white/60" />
      </div>
      <div>
        <p className="text-white text-base font-semibold mb-1">
          {submitError || loadError || 'Could not load your results.'}
        </p>
        <p className="text-white/50 text-sm">
          {submitError || loadError
            ? 'Your answers were not saved for this attempt. Please try the quiz again.'
            : 'Please try again.'}
        </p>
      </div>
      <button
        onClick={onRevise}
        className="mt-2 flex items-center gap-2 bg-white text-[#0a4a3f] text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-white/90 transition-colors"
      >
        Back to Subtopic
      </button>
    </div>
  );

  const questions    = results.questions || results.answers || [];
  const score        = results.score        ?? 0;
  const totalMarks   = results.total_marks  ?? questions.length;
  const timeTaken    = results.time_taken   ?? 0;
  const accuracy     = results.accuracy     ?? (totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0);
  const avgScore     = results.avg_score    ?? '--';
  const avgTime      = results.avg_time     ?? '--';
  const recommendation = results.recommendation || results.examiner_recommendation || '';

  const tm = Math.floor(timeTaken / 60);
  const ts = timeTaken % 60;

  const qData = questions[selectedQ] || {};
  const isCorrect = qData.is_correct;

  const STAT_CARDS = [
    { icon: '', label: 'Total Score',  value: `${score}/${totalMarks}`, border: 'border-l-green-400' },
    { icon: '',  label: 'Time Taken',  value: `${tm}m ${ts}s`,          border: 'border-l-purple-400' },
    { icon: '', label: 'Accuracy',     value: `${accuracy}%`,            border: 'border-l-pink-400' },
  ];

  return (
    <div className="min-h-screen bg-[#0a4a3f] pb-20">
      {/* Stat cards */}
      <div className="px-4 lg:px-8 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {STAT_CARDS.map(({ icon, label, value, border }) => (
          <div key={label} className={`bg-white/10 backdrop-blur rounded-2xl p-4 border-l-4 ${border} flex items-center gap-3`}>
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-white/60 text-xs font-medium">{label}</p>
              <p className="text-white text-xl font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div className="px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Breakdown */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold text-sm">Breakdown by Question</h3>

          {/* Question pills */}
          <div className="flex flex-wrap gap-2">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedQ(i)}
                className={`w-9 h-9 rounded-lg text-xs font-bold transition-colors ${
                  selectedQ === i
                    ? 'bg-blue-400 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Selected question detail */}
          {qData && (
            <div className="space-y-3">
              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                  isCorrect ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {isCorrect ? ' Correct' : ' Incorrect'}
                </span>
                {qData.difficulty && <DiffBadge level={qData.difficulty} />}
                {qData.time_taken && (
                  <span className="text-white/50 text-xs">{qData.time_taken}s</span>
                )}
                {qData.marks && (
                  <span className="text-[10px] bg-gray-900/60 text-white px-2 py-0.5 rounded-full font-bold">
                    {qData.marks} Mark{qData.marks !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <p className="text-white/90 text-sm leading-relaxed">
                {qData.question_text || qData.text}
              </p>

              <div>
                <p className="text-white/50 text-xs font-medium mb-1">Response</p>
                <p className="text-white/80 text-sm bg-white/10 rounded-xl px-3 py-2 leading-relaxed">
                  {qData.student_answer || qData.answer || <span className="text-white/30 italic">No answer given</span>}
                </p>
              </div>

              <div>
                <p className="text-blue-400 text-xs font-medium mb-1">Correct Answer</p>
                <p className="text-blue-300 text-sm leading-relaxed">{qData.correct_answer}</p>
              </div>

              {/* Detailed Marking Scheme */}
              <div>
                <button
                  onClick={() => setSchemeOpen(p => ({ ...p, [selectedQ]: !p[selectedQ] }))}
                  className="w-full flex items-center justify-between bg-blue-600/30 hover:bg-blue-600/40 border border-blue-500/30 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
                >
                  <span> Detailed Marking Scheme</span>
                  {schemeOpen[selectedQ] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span className="text-blue-300 text-[11px]">{schemeOpen[selectedQ] ? 'Hide' : 'Show'}</span>
                </button>

                {schemeOpen[selectedQ] && (
                  <MarkingScheme qData={qData} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Examiner Recommendation */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-4 h-fit">
          <h3 className="text-white font-bold text-sm">Examiner Recommendation &amp; Competitive Benchmark</h3>

          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-blue-500/20 text-blue-300 text-xs font-semibold px-3 py-2 rounded-full">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Average Score: {avgScore}%
            </div>
            <div className="flex items-center gap-2 bg-purple-500/20 text-purple-300 text-xs font-semibold px-3 py-2 rounded-full">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Average Time: {avgTime}
            </div>
          </div>

          <div>
            <h4 className="text-white/80 text-xs font-bold uppercase tracking-wide mb-2">Examiner Recommendation</h4>
            <p className="text-white/70 text-sm leading-relaxed">
              {recommendation || `You scored ${score}/${totalMarks} (${accuracy}%). ${
                accuracy >= 80
                  ? 'Excellent work! You have a strong grasp of this subtopic. Focus on the questions you missed to aim for full marks.'
                  : accuracy >= 50
                    ? 'Good effort! Review the areas you found challenging and attempt the quiz again to improve your score.'
                    : 'Keep going — every attempt builds understanding. Revisit the resources and practice questions to strengthen your foundation.'
              }`}
            </p>
          </div>
        </div>
      </div>

      {/* Revise Now toast */}
      {reviseToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900/95 backdrop-blur text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-2xl">
          <span>Let's revise and bounce back stronger</span>
          <button
            onClick={onRevise}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold text-xs px-3 py-1.5 rounded-full transition-colors shrink-0"
          >
            Revise Now <RotateCcw size={12} />
          </button>
          <button onClick={() => setReviseToast(false)} className="text-white/40 hover:text-white ml-1">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Detailed Marking Scheme (expands inside left column) ───────────────────────
function MarkingScheme({ qData }) {
  const ai = qData.ai_explanation || qData.marking_scheme || qData.explanation || {};
  const steps = ai.steps || ai.step_by_step || [];
  const bullets = Array.isArray(steps) ? steps : typeof steps === 'string' ? steps.split('\n').filter(Boolean) : [];

  return (
    <div className="mt-2 bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 text-sm text-white/80">
      {/* Why right/wrong */}
      {(ai.verdict || ai.why) && (
        <div>
          <p className="font-bold text-white text-xs mb-1">Why your answer is {ai.status || (qData.is_correct ? 'correct' : 'incorrect')}?</p>
          <ul className="space-y-1 text-xs">
            {ai.status && (
              <li>• <strong>Status:</strong> {ai.status}</li>
            )}
            {(ai.verdict || ai.why) && (
              <li className="leading-relaxed"><BoldMarkdown text={ai.verdict || ai.why} /></li>
            )}
          </ul>
        </div>
      )}

      {/* Step-by-step */}
      {bullets.length > 0 && (
        <div>
          <p className="font-bold text-white text-xs mb-1">Step-by-step reasoning</p>
          <ul className="space-y-1">
            {bullets.map((s, i) => (
              <li key={i} className="flex gap-1.5 text-xs leading-relaxed">
                <span className="text-blue-400 shrink-0">•</span>
                <BoldMarkdown text={s} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Examiner requirement */}
      {ai.examiner_requirement && (
        <div>
          <p className="font-bold text-white text-xs mb-1">Examiner's requirement</p>
          <p className="text-xs leading-relaxed"><BoldMarkdown text={ai.examiner_requirement} /></p>
        </div>
      )}

      {/* Model answer */}
      {ai.model_answer && (
        <div>
          <p className="font-bold text-white text-xs mb-1">Model Answer</p>
          <p className="text-blue-300 font-bold text-xs leading-relaxed">{ai.model_answer}</p>
        </div>
      )}

      {/* If no AI data yet */}
      {!ai.verdict && !ai.why && bullets.length === 0 && !ai.model_answer && (
        <p className="text-white/40 text-xs italic text-center py-2">
          Detailed marking scheme will appear here once generated.
        </p>
      )}

      {/* Thumbs + flag */}
      <div className="flex gap-3 pt-1">
        <button className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors text-xs">
          <ThumbsUp size={13} /> Helpful
        </button>
        <button className="flex items-center gap-1 text-white/40 hover:text-amber-400 transition-colors text-xs">
          <Flag size={13} /> Flag
        </button>
      </div>
    </div>
  );
}
