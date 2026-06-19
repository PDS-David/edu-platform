// client/src/pages/SubtopicPage.jsx
// AI Buddy subtopic page — exact replica
// URL: /student/subtopic/:subtopicId?tab=resources|practice|quiz
// Three tabs: Resources | Practice Questions (MCQ/Smart Answers/Structured) | Quiz
//
// FIX v1.1: Replaced raw axios with api instance from services/api.js
// FIX v1.2 (BUG 2): Removed localStorage from PracticeTab — blocked in sandbox.
//   - useState(false) only for `dismissed`
//   - onDismiss just calls setDismissed(true), no localStorage.setItem

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import VideoPlayer from '../components/VideoPlayer';
import {
  ChevronLeft, ChevronRight, Loader2,
  CheckCircle, XCircle, Lightbulb, Sparkles,
  BookOpen, FileText, HelpCircle,
  Upload, Sigma,
  ArrowLeft } from 'lucide-react';
import TopNav from '../components/TopNav';
import AIChatWidget from '../components/AIChatWidget';
import QuizTab from '../components/QuizTab';
import api from '../services/apiClient';

const LABELS = ['01', '02', '03', '04', '05'];

// Resolve file URLs for Hetzner Docker (VITE_API_URL="/api" → same origin)
const _FILE_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '').replace(/\/api$/, '');
const resolveFileUrl = (url) => {
  if (!url) return '#';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${_FILE_BASE}${url}`;
};

function TickIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TabDot({ completed }) {
  return (
    <span className={`w-4 h-4 rounded-full border-2 inline-flex items-center justify-center shrink-0 ${
      completed ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
    }`}>
      {completed && <TickIcon />}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ResourcesTab({ subtopicId, subtopic, subtopicName, onComplete }) {
  const [resources,    setResources]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeRes,    setActiveRes]    = useState(null);
  const [notes,        setNotes]        = useState(null);
  const [notesLoading, setNotesLoading] = useState(false);

  // Fetch stored notes on mount
  useEffect(() => {
    api.get('/notes', { params: { subtopic_id: subtopicId } })
      .then(r => {
        if (r.data?.length > 0) setNotes(r.data[0].content_html);
      })
      .catch(() => {});
  }, [subtopicId]);

  const handleGenerateNotes = async () => {
    setNotesLoading(true);
    try {
      const r = await api.post('/ai/notes/generate', {
        subject_id: subtopic?.subject_id,
        topic_name: subtopicName,
      });
      setNotes(r.notes);
    } catch {} finally { setNotesLoading(false); }
  };

  // #7 — Fetch both topic-linked resources AND assigned lecture materials,
  // deduplicate by id, prioritise assigned ones (they have richer metadata).
  useEffect(() => {
    const LECTURE_TYPES = new Set([
      'learning_material', 'lecture_material', 'lecture', 'material', 'resource',
    ]);
    Promise.all([
      api.get('/resources', { params: { subtopic_id: subtopicId } }).then(r => r.data || []).catch(() => []),
      api.get('/resources/my-assignments').then(r => r.data || []).catch(() => []),
    ]).then(([linked, assigned]) => {
      // Filter assigned to only lecture-type materials relevant to this subtopic (or subject)
      const relevant = assigned.filter(a =>
        LECTURE_TYPES.has(a.push_type?.toLowerCase() || '') &&
        (a.subtopic_id == subtopicId || !a.subtopic_id)      // include if linked to subtopic or unlinked
      );
      // Merge: deduplicate by id, linked resources take base, assigned override if dupe
      const map = new Map();
      for (const r of linked)    map.set(r.id, r);
      for (const r of relevant)  if (!map.has(r.id)) map.set(r.id, { ...r, _assigned: true });
      setResources([...map.values()]);
    }).finally(() => setLoading(false));
  }, [subtopicId]);

  const handleOpen = async (res) => {
    setActiveRes(res);
    try {
      await api.post(`/subtopic-progress/${subtopicId}`, { task: 'resources' });
      onComplete('resources');
    } catch { /* ignore */ }
  };

  const typeIcon   = (type) => type === 'video' ? '' : type === 'audio' ? '' : '';
  const formatSize = (bytes) => {
    if (!bytes) return '';
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const formatDuration = (secs) => {
    if (!secs) return '';
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;

  if (resources.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-3"></div>
      <p className="text-sm">No resources uploaded yet for this subtopic.</p>
      <p className="text-xs mt-1">Check back soon!</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {notesLoading && (
        <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
          <Loader2 size={14} className="animate-spin" /> Generating revision notes…
        </div>
      )}
      {!notes && !notesLoading && (
        <button onClick={handleGenerateNotes}
          className="flex items-center gap-2 text-sm text-blue-600 border border-blue-300 px-4 py-2 rounded-xl hover:bg-blue-50 mb-4">
          <Sparkles size={14} /> Generate AI Revision Notes
        </button>
      )}
      {notes && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          <p className="font-semibold text-blue-700 text-xs uppercase tracking-wide mb-2 flex items-center gap-1">
            <Sparkles size={12} /> AI Revision Notes
          </p>
          {notes}
        </div>
      )}
      {resources.map(res => (
        <div key={res.id} className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{typeIcon(res.resource_type)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold text-gray-800 truncate">{res.title}</p>
                {res._assigned && (
                  <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full shrink-0">
                    From teacher
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {res.resource_type}
                {res.duration_seconds ? ` · ${formatDuration(res.duration_seconds)}` : ''}
                {res.file_size_bytes  ? ` · ${formatSize(res.file_size_bytes)}`       : ''}
              </p>
            </div>
            {res.resource_type === 'video' && (
              <button onClick={() => handleOpen(res)}
                className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Play
              </button>
            )}
            {res.resource_type === 'audio' && (
              <button onClick={() => handleOpen(res)}
                className="border border-blue-500 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                Listen
              </button>
            )}
            {(res.resource_type === 'document' || res.resource_type === 'pdf') && (() => {
                const base = _FILE_BASE;
                const fullUrl = (res.id ? `/api/resources/${res.id}/download` : resolveFileUrl(res.file_url));
                const isDataUri = fullUrl.startsWith('data:text/');
                return (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { handleOpen(res); }}
                      className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                      {activeRes?.id === res.id ? 'Close' : 'Read'}
                    </button>
                    {!isDataUri && (
                      <a href={fullUrl} download
                        className="bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                        ↓
                      </a>
                    )}
                  </div>
                );
              })()}
          </div>
          {activeRes?.id === res.id && res.resource_type === 'video' && (
            <div className="mt-2 rounded-xl overflow-hidden">
              <VideoPlayer videoId={res.id} />
            </div>
          )}
          {activeRes?.id === res.id && res.resource_type === 'audio' && (
            <audio controls className="w-full mt-2"
              src={(res.id ? `/api/resources/${res.id}/download` : resolveFileUrl(res.file_url))} />
          )}
          {activeRes?.id === res.id && (res.resource_type === 'document' || res.resource_type === 'pdf') && (() => {
            const fullUrl = (res.id ? `/api/resources/${res.id}/download` : resolveFileUrl(res.file_url));
            if (fullUrl.startsWith('data:text/')) {
              let text = '';
              try { text = decodeURIComponent(fullUrl.replace(/^data:text\/[^;]+;charset=utf-8,/, '')); }
              catch { text = fullUrl.replace(/^data:text\/[^;]+,/, ''); }
              return (
                <div className="mt-3 rounded-xl border border-blue-100 bg-white overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
                    <span className="text-xs font-bold text-blue-700">📄 {res.title}</span>
                    <span className="ml-auto text-[10px] text-blue-400">Learning Resource</span>
                  </div>
                  <div className="p-4 max-h-[500px] overflow-y-auto">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
                  </div>
                </div>
              );
            }
            // Regular file — open in new tab
            window.open(fullUrl, '_blank');
            return null;
          })()}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRACTICE QUESTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function PracticeTab({ subtopicId, subjectId, onComplete }) {
  const [subTab,    setSubTab]    = useState('mcq');
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [current,   setCurrent]   = useState(0);
  const [phase,     setPhase]     = useState('quiz');
  const [score,     setScore]     = useState(0);
  // BUG 2 FIX: removed localStorage.getItem — state only, no persistence needed
  const [dismissed, setDismissed] = useState(false);

  const loadQuestions = async (type) => {
    setLoading(true);
    setCurrent(0);
    setScore(0);
    setPhase('quiz');
    try {
      const params = { count: 8, question_sub_type: type };
      if (subtopicId) params.subtopic_id = subtopicId;
      if (subjectId)  params.subject_id  = subjectId;
      const r = await api.get('/questions/random', { params });
      setQuestions(r.data || []);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadQuestions(subTab); }, [subTab, subtopicId]); // eslint-disable-line

  const handleAnswer = async (wasCorrect) => {
    if (wasCorrect) setScore(s => s + 1);
    if (current + 1 >= questions.length) {
      setPhase('done');
      try {
        await api.post(`/subtopic-progress/${subtopicId}`, { task: 'practice' });
        onComplete('practice');
      } catch { /* ignore */ }
    } else {
      setCurrent(c => c + 1);
    }
  };

  const subTabs = [
    { id: 'mcq',        label: 'MCQ Questions',        ai: false },
    { id: 'smart',      label: 'Smart Answers',         ai: true  },
    { id: 'structured', label: 'Structured Questions',  ai: true  },
  ];

  return (
    <div className="bg-[#f5f7f5] -mx-4 px-4 min-h-screen pt-1">
      <div className="flex gap-2 mb-5">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              subTab === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}>
            {t.label}
            {t.ai && <span className="text-[9px] font-bold text-blue-400"></span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : questions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center shadow-sm">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm font-semibold text-gray-700 mb-1">
            No {subTab === "mcq" ? "MCQ" : subTab === "smart" ? "smart answer" : "structured"} questions yet
          </p>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Questions for this subtopic haven't been added yet.<br />
            {subTab !== "mcq" && "Try switching to MCQ Questions — they're updated more frequently."}
          </p>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            {subTab !== "mcq" && (
              <button
                onClick={() => setSubTab("mcq")}
                className="w-full py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors"
              >
                Try MCQ Questions instead
              </button>
            )}
            <button
              onClick={() => window.history.back()}
              className="w-full py-2 text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
            >
              ← Go back to topic
            </button>
          </div>
        </div>
      ) : phase === 'done' ? (
        <CompletionCard score={score} total={questions.length} onRetry={() => loadQuestions(subTab)} onTakeQuiz={() => {}} />
      ) : subTab === 'mcq' ? (
        <MCQQuestion key={questions[current]?.id} question={questions[current]}
          questionNumber={current + 1} totalQuestions={questions.length}
          onAnswer={handleAnswer} onPrev={current > 0 ? () => setCurrent(c => c - 1) : null} />
      ) : subTab === 'smart' ? (
        <OpenAnswerQuestion key={questions[current]?.id} question={questions[current]}
          questionNumber={current + 1} totalQuestions={questions.length} type="smart"
          dismissed={dismissed}
          // BUG 2 FIX: removed localStorage.setItem — session state only
          onDismiss={() => setDismissed(true)}
          onNext={() => handleAnswer(null)} onPrev={current > 0 ? () => setCurrent(c => c - 1) : null} />
      ) : (
        <StructuredQuestion key={questions[current]?.id} question={questions[current]}
          questionNumber={current + 1} totalQuestions={questions.length}
          onNext={() => handleAnswer(null)} onPrev={current > 0 ? () => setCurrent(c => c - 1) : null} />
      )}
    </div>
  );
}

// ─── MCQ Question ──────────────────────────────────────────────────────────────
function MCQQuestion({ question, questionNumber, totalQuestions, onAnswer, onPrev }) {
  const [selected,    setSelected]    = useState(null); // option_text of selected option
  const [result,      setResult]      = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [shownHints,  setShownHints]  = useState(0);
  const [aiExplain,   setAiExplain]   = useState('');
  const [explainLoad, setExplainLoad] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    setSelected(null); setResult(null);
    setShownHints(0); setAiExplain('');
    startTime.current = Date.now();
  }, [question?.id]);

  const staticHints = question?.hints || [];

  const handleSubmit = async () => {
    if (!selected || submitting || result) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/questions/${question.id}/answer`, {
        selected_answer:  selected,                        // option text
        time_taken_ms:    Date.now() - startTime.current,
      });
      setResult(res);
      setExplainLoad(true);
      api.post('/ai/explain', { question_id: question.id })
        .then(r => { if (r.success) setAiExplain(r.data?.explanation ?? r.explanation); })
        .catch(() => {})
        .finally(() => setExplainLoad(false));
    } catch { alert('Failed to submit. Try again.'); }
    finally  { setSubmitting(false); }
  };

  const diffBadge = { easy: 'bg-green-500', medium: 'bg-amber-500', hard: 'bg-red-500' };

  const optStyle = (optText) => {
    if (!result) return selected === optText ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 cursor-pointer';
    const isCorrect  = String(optText).trim().toLowerCase() === String(result.correct_answer || '').trim().toLowerCase();
    const isSelected = selected === optText;
    if (isCorrect)                return 'border-green-400 bg-green-50';
    if (isSelected && !isCorrect) return 'border-red-300 bg-red-50';
    return 'border-gray-100 opacity-60';
  };

  return (
    <div className="pb-24">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded-full">Question {questionNumber}</span>
          {question.difficulty && (
            <span className={`text-xs text-white font-bold px-2.5 py-1 rounded-full ${diffBadge[question.difficulty] || 'bg-gray-400'}`}>
              {question.difficulty.toUpperCase()}
            </span>
          )}
          {question.marks && (
            <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-gray-800">{question.marks} Mark(s)</span>
          )}
        </div>
        <div className="px-5 py-4">
          <p className="text-gray-900 font-medium text-sm leading-relaxed">{question.question_text}</p>
        </div>
        <div className="px-5 pb-4 space-y-2">
          {question.options?.map((opt, i) => {
            const optText   = opt.option_text || opt.text || String(opt);
            const isCorrect = result && String(optText).trim().toLowerCase() === String(result.correct_answer || '').trim().toLowerCase();
            const isSelected = selected === optText;
            return (
              <button key={i} onClick={() => !result && setSelected(optText)} disabled={!!result}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${optStyle(optText)}`}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-100 text-gray-500">{LABELS[i]}</span>
                <span className="text-sm text-gray-800 flex-1">{optText}</span>
                {isCorrect  && <CheckCircle size={14} className="text-green-500 shrink-0" />}
                {isSelected && !isCorrect && result && <XCircle size={14} className="text-red-400 shrink-0" />}
              </button>
            );
          })}
        </div>

        {staticHints.length > 0 && !result && (
          <div className="px-5 pb-4">
            {staticHints.slice(0, shownHints).map((hint, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2">
                <p className="text-xs font-semibold text-amber-700 mb-1">Hint {i + 1}</p>
                <p className="text-xs text-amber-800 leading-relaxed">{hint}</p>
              </div>
            ))}
            {shownHints < staticHints.length && (
              <button onClick={() => setShownHints(s => s + 1)}
                className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium">
                <Lightbulb size={12} />
                {shownHints === 0 ? 'Get a hint' : `Next hint (${staticHints.length - shownHints} remaining)`}
              </button>
            )}
          </div>
        )}

        {result && (
          <>
            <div className={`mx-5 mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs ${
              result.is_correct ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {result.is_correct
                ? <><CheckCircle size={14} /><span className="font-semibold">Correct! Well done.</span></>
                : <><XCircle    size={14} /><span className="font-semibold">Incorrect. See the correct answer above.</span></>}
            </div>
            <div className="mx-5 mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5"><Sparkles size={12} /> AI Explanation</p>
              {explainLoad
                ? <div className="flex items-center gap-2 text-xs text-blue-400"><Loader2 size={12} className="animate-spin" /> Generating explanation…</div>
                : <p className="text-xs text-blue-700 leading-relaxed">{aiExplain || result.explanation || 'No explanation available.'}</p>}
            </div>
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-between z-50">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between">
          <span className="text-sm text-gray-500">{questionNumber} of {totalQuestions}</span>
          <div className="flex items-center gap-2">
            {!result ? (
              <button onClick={handleSubmit} disabled={!selected || submitting}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Checking…' : 'Submit'}
              </button>
            ) : (
              <button onClick={() => onAnswer(result.is_correct)}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
                {questionNumber < totalQuestions ? 'Next Question' : 'Finish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Open Answer (Smart Answers) ───────────────────────────────────────────────
function OpenAnswerQuestion({ question, questionNumber, totalQuestions, dismissed, onDismiss, onNext, onPrev }) {
  const [answer,  setAnswer]  = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAIMarker = async () => {
    if (!answer.trim()) return;
    setLoading(true);
    try {
      const r = await api.post('/ai/explain', {
        question_id:        question.id,
        selected_option_id: null,
        typed_answer:       answer,
      });
      setResult(r.data?.explanation ?? r.explanation ?? 'AI feedback submitted.');
    } catch { setResult('AI marking not available. Continue to next question.'); }
    finally  { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded-full">Question {questionNumber}</span>
        {question.marks && <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-gray-800">{question.marks} Mark(s)</span>}
      </div>
      <div className="px-5 py-4">
        <p className="text-sm font-medium text-gray-900 leading-relaxed">{question.question_text}</p>
      </div>
      {!dismissed && (
        <div className="mx-5 mb-3 bg-gray-900 text-white rounded-xl p-3 flex items-start gap-3">
          <span className="text-xl shrink-0"></span>
          <div className="flex-1">
            <p className="text-xs leading-relaxed">Upon submission, you'll receive a detailed analysis of your answer and personalised feedback to help you improve! </p>
          </div>
          <button onClick={onDismiss} className="text-gray-400 hover:text-white text-lg shrink-0">×</button>
        </div>
      )}
      <div className="px-5 pb-4">
        <div className="relative">
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer here"
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-400 min-h-[120px]" />
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white hover:bg-purple-600"><Upload size={12} /></button>
            <button className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600"><Sigma size={12} /></button>
          </div>
        </div>
        {result && (
          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1"><Sparkles size={12} /> AI Feedback</p>
            <p className="text-xs text-blue-700 leading-relaxed">{result}</p>
          </div>
        )}
      </div>
      <div className="px-5 pb-5 flex items-center gap-3">
        {onPrev && <button onClick={onPrev} className="border-2 border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50">← Prev</button>}
        <button onClick={result ? onNext : handleAIMarker} disabled={loading || (!result && !answer.trim())}
          className="flex-1 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin" />}
          {result ? 'Next Question' : loading ? 'Marking…' : 'AI Marker '}
        </button>
        <span className="text-xs text-gray-400 shrink-0">{questionNumber} of {totalQuestions}</span>
      </div>
    </div>
  );
}

// ─── Structured Question ───────────────────────────────────────────────────────
function StructuredQuestion({ question, questionNumber, totalQuestions, onNext, onPrev }) {
  const [answers, setAnswers] = useState({});
  const parts = question.sub_parts || [{ label: '(i)', text: question.question_text, marks: question.marks || 3 }];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded-full">Question {questionNumber}</span>
        {question.difficulty && <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-red-500">{question.difficulty.toUpperCase()}</span>}
        {question.marks && <span className="text-xs text-white font-bold px-2.5 py-1 rounded-full bg-gray-800">{question.marks} Mark(s)</span>}
      </div>
      {question.stem && <div className="px-5 py-3 text-xs text-gray-600 leading-relaxed bg-gray-50 mx-5 mt-3 rounded-xl">{question.stem}</div>}
      <div className="px-5 py-4 space-y-5">
        {parts.map((part, i) => (
          <div key={i}>
            <div className="flex items-start gap-3 mb-2">
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md shrink-0">{part.label}</span>
              <p className="text-sm text-gray-800 flex-1 leading-relaxed">{part.text}</p>
              <span className="text-xs text-gray-400 shrink-0">{part.marks} Mark(s)</span>
            </div>
            <div className="relative">
              <textarea value={answers[i] || ''} onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                placeholder="Type your answer here ..." className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-blue-400 min-h-[100px]" />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white"><Upload size={10} /></button>
                <button className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white"><Sigma size={10} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-5 flex items-center gap-3">
        {onPrev && <button onClick={onPrev} className="border-2 border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-gray-50">← Prev</button>}
        <button onClick={onNext} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm">Submit</button>
        <span className="text-xs text-gray-400 shrink-0">{questionNumber} of {totalQuestions}</span>
      </div>
    </div>
  );
}

// ─── Practice Completion Card ──────────────────────────────────────────────────
function CompletionCard({ score, total, onTakeQuiz, onRetry }) {
  const pct = Math.round((score / total) * 100);
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-8 text-center">
      <div className="text-4xl mb-3"></div>
      <h3 className="text-lg font-bold blue-600 mb-2">Keep Going, You're Almost There!</h3>
      <p className="text-sm text-gray-600 mb-1">
        Nice job!  Now, take the quiz and get{' '}
        <span className="text-blue-600 font-medium">detailed feedback</span> on every answer with our{' '}
        <span className="text-blue-600 font-medium">AI-powered marking scheme</span>. Let's level up! 
      </p>
      <p className="text-xs text-gray-400 mb-6">Score: {score}/{total} ({pct}%)</p>
      <button onClick={onTakeQuiz}
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors">
        Take me to Quiz
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SUBTOPIC PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function SubtopicPage() {
  const { subtopicId }  = useParams();
  const [searchParams]  = useSearchParams();
  const { user }        = useAuth();
  const navigate        = useNavigate();

  const [subtopic,  setSubtopic]  = useState(null);
  const [adjacent,  setAdjacent]  = useState({ previous: null, next: null });
  const [progress,  setProgress]  = useState({ resources_completed: false, practice_completed: false, quiz_completed: false });
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'resources');

  useEffect(() => {
    if (!subtopicId) return;
    setLoading(true);
    Promise.all([
      api.get(`/subtopics/${subtopicId}`),
      api.get(`/subtopics/${subtopicId}/adjacent`),
    ])
      .then(([subRes, adjRes]) => {
        setSubtopic(subRes.data);
        setAdjacent(adjRes.data || { previous: null, next: null });
      })
      .catch(err => console.error('SubtopicPage load error:', err))
      .finally(() => setLoading(false));
  }, [subtopicId]);

  useEffect(() => {
    if (!user || !subtopicId) return;
    api.get(`/subtopic-progress/${subtopicId}`)
      .then(r => { if (r.success) setProgress(r.data); })
      .catch(() => {});
  }, [user, subtopicId]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const handleTabComplete = (task) => {
    setProgress(p => ({ ...p, [`${task}_completed`]: true }));
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50"><TopNav />
      <div className="flex justify-center pt-24"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
    </div>
  );

  const isQuizTab     = activeTab === 'quiz';
  const subtopicName  = subtopic?.name            || 'Subtopic';
  const subjectName   = subtopic?.subject_name    || '';
  const topicName     = subtopic?.topic_name      || '';
  const examBoardName = subtopic?.exam_board_name || '';

  return (
    <div className={`min-h-screen ${isQuizTab ? 'bg-[#0a4a3f]' : 'bg-gray-50'}`}>
      <TopNav />
      <div className="max-w-3xl mx-auto px-4 pt-3 pb-0">
        <button onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2 transition-colors">
          <ArrowLeft size={13} /> Back
        </button>
      </div>

      <div className={`sticky top-14 z-40 border-b ${isQuizTab ? 'bg-[#0a4a3f] border-white/10' : 'bg-white border-gray-100'}`}>
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm font-semibold truncate max-w-[150px] ${isQuizTab ? 'text-white' : 'text-gray-800'}`}>
              {subtopicName.length > 20 ? subtopicName.slice(0, 20) + '...' : subtopicName}
            </span>
            <button onClick={() => adjacent.previous && navigate(`/student/subtopic/${adjacent.previous.id}?tab=${activeTab}`)}
              disabled={!adjacent.previous}
              className={`p-1 rounded-md transition-colors ${adjacent.previous ? 'hover:bg-gray-100 text-gray-500' : 'text-gray-300 cursor-not-allowed'} ${isQuizTab ? 'text-white/60 hover:bg-white/10' : ''}`}>
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => adjacent.next && navigate(`/student/subtopic/${adjacent.next.id}?tab=${activeTab}`)}
              disabled={!adjacent.next}
              className={`p-1 rounded-md transition-colors ${adjacent.next ? 'hover:bg-gray-100 text-gray-500' : 'text-gray-300 cursor-not-allowed'} ${isQuizTab ? 'text-white/60 hover:bg-white/10' : ''}`}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-1 flex-1 justify-center">
            {[
              { id: 'resources', label: 'Resources',          icon: BookOpen,   key: 'resources_completed' },
              { id: 'practice',  label: 'Practice Questions', icon: HelpCircle, key: 'practice_completed'  },
              { id: 'quiz',      label: 'Quiz',               icon: FileText,   key: 'quiz_completed'      },
            ].map(tab => {
              const done     = progress[tab.key];
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    isActive
                      ? isQuizTab ? 'text-white border-b-2 border-white' : 'text-gray-900 border-b-2 border-gray-900'
                      : isQuizTab ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-gray-600'
                  }`}>
                  <TabDot completed={done} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>

          <div className={`flex items-center gap-1.5 shrink-0 text-xs ${isQuizTab ? 'text-white/70' : 'text-gray-400'}`}>
            <div className={`w-5 h-5 rounded-full border-2 ${isQuizTab ? 'border-white/50' : 'border-gray-300'}`} />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="font-semibold">
                {[progress.resources_completed, progress.practice_completed, progress.quiz_completed].filter(Boolean).length * 33}% Complete
              </span>
              <span>
                {3 - [progress.resources_completed, progress.practice_completed, progress.quiz_completed].filter(Boolean).length} tasks remaining
              </span>
            </div>
          </div>
        </div>
      </div>

      {!isQuizTab && (
        <div className="max-w-3xl mx-auto px-4 pt-3">
          <nav className="flex items-center gap-1 text-xs text-gray-400 flex-wrap">
            <Link to="/student/dashboard" className="hover:text-blue-600">Home</Link>
            <span>›</span><span>{examBoardName}</span>
            <span>›</span><span>{subjectName}</span>
            <span>›</span><span>{topicName}</span>
            <span>›</span><span className="text-blue-600 font-medium">{subtopicName}</span>
          </nav>
        </div>
      )}

      <div className={`max-w-3xl mx-auto px-4 ${isQuizTab ? 'py-6' : 'py-5'}`}>
        {activeTab === 'resources' && (
          <ResourcesTab subtopicId={subtopicId} subtopic={subtopic} subtopicName={subtopicName} onComplete={handleTabComplete} />
        )}
        {activeTab === 'practice' && (
          <PracticeTab subtopicId={subtopicId} subjectId={subtopic?.subject_id} onComplete={handleTabComplete} />
        )}
        {activeTab === 'quiz' && (
          <QuizTab subtopicId={subtopicId} subtopic={subtopic} onQuizComplete={() => handleTabComplete('quiz')} />
        )}
      </div>

      <AIChatWidget subjectName={subjectName} subtopicName={subtopicName} />
    </div>
  );
}
