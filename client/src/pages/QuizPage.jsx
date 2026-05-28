// client/src/pages/QuizPage.jsx
// URL: /student/quiz/:subtopicId?paper=all|paper1|structured
// Receives router state: { subtopicName, subjectName, examBoardName, subjectId }
//
// FIX v1.1: Replaced raw axios with api instance from services/api.js
//   - Removed: import axios, const API, const authHeader
//   - Added:   import api
//   - Response shape updated: api interceptor returns response.data directly
//   - Error handling for free_limit_reached (403) preserved correctly

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Loader2, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { UpgradeWall } from './PricingPage';
import api from '../services/apiClient';

const LABELS = ['01', '02', '03', '04', '05'];

// ── Quiz MCQ card ─────────────────────────────────────────────────────────────
function QuizQuestion({ question, questionNumber, submitRef, onAnswered }) {
  const [selected,    setSelected]    = useState(null);
  const [result,      setResult]      = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [aiExplain,   setAiExplain]   = useState('');
  const [explainLoad, setExplainLoad] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    setSelected(null); setResult(null);
    setAiExplain(''); setExplainLoad(false);
    startTime.current = Date.now();
  }, [question?.id]);

  const handleSubmit = useCallback(async () => {
    if (!selected || submitting || result) return;
    setSubmitting(true);
    try {
      const timeTaken = Date.now() - startTime.current;
      // api interceptor returns response.data directly
      // so `res` = { success, is_correct, correct_options, explanation, ... }
      const res = await api.post(`/questions/${question.id}/answer`, {
        selected_answer: selected,   // option text — matches correct_answer in DB
        time_taken_ms:   timeTaken,
      });
      setResult(res);

      // Fire AI explanation in background — non-blocking
      setExplainLoad(true);
      api.post('/ai/explain', { question_id: question.id, selected_option_id: selected })
        .then(r => { if (r.success) setAiExplain(r.explanation); })
        .catch(() => {})
        .finally(() => setExplainLoad(false));

      onAnswered({
        question_id:     question.id,
        selected_answer: selected,    // option text
        time_taken_ms:   timeTaken,
      });
    } catch {
      alert('Failed to submit answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, result, question, onAnswered]);

  useEffect(() => { submitRef.current = handleSubmit; }, [handleSubmit, submitRef]);

  const diffBadge = { easy: 'bg-green-500', medium: 'bg-amber-500', hard: 'bg-red-500' };

  // Comparison uses option_text (the correct_answer field is also text)
  const optStyle = (optText) => {
    const isCorrect  = result && String(optText).trim().toLowerCase() ===
                       String(result.correct_answer || '').trim().toLowerCase();
    const isSelected = selected === optText;
    if (!result) return isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 cursor-pointer';
    if (isCorrect)                return 'border-blue-400 bg-blue-50';
    if (isSelected && !isCorrect) return 'border-red-300 bg-red-50';
    return 'border-gray-100 opacity-60';
  };

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
        </div>

        <div className="px-5 py-4">
          <p className="text-gray-900 text-sm leading-relaxed">{question.question_text}</p>
        </div>

        <div className="px-5 pb-4 space-y-2">
          {question.options?.map((opt, i) => {
            const optText   = typeof opt === 'string' ? opt : (opt.option_text || '');
            const isCorrect = result && String(optText).trim().toLowerCase() ===
                              String(result.correct_answer || '').trim().toLowerCase();
            const isSel     = selected === optText;
            return (
              <button
                key={i}
                onClick={() => !result && setSelected(optText)}
                disabled={!!result}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${optStyle(optText)}`}
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-100 text-gray-500">
                  {LABELS[i]}
                </span>
                <span className="text-sm text-gray-800 flex-1">{optText}</span>
                {result && isCorrect && <CheckCircle size={14} className="text-blue-500 shrink-0" />}
                {result && isSel && !isCorrect && <XCircle size={14} className="text-red-400 shrink-0" />}
              </button>
            );
          })}
        </div>

        {result && (
          <>
            <div className={`mx-5 mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs ${
              result.is_correct
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {result.is_correct
                ? <><CheckCircle size={14} /><span className="font-semibold">Correct! Well done.</span></>
                : <><XCircle    size={14} /><span className="font-semibold">Incorrect. See correct answer above.</span></>}
            </div>

            <div className="mx-5 mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
                <Sparkles size={12} /> AI Explanation
              </p>
              {explainLoad
                ? <div className="flex items-center gap-2 text-xs text-blue-400"><Loader2 size={12} className="animate-spin" /> Generating…</div>
                : <p className="text-xs text-blue-700 leading-relaxed">{aiExplain || result.explanation || 'No explanation available.'}</p>
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Marking overlay ───────────────────────────────────────────────────────────
function MarkingScreen() {
  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-5xl animate-bounce"></div>
      <p className="text-white text-xl font-bold">Marking your quiz…</p>
      <p className="text-white/60 text-sm">Sit tight, the AI examiner is reviewing your answers.</p>
      <Loader2 size={28} className="text-blue-400 animate-spin mt-2" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function QuizPage() {
  const { subtopicId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const location       = useLocation();

  const {
    subtopicName = 'Quiz',
    subjectName  = '',
    examBoardName = '',
  } = location.state || {};

  const paper = searchParams.get('paper') || 'all';

  const [questions,   setQuestions]   = useState([]);
  const [current,     setCurrent]     = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [upgradeWall, setUpgradeWall] = useState(false);
  const [subjectId,   setSubjectId]   = useState(location.state?.subjectId || null);
  const [answeredIdx, setAnsweredIdx] = useState(-1);

  const answersRef  = useRef([]);
  const submitRef   = useRef(null);
  const quizStartMs = useRef(Date.now());

  // ── Fetch subjectId from subtopic if not passed via router state ───────────
  useEffect(() => {
    if (subjectId) return;
    api.get(`/subtopics/${subtopicId}`)
      .then(r => setSubjectId(r.data?.subject_id || null))
      .catch(() => {});
  }, [subtopicId, subjectId]);

  // ── Load questions once subjectId is known ─────────────────────────────────
  useEffect(() => {
    if (!subjectId) return;
    setLoading(true);
    answersRef.current = [];
    setAnsweredIdx(-1);
    setCurrent(0);

    api.get('/questions/random', {
      params: {
        count:              10,
        board:              examBoardName || undefined,
        subject_id:         subjectId,
        question_sub_type:  paper === 'structured' ? 'structured' : 'mcq',
      },
    })
      .then(r => setQuestions(r.data || []))
      .catch(err => {
        if (err.error === 'free_limit_reached') setUpgradeWall(true);
      })
      .finally(() => setLoading(false));
  }, [subjectId, paper, examBoardName]);

  const handleAnswered = useCallback((record) => {
    answersRef.current = [...answersRef.current, record];
    setAnsweredIdx(current);
  }, [current]);

  const handleNext = async () => {
    if (submitting) return;
    if (current + 1 < questions.length) {
      setCurrent(c => c + 1);
      setAnsweredIdx(-1);
      return;
    }
    setSubmitting(true);
    try {
      // api interceptor returns response.data directly
      // so `res` = { success, attempt_id, total_score, ... }
      const res = await api.post('/quizzes/attempt', {
        subtopic_id:   subtopicId,
        subject_id:    subjectId,
        paper_type:    paper,
        total_time_ms: Date.now() - quizStartMs.current,
        answers:       answersRef.current,
      });
      const attemptId = res.attempt_id ?? res.data?.attempt_id;
      navigate(`/student/quiz-results/${attemptId}`, {
        state: { subtopicId, subtopicName, subjectName, examBoardName },
      });
    } catch {
      alert('Failed to submit quiz. Please try again.');
      setSubmitting(false);
    }
  };

  const currentAnswered = answeredIdx === current;

  if (submitting)  return <MarkingScreen />;
  if (upgradeWall) return (
    <div className="min-h-screen bg-[#0a4a3f]">
      <UpgradeWall onRevise={() => navigate(`/student/subtopic/${subtopicId}?tab=practice`)} />
    </div>
  );
  if (loading) return (
    <div className="min-h-screen bg-[#0a4a3f] flex items-center justify-center">
      <Loader2 size={32} className="text-blue-400 animate-spin" />
    </div>
  );
  if (!questions.length) return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-white font-semibold">No questions available for this quiz.</p>
      <button
        onClick={() => navigate(`/student/subtopic/${subtopicId}?tab=quiz`)}
        className="text-blue-400 text-sm font-medium flex items-center gap-1"
      >
        <ChevronLeft size={14} /> Back
      </button>
    </div>
  );

  const q = questions[current];

  return (
    <div className="min-h-screen bg-[#0a4a3f]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0a4a3f] border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate(`/student/subtopic/${subtopicId}?tab=quiz`)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors"
          >
            <ChevronLeft size={16} /> Exit
          </button>
          <p className="text-white/80 text-sm font-medium truncate max-w-[200px]">{subtopicName}</p>
          <span className="text-white/50 text-sm">{current + 1}/{questions.length}</span>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-full bg-blue-400 transition-all duration-300"
            style={{ width: `${(current / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="max-w-3xl mx-auto px-4 py-5">
        <QuizQuestion
          key={q.id}
          question={q}
          questionNumber={current + 1}
          submitRef={submitRef}
          onAnswered={handleAnswered}
        />
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a4a3f] border-t border-white/10 px-4 py-3 z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-white/50 text-sm">{current + 1} of {questions.length}</span>
          {!currentAnswered ? (
            <button
              onClick={() => submitRef.current?.()}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              Submit
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={submitting}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              {current + 1 < questions.length ? 'Next Question' : 'Finish Quiz'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
