// client/src/pages/PracticeMode.jsx
// Launched from StudentDashboard subject card via react-router state:
//   navigate('/student/practice', { state: { subjectId, subjectName, boardCode } })
// No setup screen — goes straight into questions for that subject.
// Server validates every answer — correct option never sent to client upfront.
//
// FIX v1.1: Replaced raw axios with api instance from services/api.js
//   - Removed: import axios, const API, const authHeader
//   - Added:   import api
//   - Response shape updated: api interceptor returns response.data directly,
//     so the resolved value is already { success, data, count, ... }
//   - Error handling updated: err.error instead of err.response?.data?.error

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Lightbulb, CheckCircle,
  XCircle, RotateCcw, ArrowRight, Loader2, BookOpen,
} from 'lucide-react';
import api from '../services/api';

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

function genSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Question Card ────────────────────────────────────────────────────────────
function QuestionCard({ question, questionNumber, totalQuestions, onAnswer, sessionId }) {
  const [selected,   setSelected]   = useState(null);
  const [result,     setResult]     = useState(null);
  const [hintIndex,  setHintIndex]  = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    setSelected(null);
    setResult(null);
    setHintIndex(-1);
    startTime.current = Date.now();
  }, [question.id]);

  const handleSubmit = async () => {
    if (!selected || submitting || result) return;
    setSubmitting(true);
    try {
      // api interceptor returns response.data directly
      // so `res` = { success, is_correct, correct_options, explanation, ... }
      const res = await api.post(`/questions/${question.id}/answer`, {
        selected_option_id: selected,
        session_id:         sessionId,
        time_taken_ms:      Date.now() - startTime.current,
      });
      setResult(res);
    } catch {
      alert('Failed to submit answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getOptionStyle = (optId) => {
    if (!result) {
      return selected === optId
        ? 'border-indigo-400 bg-indigo-50'
        : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50 cursor-pointer';
    }
    const isCorrect  = result.correct_options.some(c => c.id === optId);
    const isSelected = selected === optId;
    if (isCorrect)               return 'border-green-400 bg-green-50';
    if (isSelected && !isCorrect) return 'border-red-400 bg-red-50';
    return 'border-gray-100 opacity-60';
  };

  const diffBadge = {
    easy:   'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    hard:   'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-8 pb-12 px-4">
      <div className="w-full max-w-2xl">

        {/* Progress bar */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Question {questionNumber} of {totalQuestions}</span>
            <span>{Math.round(((questionNumber - 1) / totalQuestions) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${((questionNumber - 1) / totalQuestions) * 100}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Meta badges */}
          <div className="px-5 pt-5 flex flex-wrap gap-2">
            {question.exam_board_code && (
              <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">
                {question.exam_board_code}
              </span>
            )}
            {question.topic && (
              <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                {question.topic}
              </span>
            )}
            {question.year && (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-semibold">
                {question.year}
              </span>
            )}
            {question.difficulty && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${diffBadge[question.difficulty] || 'bg-gray-100 text-gray-500'}`}>
                {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
              </span>
            )}
          </div>

          {/* Question */}
          <div className="px-5 py-4">
            <p className="text-gray-900 font-medium text-base leading-relaxed">
              {question.question_text}
            </p>
          </div>

          {/* Options */}
          <div className="px-5 pb-4 space-y-2.5">
            {question.options.map((opt, i) => (
              <button
                key={opt.id}
                onClick={() => !result && setSelected(opt.id)}
                disabled={!!result}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${getOptionStyle(opt.id)}`}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  selected === opt.id && !result ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {LABELS[i]}
                </span>
                <span className="text-sm text-gray-800">{opt.option_text}</span>
                {result && result.correct_options.some(c => c.id === opt.id) && (
                  <CheckCircle className="w-4 h-4 text-green-500 ml-auto flex-shrink-0" />
                )}
                {result && selected === opt.id && !result.correct_options.some(c => c.id === opt.id) && (
                  <XCircle className="w-4 h-4 text-red-400 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Hints */}
          {question.hints && question.hints.length > 0 && !result && (
            <div className="px-5 pb-4">
              {hintIndex >= 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2">
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">Hint {hintIndex + 1}:</span> {question.hints[hintIndex]}
                  </p>
                </div>
              )}
              {hintIndex < question.hints.length - 1 && (
                <button
                  onClick={() => setHintIndex(i => i + 1)}
                  className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {hintIndex === -1
                    ? `Get a hint (${question.hints.length} available)`
                    : `Next hint (${question.hints.length - hintIndex - 1} remaining)`}
                </button>
              )}
            </div>
          )}

          {/* Explanation */}
          {result?.explanation && (
            <div className="mx-5 mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" /> Explanation
              </p>
              <p className="text-xs text-blue-600 leading-relaxed">{result.explanation}</p>
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div className={`mx-5 mb-4 rounded-xl px-3 py-2.5 flex items-center gap-2 text-sm ${
              result.is_correct
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {result.is_correct
                ? <><CheckCircle className="w-4 h-4" /><span className="font-semibold">Correct! Well done.</span></>
                : <><XCircle className="w-4 h-4" /><span className="font-semibold">Incorrect. See the correct answer above.</span></>}
            </div>
          )}

          {/* Action */}
          <div className="px-5 pb-5 flex justify-end">
            {!result ? (
              <button
                onClick={handleSubmit}
                disabled={!selected || submitting}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Answer <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onAnswer(result.is_correct)}
                className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
              >
                {questionNumber < totalQuestions ? 'Next Question' : 'See Results'}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── End Screen ───────────────────────────────────────────────────────────────
function EndScreen({ score, total, subjectName, onRetry, onBack }) {
  const pct   = Math.round((score / total) * 100);
  const grade =
    pct >= 80 ? { label: 'Excellent!',  color: 'text-green-600',  ring: 'border-green-300',  emoji: '🏆' } :
    pct >= 60 ? { label: 'Good Job!',   color: 'text-blue-600',   ring: 'border-blue-300',   emoji: '👍' } :
    pct >= 40 ? { label: 'Keep Going!', color: 'text-yellow-600', ring: 'border-yellow-300', emoji: '💪' } :
                { label: 'Keep Trying', color: 'text-red-600',    ring: 'border-red-300',    emoji: '📚' };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-8 text-center">
        <div className="text-5xl mb-3">{grade.emoji}</div>
        <h2 className={`text-2xl font-bold mb-1 ${grade.color}`}>{grade.label}</h2>
        {subjectName && <p className="text-sm text-gray-400 mb-6">{subjectName} practice complete</p>}

        <div className={`w-28 h-28 rounded-full border-4 ${grade.ring} flex flex-col items-center justify-center mx-auto mb-6`}>
          <span className={`text-2xl font-bold ${grade.color}`}>{pct}%</span>
          <span className="text-xs text-gray-400">score</span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-7">
          <div className="bg-green-50 rounded-xl py-3">
            <div className="text-xl font-bold text-green-600">{score}</div>
            <div className="text-xs text-gray-400 mt-0.5">Correct</div>
          </div>
          <div className="bg-red-50 rounded-xl py-3">
            <div className="text-xl font-bold text-red-500">{total - score}</div>
            <div className="text-xs text-gray-400 mt-0.5">Wrong</div>
          </div>
          <div className="bg-gray-50 rounded-xl py-3">
            <div className="text-xl font-bold text-gray-700">{total}</div>
            <div className="text-xs text-gray-400 mt-0.5">Total</div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-1.5 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Dashboard
          </button>
          <button
            onClick={onRetry}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PracticeMode() {
  const location = useLocation();
  const navigate  = useNavigate();

  const { subjectId, subjectName, boardCode } = location.state || {};

  const [phase,     setPhase]     = useState('loading');
  const [questions, setQuestions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [current,   setCurrent]   = useState(0);
  const [score,     setScore]     = useState(0);
  const [errMsg,    setErrMsg]    = useState('');

  const loadQuestions = async () => {
    setPhase('loading');
    setErrMsg('');
    try {
      const params = { count: 10 };
      if (boardCode) params.board      = boardCode;
      if (subjectId) params.subject_id = subjectId;

      // api interceptor returns response.data directly
      // so `res` = { success, count, data: [...questions] }
      const res = await api.get('/questions/random', { params });

      if (!res.success || !res.data?.length) {
        setErrMsg('No questions found for this subject yet. Check back soon!');
        setPhase('error');
        return;
      }

      setQuestions(res.data);
      setSessionId(genSessionId());
      setCurrent(0);
      setScore(0);
      setPhase('quiz');
    } catch (err) {
      // Check for subscription limit (403 free_limit_reached)
      if (err.error === 'free_limit_reached') {
        setErrMsg(err.message || "You've used your free questions for today. Upgrade to continue.");
      } else {
        setErrMsg('Failed to load questions. Please try again.');
      }
      setPhase('error');
    }
  };

  useEffect(() => {
    if (!boardCode && !subjectId) {
      navigate('/student/dashboard', { replace: true });
      return;
    }
    loadQuestions();
  }, []); // eslint-disable-line

  const handleAnswer = (wasCorrect) => {
    if (wasCorrect) setScore(s => s + 1);
    if (current + 1 >= questions.length) {
      setPhase('end');
    } else {
      setCurrent(c => c + 1);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-sm text-gray-400">
          Loading {subjectName ? `${subjectName} ` : ''}questions…
        </p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center max-w-sm w-full">
          <div className="text-4xl mb-3">😔</div>
          <p className="text-gray-600 mb-6 text-sm">{errMsg}</p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/student/dashboard')}
              className="flex-1 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={loadQuestions}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'quiz') {
    return (
      <div>
        <div className="bg-white border-b border-gray-100 px-4 py-2.5">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {subjectName || 'Back to Dashboard'}
          </button>
        </div>
        <QuestionCard
          key={questions[current]?.id}
          question={questions[current]}
          questionNumber={current + 1}
          totalQuestions={questions.length}
          onAnswer={handleAnswer}
          sessionId={sessionId}
        />
      </div>
    );
  }

  return (
    <EndScreen
      score={score}
      total={questions.length}
      subjectName={subjectName}
      onRetry={loadQuestions}
      onBack={() => navigate('/student/dashboard')}
    />
  );
}
