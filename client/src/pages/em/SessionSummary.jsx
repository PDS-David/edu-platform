// client/src/pages/em/SessionSummary.jsx
// Extracted from EnglishMasterclass.jsx (Task 7/8).
//
// Task 9 fix applied: the original stat tiles used dynamic string
// interpolation — `bg-${s.color}-50` / `text-${s.color}-600` — which
// Tailwind's production purge strips because it only keeps class names it
// can find as complete, literal strings in source. Replaced with a static
// lookup map so every class is written out in full.
//
// Unlock hint removed — the real cumulative 30-question/70%-accuracy check
// now lives server-side (englishMasterclassRoutes.js) and surfaces via the
// LevelUpCelebration modal, not a per-session guess here.

import { CheckCircle2, XCircle } from 'lucide-react';

// Static colour map — fixes the production Tailwind purge bug (Task 9)
const COLOR_CLASSES = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   label: 'text-blue-700'   },
  green:  { bg: 'bg-green-50',  text: 'text-green-600',  label: 'text-green-700'  },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'text-purple-700' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  label: 'text-amber-700'  },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', label: 'text-orange-700' },
};

export default function SessionSummary({ cat, attempts, onPracticeAgain, onBackToLevels }) {
  const correct  = attempts.filter(a => a.correct).length;
  const accuracy = Math.round((correct / attempts.length) * 100);

  // Speaking practice is optional per word — only show a tile for it if the
  // student actually used the mic on at least one word this session.
  const pronScores = attempts.map(a => a.pronunciation_score).filter(s => typeof s === 'number');
  const avgPron = pronScores.length ? Math.round(pronScores.reduce((s, v) => s + v, 0) / pronScores.length) : null;

  const stats = [
    { label: 'Words',    value: attempts.length, color: 'blue'   },
    { label: 'Correct',  value: correct,          color: 'green'  },
    { label: 'Accuracy', value: `${accuracy}%`,   color: 'purple' },
    ...(avgPron !== null ? [{ label: 'Speaking', value: `${avgPron}%`, color: 'amber' }] : []),
  ];

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2" aria-hidden="true">
            {accuracy >= 80 ? '🎉' : accuracy >= 60 ? '👍' : '💪'}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Practice Complete!</h2>
          <p className="text-sm text-gray-500">
            {accuracy >= 80 ? 'Excellent work!' : accuracy >= 60 ? 'Good effort — keep going!' : 'Every word practised is progress!'}
          </p>
        </div>

        <div className={`grid gap-3 mb-6 ${stats.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {stats.map(s => {
            const cls = COLOR_CLASSES[s.color] || COLOR_CLASSES.blue;
            return (
              <div key={s.label} className={`${cls.bg} rounded-xl p-3 text-center`}>
                <div className={`text-2xl font-bold ${cls.text}`}>{s.value}</div>
                <div className={`text-[11px] font-medium ${cls.label} mt-0.5`}>{s.label}</div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 mb-6">
          {attempts.map((a, i) => (
            <div key={i} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 ${
              a.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                {a.correct ? <CheckCircle2 size={15} className="text-green-500" aria-hidden="true" /> : <XCircle size={15} className="text-red-500" aria-hidden="true" />}
                {a.word}
              </div>
              {!a.correct && (
                <span className="text-xs text-gray-500">{a.userAnswer ? `you: "${a.userAnswer}"` : 'skipped'}</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onPracticeAgain}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm">
            Practice Again
          </button>
          <button onClick={onBackToLevels}
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all">
            All Levels
          </button>
        </div>
      </div>
    </div>
  );
}
