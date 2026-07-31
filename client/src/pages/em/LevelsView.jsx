// client/src/pages/em/LevelsView.jsx
// The "levels" view of the Practice tab — welcome banner (first-time users),
// 3-tile level-progress strip, and the Beginner/Intermediate/Advanced
// LevelSection list. Extracted from EnglishMasterclass.jsx (Task 7) to keep
// the orchestrator file thin. No logic changes — this is purely the
// presentational block that was previously inline in the `view === 'levels'`
// branch of Content().

import LevelSection from './LevelSection';

// Level-tile gradient glow — DIFF_STYLE (DiffBadge.jsx) only carries badge/label
// colours, not gradients, so this mirrors the local GLOW map already used by
// LevelSection.jsx and LevelGate.jsx for consistency.
const GLOW = {
  Beginner:     'from-emerald-500 to-teal-500',
  Intermediate: 'from-blue-500 to-indigo-500',
  Advanced:     'from-purple-500 to-fuchsia-500',
};

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

export default function LevelsView({ levelProgress, byDiff, onStart, loadingCatId }) {
  const hasAnyProgress = Object.values(levelProgress?.category_progress || {}).length > 0;

  return (
    <div>
      {levelProgress && !hasAnyProgress && (
        <div className="mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
          <h2 className="text-xl font-bold mb-1">Welcome to Language Masterclass 🎓</h2>
          <p className="text-sm text-indigo-100 leading-relaxed">
            Master English vocabulary step by step. Start with <span className="font-semibold">Beginner</span> categories below.
            Answer 30 questions at 70% accuracy or higher to unlock the next level!
          </p>
        </div>
      )}

      {levelProgress && hasAnyProgress && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          {DIFFICULTIES.map(d => {
            const unlocked = levelProgress.unlocked?.[d];
            const glow = GLOW[d] || GLOW.Beginner;
            return (
              <div key={d} className={`rounded-xl p-3 text-center border-2 ${unlocked ? `border-transparent bg-gradient-to-br ${glow} text-white shadow-sm` : 'border-dashed border-gray-200 bg-gray-50'}`}>
                <div className="text-lg mb-0.5" aria-hidden="true">{d === 'Beginner' ? '🌱' : d === 'Intermediate' ? '🔥' : '⚡'}</div>
                <div className={`text-xs font-bold ${unlocked ? 'text-white' : 'text-gray-400'}`}>{d}</div>
                <div className={`text-[10px] mt-0.5 ${unlocked ? 'text-white/80' : 'text-gray-400'}`}>{unlocked ? 'Unlocked' : 'Locked'}</div>
              </div>
            );
          })}
        </div>
      )}

      {DIFFICULTIES.map(diff => (
        <LevelSection
          key={diff}
          level={diff}
          categories={byDiff[diff]}
          unlocked={levelProgress?.unlocked?.[diff] ?? (diff === 'Beginner')}
          categoryProgress={levelProgress?.category_progress}
          levelDetail={levelProgress?.level_detail}
          onStart={onStart}
          loadingId={loadingCatId}
        />
      ))}
    </div>
  );
}
