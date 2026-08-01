// client/src/pages/lang/LangWritingCheck.jsx
// Same shape as em/WritingCheck.jsx, parameterized by language and pointed
// at POST /language-masterclass/:language/writing-score instead. That
// route already checks languages.supports_writing server-side (currently
// true for english/french/german — see the file-level note in
// languageMasterclassRoutes.js), so this component doesn't need its own
// support check: if it's mounted for a language that isn't supported yet,
// the backend responds 501 EXERCISE_NOT_SUPPORTED and the existing
// status==='error' branch below surfaces that message same as any other
// failure.

import { useState, useEffect, useMemo } from 'react';
import api from '../../services/apiClient';
import { PenLine, Loader2, RotateCcw } from 'lucide-react';

const scoreStyle = (s) =>
  s >= 80 ? 'text-green-700 bg-green-50 border-green-200'
  : s >= 55 ? 'text-amber-700 bg-amber-50 border-amber-200'
  : 'text-red-700 bg-red-50 border-red-200';

export default function LangWritingCheck({ language, word, wordId, onResult, attemptsUsed = 0, budget = Infinity, onAttempt }) {
  const [text, setText]     = useState('');
  const [status, setStatus] = useState('idle'); // idle | scoring | done | error
  const [result, setResult] = useState(null);

  const budgetLeft      = Math.max(0, budget - attemptsUsed);
  const budgetExhausted = budgetLeft <= 0;

  // Same 3-5 sentence pattern as English Masterclass — stable per word,
  // rerolls when the word changes.
  const sentenceCount = useMemo(() => {
    const pool = [3, 4, 5];
    return pool[Math.floor(Math.random() * pool.length)];
  }, [word]);

  const prompt = sentenceCount === 1
    ? `Write one sentence using the word "${word}".`
    : `Write ${sentenceCount} different sentences using the word "${word}".`;

  // Reset whenever the word changes (new card).
  useEffect(() => {
    setText('');
    setStatus('idle');
    setResult(null);
  }, [word]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!text.trim() || status === 'scoring' || budgetExhausted) return;
    setStatus('scoring');
    onAttempt?.(); // counts against the session budget, like pronunciation
    try {
      const r = await api.post(`/language-masterclass/${language}/writing-score`, {
        word,
        word_id: wordId || null,
        prompt,
        text: text.trim(),
        sentence_count: sentenceCount,
      });
      if (r.data?.success) {
        setResult(r.data);
        setStatus('done');
        onResult?.(r.data.score);
      } else {
        setStatus('error');
        setResult({ error: r.data?.error || 'Could not check that sentence. Please try again.' });
      }
    } catch (err) {
      setStatus('error');
      setResult({ error: err?.response?.data?.error || 'Could not check that sentence. Please try again.' });
    }
  };

  return (
    <div className="mt-4">
      <p className="text-center text-xs text-gray-400 mb-2">{prompt}</p>
      <form
        onSubmit={handleSubmit}
        className={sentenceCount === 1
          ? 'flex items-center gap-2 flex-wrap justify-center'
          : 'flex flex-col items-center gap-2'}
      >
        <label htmlFor={`lang-writing-input-${word}`} className="sr-only">
          Write {sentenceCount === 1 ? 'a sentence' : `${sentenceCount} sentences`} using {word}
        </label>
        {sentenceCount === 1 ? (
          <input
            id={`lang-writing-input-${word}`}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={status === 'scoring' || (budgetExhausted && status !== 'done')}
            placeholder={budgetExhausted ? 'Writing checks used up for this session' : `Use "${word}" in a sentence…`}
            className="flex-1 min-w-[140px] px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        ) : (
          <textarea
            id={`lang-writing-input-${word}`}
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={status === 'scoring' || (budgetExhausted && status !== 'done')}
            placeholder={budgetExhausted
              ? 'Writing checks used up for this session'
              : `Write ${sentenceCount} sentences using "${word}", one per line…`}
            rows={sentenceCount}
            className="w-full max-w-md px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
          />
        )}
        <button
          type="submit"
          disabled={!text.trim() || status === 'scoring' || budgetExhausted}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-white border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:bg-white transition-all shadow-sm"
        >
          {status === 'scoring'
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <PenLine size={16} aria-hidden="true" />}
          {status === 'scoring' ? 'Checking…' : 'Check it'}
        </button>
        {(status === 'done' || status === 'error') && !budgetExhausted && (
          <button
            type="button"
            onClick={() => { setStatus('idle'); setResult(null); setText(''); }}
            aria-label="Try again"
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all"
          >
            <RotateCcw size={14} aria-hidden="true" /> Try again
          </button>
        )}
      </form>

      {status === 'done' && result && (
        <div className={`mt-3 mx-auto max-w-xs text-center border rounded-xl py-2 px-3 ${scoreStyle(result.score)}`}>
          <p className="text-sm font-bold">{result.score}/100</p>
          {result.feedback && <p className="text-xs mt-0.5">{result.feedback}</p>}
          {result.grammar_notes && <p className="text-xs mt-0.5 text-gray-500 italic">{result.grammar_notes}</p>}
        </div>
      )}
      {status === 'error' && result?.error && (
        <p className="text-center text-xs text-red-500 mt-2">{result.error}</p>
      )}
    </div>
  );
}
