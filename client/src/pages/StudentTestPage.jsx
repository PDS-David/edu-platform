// client/src/pages/StudentTestPage.jsx
// Route: /student/test/:testId
// Same UI as QuizPage but with teacher-assigned context banner and countdown timer.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ChevronLeft, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

const LABELS     = ['01', '02', '03', '04', '05'];

function TimerPill({ seconds }) {
  const m   = Math.floor(seconds / 60);
  const s   = seconds % 60;
  const str = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const cls = seconds <= 300 ? 'bg-red-500' : seconds <= 600 ? 'bg-amber-500' : 'bg-gray-800';
  return (
    <span className={`flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-xl tabular-nums ${cls}`}>
      <Clock size={11} /> {str}
    </span>
  );
}

function ResultScreen({ result, testTitle, onDone }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-3">{result.accuracy_pct >= 70 ? '🎉' : '📚'}</div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">{testTitle} — Complete</h2>
        <p className="text-3xl font-black text-teal-500 mt-4">{result.accuracy_pct}%</p>
        <p className="text-sm text-gray-500 mt-1">{result.correct} / {result.total} correct</p>
        <button onClick={onDone}
          className="mt-6 w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

export default function StudentTestPage() {
  const { testId } = useParams();
  const navigate   = useNavigate();

  const [test,       setTest]       = useState(null);
  const [current,    setCurrent]    = useState(0);
  const [answers,    setAnswers]    = useState({});
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState(null);
  const [timeLeft,   setTimeLeft]   = useState(null);
  const timerRef  = useRef(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    api.get(`/student/test/${testId}`)
      .then(r => {
        const t = r.data;
        setTest(t);
        setTimeLeft((t.time_limit_minutes || 30) * 60);
      })
      .catch(() => navigate('/student/dashboard'))
      .finally(() => setLoading(false));
  }, [testId, navigate]);

  useEffect(() => {
    if (!timeLeft || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [!!timeLeft]); // eslint-disable-line

  const handleSubmit = useCallback(async (auto = false) => {
    if (!auto && !window.confirm('Submit the test now?')) return;
    clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const answersArray = (test?.questions || []).map(q => ({
        question_id: q.id,
        selected_option_id: answers[q.id] || null,
        time_taken_ms: Math.round((Date.now() - startTime.current) / (test?.questions?.length || 1)),
      }));
      const res = await api.post(
        `/student/test/${testId}/submit`,
        { answers: answersArray, total_time_ms: Date.now() - startTime.current }
      );
      setResult(res.data);
    } catch (err) {
      alert('Submission failed. Please try again.');
      setSubmitting(false);
    }
  }, [test, answers, testId]);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 size={28} className="text-teal-400 animate-spin" /></div>;
  if (submitting && !result) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <Loader2 size={28} className="text-teal-400 animate-spin" />
      <p className="text-gray-600 text-sm font-medium">Submitting your test…</p>
    </div>
  );
  if (result) return <ResultScreen result={result} testTitle={test?.title} onDone={() => navigate('/student/dashboard')} />;
  if (!test?.questions?.length) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400">No questions in this test.</p></div>;

  const q = test.questions[current];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-sm transition-colors">
            <ChevronLeft size={15} /> Exit
          </button>
          <div className="flex flex-col items-center">
            <p className="text-sm font-semibold text-gray-800 truncate max-w-[180px]">{test.title}</p>
            <p className="text-[10px] text-gray-400">Assigned by {test.teacher_name}</p>
          </div>
          <div className="flex items-center gap-2">
            {timeLeft !== null && <TimerPill seconds={timeLeft} />}
            <span className="text-xs text-gray-400">{current + 1}/{test.questions.length}</span>
          </div>
        </div>
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-teal-500 transition-all" style={{ width: `${(current / test.questions.length) * 100}%` }} />
        </div>
      </div>

      {/* Question card */}
      <div className="max-w-3xl mx-auto px-4 py-5 pb-24">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-4 flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded-full">Question {current + 1}</span>
            {q.difficulty && <span className={`text-xs text-white font-bold px-2.5 py-1 rounded-full ${q.difficulty === 'easy' ? 'bg-green-500' : q.difficulty === 'hard' ? 'bg-red-500' : 'bg-amber-500'}`}>{q.difficulty.toUpperCase()}</span>}
          </div>
          <div className="px-5 py-4">
            <p className="text-gray-900 text-sm leading-relaxed">{q.question_text}</p>
          </div>
          <div className="px-5 pb-5 space-y-2">
            {q.options?.map((opt, i) => (
              <button key={opt.id}
                onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  answers[q.id] === opt.id ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300'
                }`}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-100 text-gray-500">{LABELS[i]}</span>
                <span className="text-sm text-gray-800 flex-1">{opt.option_text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-sm text-gray-400">{current + 1} of {test.questions.length}</span>
          {current + 1 < test.questions.length ? (
            <button onClick={() => setCurrent(c => c + 1)}
              className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Next
            </button>
          ) : (
            <button onClick={() => handleSubmit(false)}
              className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Submit Test
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
