// client/src/pages/lang/LangLevelsView.jsx
// Shows the three level tiers and their categories. Beginner has real
// content; Intermediate/Advanced categories exist (so the level structure
// itself is visible) but are always empty and locked — see the file-level
// note in languageMasterclassRoutes.js for why.

import { ChevronRight } from 'lucide-react';
import { LANGUAGE_META, DIFF_STYLE } from './constants';
import LangLevelGate from './LangLevelGate';

const REQUIRED_LEVEL = { Intermediate: 'Beginner', Advanced: 'Intermediate' };

export default function LangLevelsView({ language, categories, unlocked, levelDetail, onStart, loadingCatId }) {
  const meta = LANGUAGE_META[language];
  const byDifficulty = { Beginner: [], Intermediate: [], Advanced: [] };
  categories.forEach(c => { (byDifficulty[c.difficulty] ||= []).push(c); });

  return (
    <div className="space-y-6">
      {['Beginner', 'Intermediate', 'Advanced'].map(diff => {
        const isUnlocked = unlocked?.[diff];
        const diffStyle = DIFF_STYLE[diff];
        const cats = byDifficulty[diff];

        // Locked tiers get the same rich "here's what to do" progress card
        // English Masterclass shows (LangLevelGate, ported from EM's
        // LevelGate.jsx) instead of a grayed-out, unclickable category grid.
        if (!isUnlocked && diff !== 'Beginner') {
          return (
            <div key={diff}>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${diffStyle.badge}`}>{diffStyle.label}</span>
              </div>
              <LangLevelGate
                level={diff}
                requiredLevel={REQUIRED_LEVEL[diff]}
                detail={levelDetail?.[REQUIRED_LEVEL[diff]]}
              />
            </div>
          );
        }

        return (
          <div key={diff}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${diffStyle.badge}`}>{diffStyle.label}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cats.map(cat => {
                const hasWords = Number(cat.word_count) > 0;
                const disabled = !isUnlocked || !hasWords;
                return (
                  <button
                    key={cat.id}
                    onClick={() => !disabled && onStart(cat)}
                    disabled={disabled}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${
                      disabled ? 'border-gray-100 bg-gray-50 cursor-not-allowed' : 'border-gray-200 hover:shadow-md'
                    }`}
                    style={!disabled ? { borderColor: meta.accentSoft } : undefined}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-2xl">{cat.icon_emoji}</span>
                      {loadingCatId === cat.id
                        ? <span className="text-xs text-gray-400">Loading…</span>
                        : !disabled && <ChevronRight size={16} className="text-gray-300" aria-hidden="true" />}
                    </div>
                    <p className={`font-bold text-sm ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{cat.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {hasWords ? `${cat.word_count} words` : cat.description || 'Coming soon'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
