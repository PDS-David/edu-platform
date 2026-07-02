// client/src/pages/em/LevelSection.jsx
// Renders one difficulty tier — a header with the difficulty badge, then
// either a scannable list of category rows (unlocked) or a LevelGate (locked).
//
// Shared by EMDashboard (dashboard grid) and LevelsView (/em/practice), so
// fixing it here fixes the "wall of near-duplicate cards" everywhere it
// showed up.
//
// Props:
//   level            {string}   — 'Beginner' | 'Intermediate' | 'Advanced'
//   categories       {Array}    — filtered list for this difficulty
//   unlocked         {boolean}  — whether the tier is accessible
//   categoryProgress {object}   — map of category_id → { best_accuracy, session_count }
//   onStart          {function} — called with the category object when user clicks a row
//   loadingId        {any}      — id of the category currently loading words (shows spinner)

import { CheckCircle2, Loader2, ChevronRight } from 'lucide-react';
import { DIFF_STYLE }                           from './DiffBadge';
import LevelGate                                from './LevelGate';
import { dedupeCategories }                     from './categoryUtils';

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
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      Best {Math.round(best)}%
    </span>
  );
}

// A single category row — compact, scannable, one line of primary info
// plus a thin progress bar, instead of a large tile. Designed to stay
// readable even when a difficulty tier has many categories.
function CategoryRow({ cat, glow, isLoading, onStart }) {
  const best = cat._best;

  return (
    <button
      onClick={() => onStart(cat)}
      disabled={isLoading}
      aria-label={`Start ${cat.name} practice`}
      className="group w-full flex items-center gap-4 text-left bg-white border border-gray-100
                 rounded-xl px-4 py-3.5 shadow-sm hover:shadow-md hover:border-indigo-200
                 transition-all disabled:opacity-60
                 focus:outline-none focus:ring-2 focus:ring-indigo-300"
    >
      {/* Icon */}
      <span className="text-2xl shrink-0" aria-hidden="true">
        {cat.icon_emoji || '📚'}
      </span>

      {/* Name + description + progress bar */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-bold text-gray-900 text-sm truncate">{cat.name}</h3>
        </div>
        <p className="text-xs text-gray-500 truncate">{cat.description}</p>
        {best !== null && (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2 max-w-[220px]">
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
        )}
      </div>

      {/* Right-side meta */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-400 hidden sm:inline">{cat.word_count} words</span>
        {isLoading ? (
          <Loader2 size={16} className="animate-spin text-indigo-400" aria-label="Loading words…" />
        ) : (
          <AccuracyBadge best={best} />
        )}
        <span
          className="text-xs font-semibold text-indigo-600 group-hover:translate-x-1
                     transition-transform flex items-center gap-0.5"
        >
          <span className="hidden sm:inline">{best !== null ? 'Practice again' : 'Start'}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </div>
    </button>
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

  // Defensive merge for the em_categories duplicate-row bug — see
  // categoryUtils.js. No-op once production data has been cleaned up.
  const merged = dedupeCategories(categories, categoryProgress);

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
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

      {/* Unlocked — category list */}
      {unlocked && merged.length === 0 && (
        <p className="text-sm text-gray-400 italic">No categories available yet.</p>
      )}

      {unlocked && merged.length > 0 && (
        <div className="space-y-2">
          {merged.map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              glow={glow}
              isLoading={cat._duplicateIds.includes(loadingId)}
              onStart={onStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}
