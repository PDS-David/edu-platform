// client/src/pages/em/PracticeSession.jsx
// Extracted from EnglishMasterclass.jsx (Task 7/8).
//
// Change from the original: the internal "← Levels" back-navigation header
// has been removed. Back navigation is now the parent's responsibility —
// the standalone route's sticky header always shows "← Dashboard", and the
// embedded /em/practice route (inside EMLayout) provides its own exit link.
// This component now only renders the practice UI itself.
//
// API calls / grading / scoring logic: UNTOUCHED from the original.

import { useState, useRef } from 'react';
import api from '../../services/apiClient';
import {
  Volume2, CheckCircle2, XCircle, Loader2, SkipForward,
  Info, BookOpen, Star, Sparkles,
} from 'lucide-react';
import DiffBadge from './DiffBadge';
import useAudio from './useAudio';
import PronunciationCheck from './PronunciationCheck';
import WritingCheck from './WritingCheck';

// Soft, session-wide cap on scored speaking attempts. Each one is a Gemini
// call, so this bounds the cost of a single practice session regardless of
// how many times a student re-records a given word. "Soft" — once used up,
// the mic exercise just stops offering new scored attempts; typing answers,
// skipping, and everything else keeps working normally.
const PRON_SESSION_BUDGET = 15;
// Same idea for the writing exercise — separate budget, separate Gemini call.
const WRITING_SESSION_BUDGET = 15;

export default function PracticeSession({ cat, words, onComplete }) {
  const [currentIdx, setCurrentIdx]         = useState(0);
  const [input, setInput]                   = useState('');
  const [attempts, setAttempts]             = useState([]);
  const [feedback, setFeedback]             = useState(null);
  const [explanation, setExplanation]       = useState(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [showExplain, setShowExplain]       = useState(false);
  const [sessionStart]                      = useState(Date.now());
  const { playing, play }                   = useAudio();
  const inputRef                            = useRef(null);
  // word_id -> latest pronunciation score (0-100). Speaking practice is
  // optional per word, so words the student never records for simply have
  // no entry here — see the pronunciation_score fallback below.
  const pronScoresRef                       = useRef({});
  // Session-wide soft cap bookkeeping (see PRON_SESSION_BUDGET above).
  const [pronAttemptsUsed, setPronAttemptsUsed] = useState(0);
  // Same pattern for the writing exercise (see WRITING_SESSION_BUDGET above).
  const writingScoresRef                        = useRef({});
  const [writingAttemptsUsed, setWritingAttemptsUsed] = useState(0);

  const currentWord = words[currentIdx];
  const progress    = (currentIdx / words.length) * 100;

  const fetchExplanation = async (word) => {
    if (explanation?.word === word) { setShowExplain(true); return; }
    setLoadingExplain(true);
    setShowExplain(true);
    try {
      const r = await api.post('/english-masterclass/word-explain', {
        word,
        context: cat?.name,
        word_id: currentWord?.id || null,
      });
      setExplanation({ word, ...r.data });
    } catch {
      setExplanation({ word, error: true });
    } finally {
      setLoadingExplain(false);
    }
  };

  const advance = (newAttempts) => {
    setFeedback(null);
    setShowExplain(false);
    setExplanation(null);
    setInput('');
    if (currentIdx < words.length - 1) {
      setCurrentIdx(i => i + 1);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      onComplete(newAttempts, Math.round((Date.now() - sessionStart) / 1000));
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!currentWord) return;
    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'wrong');
    const newAttempts = [...attempts, {
      word_id: currentWord.id, word: currentWord.word, correct: isCorrect, userAnswer: input.trim(),
      pronunciation_score: pronScoresRef.current[currentWord.id] ?? null,
      writing_score: writingScoresRef.current[currentWord.id] ?? null,
    }];
    setAttempts(newAttempts);
    setTimeout(() => advance(newAttempts), 900);
  };

  const handleSkip = () => {
    const newAttempts = [...attempts, {
      word_id: currentWord.id, word: currentWord.word, correct: false, userAnswer: '',
      pronunciation_score: pronScoresRef.current[currentWord.id] ?? null,
      writing_score: writingScoresRef.current[currentWord.id] ?? null,
    }];
    setAttempts(newAttempts);
    setShowExplain(false);
    setExplanation(null);
    setInput('');
    advance(newAttempts);
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Category context (no back link — parent shell owns navigation) */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-medium text-gray-700">{cat?.name}</span>
        <DiffBadge level={cat?.difficulty} />
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-500">Word {currentIdx + 1} of {words.length}</span>
          <span className="text-xs font-semibold text-indigo-600">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Practice card */}
      <div className={`bg-white rounded-2xl border-2 shadow-sm p-6 transition-all duration-300 ${
        feedback === 'correct' ? 'border-green-400 bg-green-50'
        : feedback === 'wrong'   ? 'border-red-400 bg-red-50'
        : 'border-gray-100'
      }`}>
        <p className="text-center text-sm font-semibold text-gray-500 mb-6 uppercase tracking-wider">
          🇬🇧 Listen and type what you hear
        </p>

        <div className="flex justify-center mb-8">
          <button onClick={() => play(currentWord.word)} disabled={playing}
            aria-label="Listen to pronunciation"
            className={`w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
              playing ? 'scale-95 opacity-80' : 'hover:scale-105 hover:shadow-xl'
            }`}>
            <Volume2 size={32} className={playing ? 'animate-pulse' : ''} aria-hidden="true" />
            <span className="text-[10px] font-semibold opacity-80">{playing ? 'Playing…' : 'Listen'}</span>
          </button>
        </div>

        {currentWord.phonetic && (
          <p className="text-center text-sm text-gray-400 italic mb-1">{currentWord.phonetic}</p>
        )}

        {/* Speaking practice — the mic-based pronunciation exercise. Kept in
           this same card (not a separate card/page) with its own reset key
           per word so it doesn't carry state across words. */}
        <PronunciationCheck
          key={`pron-${currentWord.id}`}
          word={currentWord.word}
          wordId={currentWord.id}
          attemptsUsed={pronAttemptsUsed}
          budget={PRON_SESSION_BUDGET}
          onAttempt={() => setPronAttemptsUsed(n => n + 1)}
          onResult={(score) => { pronScoresRef.current[currentWord.id] = score; }}
        />

        {/* Writing practice — same card, same per-word reset pattern. */}
        <WritingCheck
          key={`write-${currentWord.id}`}
          word={currentWord.word}
          wordId={currentWord.id}
          attemptsUsed={writingAttemptsUsed}
          budget={WRITING_SESSION_BUDGET}
          onAttempt={() => setWritingAttemptsUsed(n => n + 1)}
          onResult={(score) => { writingScoresRef.current[currentWord.id] = score; }}
        />

        <div className="mt-2" />

        {feedback && (
          <div className={`flex items-center justify-center gap-2 py-3 rounded-xl mb-4 ${
            feedback === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {feedback === 'correct'
              ? <><CheckCircle2 size={18} aria-hidden="true" /> <span className="font-bold">Correct!</span></>
              : <><XCircle size={18} aria-hidden="true" /> <span className="font-bold">The word was: {currentWord.word}</span></>}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="practice-input" className="sr-only">Type the word you heard</label>
          <input ref={inputRef} id="practice-input" type="text" value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type what you heard…"
            disabled={!!feedback}
            autoFocus
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all mb-4"
          />
          <div className="flex gap-3">
            <button type="submit" disabled={!input.trim() || !!feedback}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm">
              Submit
            </button>
            <button type="button" onClick={handleSkip} disabled={!!feedback}
              className="flex items-center gap-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all disabled:opacity-40">
              <SkipForward size={14} aria-hidden="true" /> Skip
            </button>
          </div>
        </form>
      </div>

      {/* AI Explain */}
      <div className="mt-4 flex justify-center">
        <button onClick={() => fetchExplanation(currentWord.word)}
          className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">
          <Sparkles size={12} aria-hidden="true" /> Ask AI to explain this word
        </button>
      </div>

      {showExplain && (
        <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          {loadingExplain ? (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Asking AI…
            </div>
          ) : explanation?.error ? (
            <p className="text-sm text-red-500">Could not load explanation. Please try again.</p>
          ) : explanation ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-gray-700"><span className="font-semibold">Definition:</span> {explanation.definition}</p>
              </div>
              <div className="flex items-start gap-2">
                <BookOpen size={14} className="text-indigo-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-gray-700"><span className="font-semibold">Example:</span> <em>{explanation.example_sentence}</em></p>
              </div>
              {explanation.usage_tip && (
                <div className="flex items-start gap-2">
                  <Star size={14} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-gray-700"><span className="font-semibold">Tip:</span> {explanation.usage_tip}</p>
                </div>
              )}
              {explanation.regional_note && explanation.regional_note !== 'null' && (
                <div className="flex items-start gap-2">
                  <span className="text-sm shrink-0" aria-hidden="true">🌍</span>
                  <p className="text-gray-600 text-xs">{explanation.regional_note}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Recent attempts mini log */}
      {attempts.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-gray-400 mb-2 font-medium">Recent attempts</p>
          <div className="space-y-1.5">
            {attempts.slice(-3).map((a, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                a.correct ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {a.correct ? <CheckCircle2 size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
                <span>{a.word}</span>
                {!a.correct && a.userAnswer && <span className="text-gray-400 ml-auto">you typed: {a.userAnswer}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
