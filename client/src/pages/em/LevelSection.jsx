// client/src/pages/em/LevelSection.jsx
// Renders one difficulty tier — a header with the difficulty badge, then
// either a grid of category cards (unlocked) or a LevelGate (locked).
//
// Props:
//   level            {string}   — 'Beginner' | 'Intermediate' | 'Advanced'
//   categories       {Array}    — filtered list for this difficulty
//   unlocked         {boolean}  — whether the tier is accessible
//   categoryProgress {object}   — map of category_id → { best_accuracy, session_count }
//   onStart          {function} — called with the category object when user clicks a card
//   loadingId        {any}      — id of the category currently loading words (shows spinner)

import { CheckCircle2, Loader2, ChevronRight } from 'lucide-react';
import DiffBadge, { DIFF_STYLE }               from './DiffBadge';
import LevelGate                                from './LevelGate';

// Gradient classes — static strings, Tailwind-purge-safe
const GLOW = {
  Beginner:     'from-emerald-500 to-teal-500',
  Intermediate: 'from-blue-500 to-indigo-500',
  Advanced:     'from-purple-500 to-fuchsia-500',
};

// Accuracy badge colours — static, purge-safe
function AccuracyBadge({ best }) {
  if (best === null) return null;
  const cls =
    best >= 80 ? 'bg-emerald-100 text-emerald-700'
    : best >= 60 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-600';
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      Best {Math.round(best)}%
    </span>
  );
}

export default function LevelSection({
  level,
  categories,
  unlocked,
  categoryProgress,
  onStart,
  loadingId,
}) {
  const s    = DIFF_STYLE[level] || DIFF_STYLE.Beginner;
  const glow = GLOW[level]       || GLOW.Beginner;

  const reqMap = { Intermediate: 'Beginner', Advanced: 'Intermediate' };

  return (
    <div className="mb-10">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${s.badge}`}>
          {s.label}
        </span>
        {unlocked && (
          <>
            <CheckCircle2 size={14} className="text-emerald-500" aria-hidden="true" />
            <span className="text-xs text-gray-400">Unlocked</span>
          </>
        )}
      </div>

      {/* Locked gate */}
      {!unlocked && (
        <LevelGate level={level} requiredLevel={reqMap[level]} />
      )}

      {/* Unlocked — category grid */}
      {unlocked && categories.length === 0 && (
        <p className="text-sm text-gray-400 italic">No categories available yet.</p>
      )}

      {unlocked && categories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => {
            const prog      = categoryProgress?.[cat.id];
            const best      = prog?.best_accuracy ?? null;
            const isLoading = loadingId === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => onStart(cat)}
                disabled={isLoading}
                aria-label={`Start ${cat.name} practice`}
                className="group text-left bg-white border border-gray-100 rounded-2xl p-5
                           shadow-sm hover:shadow-md hover:border-indigo-200
                           transition-all disabled:opacity-60
                           focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {/* Card top row */}
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl" aria-hidden="true">
                    {cat.icon_emoji || '📚'}
                  </span>
                  {isLoading ? (
                    <Loader2
                      size={16}
                      className="animate-spin text-indigo-400"
                      aria-label="Loading words…"
                    />
                  ) : (
                    <AccuracyBadge best={best} /> || <DiffBadge level={cat.difficulty} />
                  )}
                </div>

                {/* Name + description */}
                <h3 className="font-bold text-gray-900 text-sm mb-1">{cat.name}</h3>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed line-clamp-2">
                  {cat.description}
                </p>

                {/* Accuracy progress bar */}
                {best !== null && (
                  <div className="mb-3">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${glow}`}
                        style={{ width: `${Math.min(best, 100)}%` }}
                        role="progressbar"
                        aria-valuenow={Math.round(best)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${cat.name} best accuracy`}
                      />
                    </div>
                  </div>
                )}

                {/* Footer row */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{cat.word_count} words</span>
                  <span
                    className="text-xs font-semibold text-indigo-600
                               group-hover:translate-x-1 transition-transform
                               flex items-center gap-1"
                  >
                    {best !== null ? 'Practice again' : 'Start'}
                    <ChevronRight size={12} aria-hidden="true" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
