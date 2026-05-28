// client/src/pages/PracticeMode.jsx
// Launched from StudentDashboard subject card via react-router state:
//   navigate('/student/practice', { state: { subjectId, subjectName, boardCode } })
//
// v1.2 ADDITIONS:
//   - Passes mode=practice to /questions/random (backend keeps AI-generated questions in practice)
//   - AI hint generation: when student clicks hint after getting wrong answer or after 2 static hints
//   - Essay question support: shows textarea instead of MCQ options
//   - Source attribution: shows question source when present
//   - concept_hint is a DB field used internally — NOT the student hint system

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Lightbulb, CheckCircle,
  XCircle, RotateCcw, ArrowRight, Loader2, BookOpen, Sparkles,
} from 'lucide-react';
import api from '../services/apiClient';

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

function genSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── AI Hint fetcher ──────────────────────────────────────────────────────────
async function fetchAIHint(questionId, selectedOptionId) {
  try {
    const res = await api.post('/ai/hint', {
      question_id:        questionId,
      selected_option_id: selectedOptionId || null,
    });
    return res?.hint || res?.data?.hint || null;
  } catch {
    return null;
  }
}

// ─── Question Card ────────────────────────────────────────────────────────────
function QuestionCard({ question, questionNumber, totalQuestions, onAnswer, sessionId }) {
  const [selected,      setSelected]      = useState(null);
  const [essayText,     setEssayText]     = useState('');
  const [result,        setResult]        = useState(null);
  const [hintIndex,     setHintIndex]     = useState(-1);
  const [aiHint,        setAiHint]        = useState(null);
  const [aiHintLoading, setAiHintLoading] = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const startTime = useRef(Date.now());

  const isEssay = question.question_type === 'essay';

  useEffect(() => {
    setSelected(null);
    setEssayText('');
    setResult(null);
    setHintIndex(-1);
    setAiHint(null);
    startTime.current = Date.now();
  }, [question.id]);

  // ── Request AI hint ─────────────────────────────────────────────────────────
  const handleGetAIHint = async () => {
    setAiHintLoading(true);
    const hint = await fetchAIHint(question.id, selected);
    setAiHint(hint || 'Try breaking the question into smaller parts and focus on key terms.');
    setAiHintLoading(false);
  };

  // ── Submit MCQ ──────────────────────────────────────────────────────────────
  const handleSubmitMCQ = async () => {
    if (!selected || submitting || result) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/questions/${question.id}/answer`, {
        selected_answer: selected,    // option text
        session_id:      sessionId,
        time_taken_ms:   Date.now() - startTime.current,
        mode:            'practice',
      });
      setResult(res);
    } catch {
      alert('Failed to submit answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit Essay ────────────────────────────────────────────────────────────
  const handleSubmitEssay = async () => {
    if (!essayText.trim() || submitting || result) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/questions/${question.id}/answer`, {
        essay_response: essayText.trim(),
        session_id:     sessionId,
        time_taken_ms:  Date.now() - startTime.current,
        mode:           'practice',
      });
      setResult(res);
    } catch {
      alert('Failed to submit answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getOptionStyle = (optText) => {
    const isCorrect  = result && String(optText).trim().toLowerCase() ===
                       String(result.correct_answer || '').trim().toLowerCase();
    const isSelected = selected === optText;
    if (!result) {
      return isSelected
        ? 'border-indigo-400 bg-indigo-50'
        : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50 cursor-pointer';
    }
    if (isCorrect)                return 'border-green-400 bg-green-50';
    if (isSelected && !isCorrect) return 'border-red-400 bg-red-50';
    return 'border-gray-100 opacity-60';
  };

  const diffBadge = {
    easy:   'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    hard:   'bg-red-100 text-red-700',
  };

  // Show AI hint button when: static hints exhausted OR student answered wrong
  const showAIHintBtn = !result && !aiHint && (
    hintIndex >= (question.hints?.length ?? 0) - 1 || (result && !result.is_correct)
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-8 pb-12 px-4">
      <div className="w-full max-w-2xl">

        {/* Progress */}
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
            {isEssay && (
              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                Essay
              </span>
            )}
          </div>

          {/* Question */}
          <div className="px-5 py-4">
            <p className="text-gray-900 font-medium text-base leading-relaxed">
              {question.question_text}
            </p>
            {/* Source attribution */}
            {question.source && (
              <p className="text-xs text-gray-400 mt-2 italic">
                Source: {question.source}
              </p>
            )}
          </div>

          {/* ── MCQ Options ── */}
          {!isEssay && (
            <div className="px-5 pb-4 space-y-2.5">
              {question.options?.map((opt, i) => {
                const optText = typeof opt === 'string' ? opt : (opt.option_text || '');
                return (
                <button
                  key={i}
                  onClick={() => !result && setSelected(optText)}
                  disabled={!!result}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${getOptionStyle(optText)}`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    selected === optText && !result ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {LABELS[i]}
                  </span>
                  <span className="text-sm text-gray-800">{optText}</span>
                  {result && String(optText).trim().toLowerCase() === String(result.correct_answer || '').trim().toLowerCase() && (
                    <CheckCircle className="w-4 h-4 text-green-500 ml-auto flex-shrink-0" />
                  )}
                  {result && selected === optText && String(optText).trim().toLowerCase() !== String(result.correct_answer || '').trim().toLowerCase() && (
                    <XCircle className="w-4 h-4 text-red-400 ml-auto flex-shrink-0" />
                  )}
                </button>
                );
              })}
            </div>
          )}

          {/* ── Essay textarea ── */}
          {isEssay && (
            <div className="px-5 pb-4">
              <textarea
                value={essayText}
                onChange={e => setEssayText(e.target.value)}
                disabled={!!result}
                rows={6}
                placeholder="Write your answer here…"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 resize-y disabled:bg-gray-50 disabled:text-gray-500"
              />
              {question.marks && (
                <p className="text-xs text-gray-400 mt-1.5">{question.marks} mark{question.marks !== 1 ? 's' : ''} available</p>
              )}
            </div>
          )}

          {/* ── Static Hints ── */}
          {question.hints?.length > 0 && !result && (
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

          {/* ── AI Hint button ── */}
          {!result && (
            <div className="px-5 pb-4">
              {!aiHint && (
                <button
                  onClick={handleGetAIHint}
                  disabled={aiHintLoading}
                  className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 font-medium disabled:opacity-50"
                >
                  {aiHintLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Getting AI hint…</>
                    : <><Sparkles className="w-3.5 h-3.5" /> Get AI hint</>
                  }
                </button>
              )}
              {aiHint && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-indigo-700 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI Hint
                  </p>
                  <p className="text-xs text-indigo-700 leading-relaxed">{aiHint}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Explanation (MCQ after answer) ── */}
          {result?.explanation && !isEssay && (
            <div className="mx-5 mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" /> Explanation
              </p>
              <p className="text-xs text-blue-600 leading-relaxed">{result.explanation}</p>
            </div>
          )}

          {/* ── Essay result ── */}
          {result && isEssay && (
            <div className="mx-5 mb-4 space-y-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">AI Marking Feedback</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  {result.feedback || result.explanation || 'Your answer has been submitted for review.'}
                </p>
                {result.marks_awarded !== undefined && result.max_marks !== undefined && (
                  <p className="text-xs font-bold text-blue-700 mt-2">
                    Score: {result.marks_awarded} / {result.max_marks} marks
                  </p>
                )}
              </div>
              {result.model_answer && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1">Model Answer</p>
                  <p className="text-xs text-green-700 leading-relaxed">{result.model_answer}</p>
                </div>
              )}
            </div>
          )}

          {/* ── MCQ result banner ── */}
          {result && !isEssay && (
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

          {/* ── Action ── */}
          <div className="px-5 pb-5 flex justify-end">
            {!result ? (
              <button
                onClick={isEssay ? handleSubmitEssay : handleSubmitMCQ}
                disabled={(!selected && !essayText.trim()) || submitting}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Answer <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onAnswer(result.is_correct ?? (result.marks_awarded > 0))}
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
    pct >= 80 ? { label: 'Excellent!',  color: 'text-green-600',  ring: 'border-green-300',  emoji: '' } :
    pct >= 60 ? { label: 'Good Job!',   color: 'text-blue-600',   ring: 'border-blue-300',   emoji: '' } :
    pct >= 40 ? { label: 'Keep Going!', color: 'text-yellow-600', ring: 'border-yellow-300', emoji: '' } :
                { label: 'Keep Trying', color: 'text-red-600',    ring: 'border-red-300',    emoji: '' };

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
  const navigate = useNavigate();

  const { subjectId, subjectName, boardCode, isRemediation, conceptName } = location.state || {};

  const [phase,          setPhase]          = useState('loading');
  const [questions,      setQuestions]      = useState([]);
  const [sessionId,      setSessionId]      = useState('');
  const [current,        setCurrent]        = useState(0);
  const [score,          setScore]          = useState(0);
  const [errMsg,         setErrMsg]         = useState('');
  const [subjects,       setSubjects]       = useState([]);
  const [pickedSubject,  setPickedSubject]  = useState(subjectId ? { id: subjectId, name: subjectName } : null);

  const loadQuestions = async (sid, bcode) => {
    setPhase('loading');
    setErrMsg('');
    try {
      const params = { count: 10, mode: 'practice' };
      if (bcode)  params.board      = bcode;
      if (sid)    params.subject_id = sid;

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
      if (err.error === 'free_limit_reached') {
        setErrMsg(err.message || "You've used your free questions for today. Upgrade to continue.");
      } else {
        setErrMsg('Failed to load questions. Please try again.');
      }
      setPhase('error');
    }
  };

  useEffect(() => {
    if (subjectId || boardCode) {
      loadQuestions(subjectId, boardCode);
    } else {
      // No subject in navigation state — load enrolled subjects for picker
      api.get('/students/my-subjects')
        .then(r => {
          const list = r.data || [];
          setSubjects(list);
          setPhase(list.length > 0 ? 'pick' : 'error');
          if (!list.length) setErrMsg('No subjects enrolled. Enrol in subjects from your dashboard first.');
        })
        .catch(() => {
          setPhase('error');
          setErrMsg('Could not load your subjects. Please try again.');
        });
    }
  }, []); // eslint-disable-line

  const handleAnswer = (wasCorrect) => {
    if (wasCorrect) setScore(s => s + 1);
    if (current + 1 >= questions.length) {
      setPhase('end');
    } else {
      setCurrent(c => c + 1);
    }
  };

  // ── Subject picker ──────────────────────────────────────────────────────────
  if (phase === 'pick') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-6">
          <button onClick={() => navigate('/student/dashboard')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5">
            <ChevronLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={18} className="text-violet-500" />
            <h2 className="text-base font-bold text-gray-900">Choose a Subject to Practise</h2>
          </div>
          <p className="text-xs text-gray-400 mb-5">Pick any subject from your enrolled list</p>
          <div className="space-y-2">
            {subjects.map(s => (
              <button key={s.id}
                onClick={() => { setPickedSubject(s); loadQuestions(s.id, s.exam_board_code); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-violet-300 hover:bg-violet-50 transition-colors text-left group">
                <span className="text-xl shrink-0">{s.icon_emoji || '📚'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-violet-700 truncate">{s.name}</p>
                  {s.exam_board_code && <p className="text-xs text-gray-400">{s.exam_board_code}</p>}
                </div>
                <ArrowRight size={14} className="text-gray-300 group-hover:text-violet-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-sm text-gray-400">
          Loading {subjectName ? `${subjectName} ` : ''}practice questions…
        </p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center max-w-sm w-full">
          <div className="text-4xl mb-3"></div>
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
        {/* Remediation banner — shown when launched from weakness analysis */}
        {isRemediation && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2.5">
            <span className="text-base"></span>
            <div>
              <span className="text-xs font-bold text-amber-800">Targeted follow-up</span>
              {conceptName && (
                <span className="text-xs text-amber-700"> · Weak area: <strong>{conceptName}</strong></span>
              )}
            </div>
            <span className="ml-auto text-xs text-amber-600 font-medium">
              These questions are personalised to your needs
            </span>
          </div>
        )}

        {/* Back button row */}
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
