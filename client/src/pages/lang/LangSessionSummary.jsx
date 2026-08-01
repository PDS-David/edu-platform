// client/src/pages/lang/LangSessionSummary.jsx
// Same shape as em/SessionSummary.jsx — score tiles + per-word breakdown —
// parameterized by language and themed with meta.accent instead of the
// fixed indigo/purple gradient English Masterclass uses, consistent with
// the rest of this folder (LangPracticeSession, LangPronunciationCheck,
// etc. all key their accent colour off LANGUAGE_META).
//
// `result` is built by LangPracticeSession.jsx's handleNext/finishSession:
// { totalWords, correctWords, scores, attempts }. `attempts` is the new
// piece (word_id, word, correct, pronunciation_score, listening_correct,
// listening_answer, writing_score) — older callers that only pass
// totalWords/correctWords still render fine, just without the per-word
// list and extra tiles, since everything below guards on attempts being
// present.

import { Check, CheckCircle2, XCircle, RotateCcw, LayoutGrid } from 'lucide-react';
import { LANGUAGE_META } from './constants';

export default function LangSessionSummary({ language, result, onPracticeAgain, onBackToLevels }) {
  const meta = LANGUAGE_META[language];
  const { totalWords, correctWords, attempts } = result;
  const accuracy = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;
  const hasAttempts = Array.isArray(attempts) && attempts.length > 0;

  // Only show a Listening/Writing tile if the student actually attempted
  // that exercise on at least one word this session — same "don't show a
  // tile for an exercise nobody touched" rule as English Masterclass's
  // pronunciation tile.
  const listeningAttempted = hasAttempts && attempts.some(a => a.listening_correct !== null && a.listening_correct !== undefined);
  const listeningCorrectCount = listeningAttempted ? attempts.filter(a => a.listening_correct === true).length : null;

  const writingScores = hasAttempts ? attempts.map(a => a.writing_score).filter(s => typeof s === 'number') : [];
  const avgWriting = writingScores.length ? Math.round(writingScores.reduce((s, v) => s + v, 0) / writingScores.length) : null;

  const tiles = [
    { label: 'Words', value: totalWords },
    { label: 'Correct', value: correctWords },
    { label: 'Accuracy', value: `${accuracy}%` },
    ...(listeningAttempted ? [{ label: 'Listening', value: `${listeningCorrectCount}/${totalWords}` }] : []),
    ...(avgWriting !== null ? [{ label: 'Writing', value: `${avgWriting}%` }] : []),
  ];

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="text-center mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: meta.accentSoft }}
          >
            <Check size={28} style={{ color: meta.accent }} aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Practice complete!</h2>
          <p className="text-sm text-gray-500">
            {accuracy >= 80 ? 'Excellent work!' : accuracy >= 60 ? 'Good effort — keep going!' : 'Every word practised is progress!'}
          </p>
        </div>

        <div className={`grid gap-3 mb-6 ${tiles.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
          {tiles.map(t => (
            <div key={t.label} className="rounded-xl p-3 text-center" style={{ background: meta.accentSoft }}>
              <div className="text-2xl font-bold" style={{ color: meta.accent }}>{t.value}</div>
              <div className="text-[11px] font-medium mt-0.5" style={{ color: meta.accent }}>{t.label}</div>
            </div>
          ))}
        </div>

        {hasAttempts && (
          <div className="space-y-2 mb-6">
            {attempts.map((a, i) => (
              <div key={a.word_id ?? i} className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border-2 ${
                a.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 min-w-0 shrink-0">
                  {a.correct ? <CheckCircle2 size={15} className="text-green-500 shrink-0" aria-hidden="true" /> : <XCircle size={15} className="text-red-500 shrink-0" aria-hidden="true" />}
                  {a.word}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0 shrink-0">
                  {typeof a.pronunciation_score === 'number' && <span>🗣 {a.pronunciation_score}%</span>}
                  {typeof a.writing_score === 'number' && <span>✍️ {a.writing_score}%</span>}
                  {a.listening_correct === false && (
                    <span className="truncate">{a.listening_answer ? `heard: "${a.listening_answer}"` : 'listening skipped'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onPracticeAgain}
            className="flex-1 flex items-center justify-center gap-1.5 text-white py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: meta.accent }}
          >
            <RotateCcw size={14} /> Practice again
          </button>
          <button
            type="button"
            onClick={onBackToLevels}
            className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all"
          >
            <LayoutGrid size={14} /> All levels
          </button>
        </div>
      </div>
    </div>
  );
}
