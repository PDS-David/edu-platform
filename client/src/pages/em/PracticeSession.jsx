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

// Soft cap on scored speaking/writing attempts PER WORD. Each scored
// attempt is a Gemini call, so this still bounds cost — but it resets for
// every word (see advance() below) instead of being a session-wide pool.
//
// IMPORTANT: pronunciation and writing are REQUIRED for every word (see
// allExercisesDone below), so this can never be a shared pool — a shared
// pool means a student who spends heavily on retries for word 2 could
// arrive at word 9 with no budget left and no way to ever complete it,
// permanently stuck on a now-mandatory exercise. A per-word budget that
// resets on every transition guarantees every word gets its own full
// allowance regardless of how any other word went, closing that off
// entirely rather than just making it less likely.
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
  // Which of the three exercises is currently shown. Order is enforced:
  // Pronounce → Type (listening/spelling) → Use in a sentence (composition)
  // — see listeningUnlocked/compositionUnlocked below and the auto-advance
  // in the onResult/handleSubmit/handleSkip callbacks.
  const [activeExercise, setActiveExercise] = useState('pronunciation'); // pronunciation | listening | composition
  // word_id -> latest pronunciation score (0-100). Speaking practice is
  // optional per word, so words the student never records for simply have
  // no entry here — see the pronunciation_score fallback below.
  const pronScoresRef                       = useRef({});
  // Per-word budget bookkeeping (see ATTEMPTS_PER_WORD_ALLOWANCE above) —
  // both reset to 0 in advance() on every word transition, so budgetLeft in
  // PronunciationCheck/WritingCheck always starts fresh per word.
  const [pronAttemptsUsed, setPronAttemptsUsed] = useState(0);
  const [pronDone, setPronDone]             = useState(false);
  // Same pattern for the writing exercise.
  const writingScoresRef                        = useRef({});
  const [writingAttemptsUsed, setWritingAttemptsUsed] = useState(0);
  const [writingDone, setWritingDone]                 = useState(false);

  const currentWord = words[currentIdx];
  // Flat per-word allowance now that the budget resets every word instead
  // of being shared across the whole session — see comment above.
  const pronBudget    = ATTEMPTS_PER_WORD_ALLOWANCE;
  const writingBudget = ATTEMPTS_PER_WORD_ALLOWANCE;
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
    setActiveExercise('pronunciation');
    setPronDone(false);
    setWritingDone(false);
    // Budgets are per-word (see ATTEMPTS_PER_WORD_ALLOWANCE above) — reset
    // the counters here so the next word starts with its own full
    // allowance instead of inheriting whatever was left over.
    setPronAttemptsUsed(0);
    setWritingAttemptsUsed(0);
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
    // Does NOT advance the WORD on its own — the word isn't done until
    // composition is graded too. It does advance the visible EXERCISE
    // panel to step 3 (composition), continuing the enforced order.
    setPendingAttempts(newAttempts);
    setActiveExercise('composition');
  };

  const handleSkip = () => {
    // "Skip" still records the listening exercise as attempted-and-wrong
    // (blank answer) rather than leaving it ungraded entirely — but, same
    // as Submit above, it only advances the exercise panel to composition,
    // not the word itself.
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
    setActiveExercise('composition');
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

  // Left-panel exercise definitions, in the REQUIRED order: pronounce the
  // word, then type it (listening/spelling), then use it in a sentence
  // (composition). All three are mandatory for every word (see
  // allExercisesDone above) — locked below prevents jumping ahead, so a
  // student experiences them in this exact sequence rather than picking
  // freely. Going back to review an already-done earlier step is still
  // allowed (locked only blocks steps that haven't been unlocked yet).
  const listeningUnlocked   = pronDone;
  const compositionUnlocked = pronDone && !!feedback;
  const exercises = [
    { id: 'pronunciation', label: 'Pronunciation Assessment',  icon: Mic,        done: pronDone,    locked: false },
    { id: 'listening',     label: 'Listening Comprehension',   icon: Headphones, done: !!feedback,  locked: !listeningUnlocked },
    { id: 'composition',   label: 'Written Composition',       icon: PenLine,    done: writingDone, locked: !compositionUnlocked },
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
                onClick={() => { if (!ex.locked) setActiveExercise(ex.id); }}
                disabled={ex.locked}
                aria-current={active ? 'true' : undefined}
                aria-disabled={ex.locked || undefined}
                title={ex.locked ? 'Complete the previous step first' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
                  ex.locked
                    ? 'text-[#c9c1b6] cursor-not-allowed'
                    : active
                      ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]'
                      : 'text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60'
                }`}
              >
                <Icon size={15} className={active && !ex.locked ? 'text-indigo-500' : 'text-[#b5a99a]'} aria-hidden="true" />
                <span className="flex-1">{ex.label}</span>
                {ex.done
                  ? <CheckCircle2 size={14} className="text-green-500 shrink-0" aria-hidden="true" />
                  : ex.locked && <Lock size={12} className="text-[#c9c1b6] shrink-0" aria-hidden="true" />}
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

            {/* ── Step 1: Pronunciation Assessment ────────────────────────── */}
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
                  onResult={(score) => {
                    pronScoresRef.current[currentWord.id] = score;
                    setPronDone(true);
                    // Enforced order: once pronunciation is graded, move the
                    // student straight into step 2 (listening/spelling).
                    setActiveExercise('listening');
                  }}
                />
              </div>
            )}

            {/* ── Step 2: Listening Comprehension ─────────────────────────── */}
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

            {/* ── Step 3: Written Composition ─────────────────────────────── */}
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
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Pronunciation</p>
                  <p className="text-sm font-bold text-gray-800">
                    {pronScoresRef.current[currentWord.id] != null ? `${pronScoresRef.current[currentWord.id]}%` : '—'}
                  </p>
                </div>
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Correct Spelling</p>
                  <p className="text-sm font-bold text-gray-800">{currentWord.word}</p>
                  <p className={`text-xs mt-0.5 ${feedback === 'correct' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {feedback === 'correct' ? 'You got it right' : 'Review this one'}
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
                Complete{!pronDone && ' pronunciation,'}{!feedback && ' listening,'}{!writingDone && ' composition,'} to move on
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
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium flex-wrap ${
                    a.correct ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {a.correct ? <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" /> : <XCircle size={12} className="shrink-0" aria-hidden="true" />}
                    <span className="shrink-0">{a.word}</span>
                    {!a.correct && a.userAnswer && <span className="text-gray-400 ml-auto min-w-0 truncate max-w-full">you typed: {a.userAnswer}</span>}
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
