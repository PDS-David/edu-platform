// client/src/pages/lang/LangPracticeSession.jsx
// Practice flow for one category's words. Mirrors English Masterclass's
// left-panel exercise structure (Pronunciation / Listening / Writing).
// Pronunciation Assessment and Listening Comprehension are functional —
// see the file-level note in languageMasterclassRoutes.js for the backend
// side (listening needs no dedicated backend route beyond /audio; it's
// checked client-side the same way English Masterclass's PracticeSession.jsx
// checks its listening/spelling step). Written Composition is still visible
// (so the intended structure/order is clear) but always shows the
// ComingSoon placeholder — writing-score is gated server-side by
// languages.supports_writing, which isn't set for French/German yet.
//
// Listening is NOT required to advance to the next word (see the "Next
// word" button below, still gated on pronDone only) — it can be attempted
// or skipped freely via its own tab, same freeform-tab spirit as the rest
// of this page. English Masterclass's PracticeSession.jsx enforces a
// stricter locked order where all three exercises are mandatory; that
// wasn't carried over here so as not to change this page's existing
// completion requirements as a side effect of enabling this exercise.

import { useState, useEffect } from 'react';
import { Mic, Headphones, PenLine, Check, ChevronRight, Volume2, Loader2 } from 'lucide-react';
import api from '../../services/apiClient';
import { useLangAudio } from './useLangAudio';
import LangPronunciationCheck from './LangPronunciationCheck';
import ComingSoon from './ComingSoon';
import { LANGUAGE_META } from './constants';

const EXERCISES = [
  { key: 'pronunciation', label: 'Pronunciation Assessment', icon: Mic },
  { key: 'listening',     label: 'Listening Comprehension',  icon: Headphones },
  { key: 'writing',       label: 'Written Composition',      icon: PenLine },
];

export default function LangPracticeSession({ language, category, words, onComplete }) {
  const meta = LANGUAGE_META[language];
  const { playing, play } = useLangAudio(language);

  const [idx, setIdx] = useState(0);
  const [activeExercise, setActiveExercise] = useState('pronunciation');
  const [pronDone, setPronDone] = useState(false);
  const [pronScore, setPronScore] = useState(null);
  const [scores, setScores] = useState([]); // per-word pronunciation scores this session
  const [listeningInput, setListeningInput] = useState('');
  const [listeningFeedback, setListeningFeedback] = useState(null); // null | 'correct' | 'wrong'
  const [listeningDone, setListeningDone] = useState(false);

  const currentWord = words[idx];

  // Reset per-word state whenever we move to a new word.
  useEffect(() => {
    setActiveExercise('pronunciation');
    setPronDone(false);
    setPronScore(null);
    setListeningInput('');
    setListeningFeedback(null);
    setListeningDone(false);
  }, [idx]);

  if (!currentWord) return null;

  const handlePronResult = (score) => {
    setPronScore(score);
    setPronDone(true);
  };

  // Same shape as English Masterclass's listening/spelling step
  // (em/PracticeSession.jsx handleSubmit/handleSkip): a one-shot text-match
  // check against the word's own spelling, no backend call needed.
  const handleListeningSubmit = (e) => {
    e?.preventDefault();
    const isCorrect = listeningInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setListeningFeedback(isCorrect ? 'correct' : 'wrong');
    setListeningDone(true);
  };

  const handleListeningSkip = () => {
    setListeningInput('');
    setListeningFeedback('wrong');
    setListeningDone(true);
  };

  const finishSession = async (finalScores) => {
    const totalWords = words.length;
    const correctWords = finalScores.filter(s => s >= 70).length;
    try {
      await api.post(`/language-masterclass/${language}/sessions`, {
        category_id: category.id,
        difficulty: category.difficulty,
        total_words: totalWords,
        correct_words: correctWords,
      });
    } catch {
      // session save is best-effort — don't block the summary screen on it
    }
    onComplete?.({ totalWords, correctWords, scores: finalScores });
  };

  const handleNext = () => {
    const nextScores = [...scores, pronScore ?? 0];
    setScores(nextScores);
    if (idx + 1 < words.length) {
      setIdx(idx + 1);
    } else {
      finishSession(nextScores);
    }
  };

  return (
    <div className="max-w-4xl mx-auto grid md:grid-cols-[220px_1fr] gap-4">
      {/* Left panel — exercise list, same structure as English Masterclass */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 h-fit">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
          Word {idx + 1} of {words.length}
        </p>
        {EXERCISES.map(ex => {
          const Icon = ex.icon;
          const isActive = activeExercise === ex.key;
          const isDone = ex.key === 'pronunciation' ? pronDone
            : ex.key === 'listening' ? listeningDone
            : false;
          return (
            <button
              key={ex.key}
              onClick={() => setActiveExercise(ex.key)}
              className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mb-1 ${
                isActive ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={isActive ? { background: meta.accent } : undefined}
            >
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              <span className="flex-1">{ex.label}</span>
              {isDone && <Check size={14} className={isActive ? 'text-white' : 'text-emerald-500'} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* Main panel */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        {activeExercise === 'pronunciation' && (
          <>
            <div className="text-center mb-4" dir={meta.isRtl ? 'rtl' : 'ltr'}>
              <p className="text-3xl font-bold text-gray-900 mb-1">{currentWord.word}</p>
              {currentWord.phonetic && <p className="text-sm text-gray-400 mb-2" dir="ltr">{currentWord.phonetic}</p>}
              <button
                type="button"
                onClick={() => play(currentWord.word)}
                disabled={playing}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
                style={{ color: meta.accent, borderColor: meta.accentSoft }}
              >
                {playing ? <Loader2 size={15} className="animate-spin" /> : <Volume2 size={15} />}
                {playing ? 'Playing…' : 'Listen'}
              </button>
              {currentWord.definition && (
                <p className="text-sm text-gray-500 mt-3" dir="ltr">{currentWord.definition}</p>
              )}
              {currentWord.example_sentence && (
                <p className="text-xs text-gray-400 italic mt-1">"{currentWord.example_sentence}"</p>
              )}
            </div>

            <LangPronunciationCheck
              key={`${language}-${currentWord.id}`}
              language={language}
              word={currentWord.word}
              wordId={currentWord.id}
              onResult={handlePronResult}
            />

            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={handleNext}
                disabled={!pronDone}
                className="flex items-center gap-1.5 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-opacity disabled:opacity-40"
                style={{ background: meta.accent }}
              >
                {idx + 1 < words.length ? 'Next word' : 'Finish session'} <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}

        {activeExercise === 'listening' && (
          <div>
            <p className="text-center text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wider">
              Listening Comprehension
            </p>
            <p className="text-center text-xs text-gray-400 mb-4">
              Listen, then type the {meta.short} word you heard.
            </p>

            <div className="flex justify-center mb-4">
              <button
                type="button"
                onClick={() => play(currentWord.word)}
                disabled={playing}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
                style={{ color: meta.accent, borderColor: meta.accentSoft }}
              >
                {playing ? <Loader2 size={15} className="animate-spin" /> : <Volume2 size={15} />}
                {playing ? 'Playing…' : 'Listen'}
              </button>
            </div>

            {listeningFeedback && (
              <div className={`flex items-center justify-center gap-2 py-3 rounded-xl mb-4 ${
                listeningFeedback === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {listeningFeedback === 'correct'
                  ? <><Check size={16} aria-hidden="true" /> <span className="font-bold">Correct!</span></>
                  : <span className="font-bold">The word was: {currentWord.word}</span>}
              </div>
            )}

            <form onSubmit={handleListeningSubmit} className="max-w-xs mx-auto">
              <label htmlFor={`listening-input-${currentWord.id}`} className="sr-only">
                Type the {meta.short} word you heard
              </label>
              <input
                id={`listening-input-${currentWord.id}`}
                type="text"
                value={listeningInput}
                onChange={e => setListeningInput(e.target.value)}
                placeholder="Type what you heard…"
                disabled={!!listeningFeedback}
                autoComplete="off"
                dir={meta.isRtl ? 'rtl' : 'ltr'}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base text-center focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all mb-4 disabled:bg-gray-50"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={!listeningInput.trim() || !!listeningFeedback}
                  className="flex-1 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-40 transition-opacity"
                  style={{ background: meta.accent }}
                >
                  Submit
                </button>
                <button
                  type="button"
                  onClick={handleListeningSkip}
                  disabled={!!listeningFeedback}
                  className="flex items-center gap-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all disabled:opacity-40"
                >
                  Skip
                </button>
              </div>
            </form>
          </div>
        )}

        {activeExercise === 'writing' && (
          <ComingSoon
            title="Written Composition"
            description={`This exercise isn't built yet. It will ask you to write your own ${meta.short} sentences using the word.`}
            accent={meta.accent}
          />
        )}
      </div>
    </div>
  );
}
