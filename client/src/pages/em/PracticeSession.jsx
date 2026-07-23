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
  Info, BookOpen, Star, Sparkles, Headphones, Mic, PenLine, ArrowRight, Lock,
} from 'lucide-react';
import DiffBadge from './DiffBadge';
import useAudio from './useAudio';
import PronunciationCheck from './PronunciationCheck';
import WritingCheck from './WritingCheck';

// Soft, session-wide cap on scored speaking attempts. Each one is a Gemini
// call, so this bounds the cost of a single practice session regardless of
// how many times a student re-records a given word.
//
// IMPORTANT: pronunciation and writing are now REQUIRED for every word (see
// allExercisesDone below) — a flat cap that could be smaller than the
// number of words in the session would leave a student permanently unable
// to finish once exhausted, with no way to advance past whichever word
// they were on. The budget scales with the actual session length instead,
// with headroom for a couple of retries per word, rather than an arbitrary
// fixed number that assumed these were optional.
const ATTEMPTS_PER_WORD_ALLOWANCE = 3;

export default function PracticeSession({ cat, words, onComplete }) {
  const [currentIdx, setCurrentIdx]         = useState(0);
  const [input, setInput]                   = useState('');
  const [attempts, setAttempts]             = useState([]);
  const [pendingAttempts, setPendingAttempts] = useState(null);
  const [feedback, setFeedback]             = useState(null);
  const [explanation, setExplanation]       = useState(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [showExplain, setShowExplain]       = useState(false);
  const [sessionStart]                      = useState(Date.now());
  const { playing, play }                   = useAudio();
  const inputRef                            = useRef(null);
  // Which of the three exercises is currently shown. They were previously
  // all stacked in one card, always visible together, forcing a student
  // through all three at once for every word — separated here so each is
  // its own independent section a student can move between freely.
  const [activeExercise, setActiveExercise] = useState('listening'); // listening | pronunciation | composition
  // word_id -> latest pronunciation score (0-100). Speaking practice is
  // optional per word, so words the student never records for simply have
  // no entry here — see the pronunciation_score fallback below.
  const pronScoresRef                       = useRef({});
  // Session-wide soft cap bookkeeping (see ATTEMPTS_PER_WORD_ALLOWANCE / pronBudget above).
  const [pronAttemptsUsed, setPronAttemptsUsed] = useState(0);
  const [pronDone, setPronDone]             = useState(false);
  // Same pattern for the writing exercise (see writingBudget above).
  const writingScoresRef                        = useRef({});
  const [writingAttemptsUsed, setWritingAttemptsUsed] = useState(0);
  const [writingDone, setWritingDone]                 = useState(false);

  const currentWord = words[currentIdx];
  // Scales with the actual session length — see ATTEMPTS_PER_WORD_ALLOWANCE
  // above for why this can no longer be a flat number.
  const pronBudget    = words.length * ATTEMPTS_PER_WORD_ALLOWANCE;
  const writingBudget = words.length * ATTEMPTS_PER_WORD_ALLOWANCE;
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
    setActiveExercise('listening');
    setPronDone(false);
    setWritingDone(false);
    setPendingAttempts(null);
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
    // Does NOT advance on its own anymore — the word isn't done until
    // pronunciation and writing are graded too. See the "Next Word" button
    // below, which is disabled until all three are complete.
    setPendingAttempts(newAttempts);
  };

  const handleSkip = () => {
    // "Skip" still records the listening exercise as attempted-and-wrong
    // (blank answer) rather than leaving it ungraded entirely — but, same
    // as Submit above, it no longer jumps ahead to the next word by itself.
    // Pronunciation and writing still have to be completed first.
    const newAttempts = [...attempts, {
      word_id: currentWord.id, word: currentWord.word, correct: false, userAnswer: '',
      pronunciation_score: pronScoresRef.current[currentWord.id] ?? null,
      writing_score: writingScoresRef.current[currentWord.id] ?? null,
    }];
    setAttempts(newAttempts);
    setFeedback('wrong');
    setShowExplain(false);
    setExplanation(null);
    setInput('');
    setPendingAttempts(newAttempts);
  };

  // A word is only "done" once all three exercises have been graded — no
  // more moving on after just the listening exercise. Pronunciation and
  // writing scores get attached to the attempt record retroactively (via
  // pendingAttempts) since their scores can land after Submit/Skip already
  // recorded the listening result.
  const allExercisesDone = !!feedback && pronDone && writingDone;

  const handleNextWord = () => {
    if (!allExercisesDone || !pendingAttempts) return;
    // Attach the final pronunciation/writing scores in case either came in
    // after the listening submission was already recorded.
    const finalAttempts = pendingAttempts.map((a, i) =>
      i === pendingAttempts.length - 1
        ? { ...a, pronunciation_score: pronScoresRef.current[currentWord.id] ?? null,
                  writing_score: writingScoresRef.current[currentWord.id] ?? null }
        : a
    );
    advance(finalAttempts);
  };

  // Left-panel exercise definitions. All three are now REQUIRED for every
  // word — a student must be graded on listening (typed spelling),
  // pronunciation (spoken), and composition (used in a sentence) before
  // moving to the next word. This reverses an earlier change that made
  // pronunciation/composition optional and let listening alone advance the
  // word — see handleSubmit/handleSkip/allExercisesDone above.
  const exercises = [
    { id: 'listening',     label: 'Listening Comprehension',   icon: Headphones, done: !!feedback },
    { id: 'pronunciation', label: 'Pronunciation Assessment',  icon: Mic,        done: pronDone },
    { id: 'composition',   label: 'Written Composition',       icon: PenLine,    done: writingDone },
  ];

  return (
    <div className="max-w-4xl mx-auto">
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

      <div className="flex flex-col sm:flex-row gap-5">
        {/* ── Left panel: the three independent exercises ─────────────────── */}
        <nav className="sm:w-56 shrink-0 bg-[#f0ede8] border border-[#e8e4dd] rounded-2xl p-3 space-y-1 h-fit">
          <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">
            Exercises
          </p>
          {exercises.map(ex => {
            const Icon = ex.icon;
            const active = activeExercise === ex.id;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => setActiveExercise(ex.id)}
                aria-current={active ? 'true' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
                  active
                    ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]'
                    : 'text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60'
                }`}
              >
                <Icon size={15} className={active ? 'text-indigo-500' : 'text-[#b5a99a]'} aria-hidden="true" />
                <span className="flex-1">{ex.label}</span>
                {ex.done && <CheckCircle2 size={14} className="text-green-500 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        {/* ── Main panel: only the selected exercise ───────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className={`bg-white rounded-2xl border-2 shadow-sm p-6 transition-all duration-300 ${
            feedback === 'correct' ? 'border-green-400 bg-green-50'
            : feedback === 'wrong'   ? 'border-red-400 bg-red-50'
            : 'border-gray-100'
          }`}>

            {/* Word + phonetic + Listen control are shared context for all
                three exercises (you need to hear the word regardless of
                which one you're doing), so they stay visible above whichever
                section is active rather than being duplicated in each. */}
            <div className="flex justify-center mb-6">
              <button onClick={() => play(currentWord.word)} disabled={playing}
                aria-label="Listen to pronunciation"
                className={`w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                  playing ? 'scale-95 opacity-80' : 'hover:scale-105 hover:shadow-xl'
                }`}>
                <Volume2 size={24} className={playing ? 'animate-pulse' : ''} aria-hidden="true" />
                <span className="text-[9px] font-semibold opacity-80">{playing ? 'Playing…' : 'Listen'}</span>
              </button>
            </div>

            {currentWord.phonetic && (
              <p className="text-center text-sm text-gray-400 italic mb-4">{currentWord.phonetic}</p>
            )}

            {/* ── Listening Comprehension ─────────────────────────────────── */}
            {activeExercise === 'listening' && (
              <div>
                <p className="text-center text-sm font-semibold text-gray-500 mb-6 uppercase tracking-wider">
                  Listening Comprehension
                </p>

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
            )}

            {/* ── Pronunciation Assessment ────────────────────────────────── */}
            {activeExercise === 'pronunciation' && (
              <div>
                <p className="text-center text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                  Pronunciation Assessment
                </p>
                <p className="text-center text-xs text-gray-400 mb-2">Record yourself saying the word for AI feedback — required before you can move on.</p>
                <PronunciationCheck
                  key={`pron-${currentWord.id}`}
                  word={currentWord.word}
                  wordId={currentWord.id}
                  attemptsUsed={pronAttemptsUsed}
                  budget={pronBudget}
                  onAttempt={() => setPronAttemptsUsed(n => n + 1)}
                  onResult={(score) => { pronScoresRef.current[currentWord.id] = score; setPronDone(true); }}
                />
              </div>
            )}

            {/* ── Written Composition ─────────────────────────────────────── */}
            {activeExercise === 'composition' && (
              <div>
                <p className="text-center text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                  Written Composition
                </p>
                <p className="text-center text-xs text-gray-400 mb-2">Write your own sentence using the word for AI feedback — required before you can move on.</p>
                <WritingCheck
                  key={`write-${currentWord.id}`}
                  word={currentWord.word}
                  wordId={currentWord.id}
                  attemptsUsed={writingAttemptsUsed}
                  budget={writingBudget}
                  onAttempt={() => setWritingAttemptsUsed(n => n + 1)}
                  onResult={(score) => { writingScoresRef.current[currentWord.id] = score; setWritingDone(true); }}
                />
              </div>
            )}
          </div>

          {/* ── Word mastery summary + gate to the next word ─────────────────
              Only appears once all three exercises are graded. Shows the
              correct spelling plus both scores in one place, and is the
              ONLY way to move on — there's no other path to the next word,
              matching the requirement that a word must be fully assessed
              before another one is used. */}
          {allExercisesDone ? (
            <div className="mt-5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={18} className="text-emerald-500" aria-hidden="true" />
                <p className="text-sm font-bold text-emerald-800">Word complete — here's how you did</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Correct Spelling</p>
                  <p className="text-sm font-bold text-gray-800">{currentWord.word}</p>
                  <p className={`text-xs mt-0.5 ${feedback === 'correct' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {feedback === 'correct' ? 'You got it right' : 'Review this one'}
                  </p>
                </div>
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Pronunciation</p>
                  <p className="text-sm font-bold text-gray-800">
                    {pronScoresRef.current[currentWord.id] != null ? `${pronScoresRef.current[currentWord.id]}%` : '—'}
                  </p>
                </div>
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Sentence Use</p>
                  <p className="text-sm font-bold text-gray-800">
                    {writingScoresRef.current[currentWord.id] != null ? `${writingScoresRef.current[currentWord.id]}%` : '—'}
                  </p>
                </div>
              </div>
              <button onClick={handleNextWord}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 rounded-xl font-semibold text-sm hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm">
                {currentIdx < words.length - 1 ? 'Next Word' : 'Finish Session'}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (feedback || pronDone || writingDone) ? (
            <div className="mt-5 flex items-center gap-2 justify-center text-xs text-gray-400">
              <Lock size={12} aria-hidden="true" />
              <span>
                Complete{!feedback && ' listening,'}{!pronDone && ' pronunciation,'}{!writingDone && ' composition,'} to move on
              </span>
            </div>
          ) : null}

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
      </div>
    </div>
  );
}
