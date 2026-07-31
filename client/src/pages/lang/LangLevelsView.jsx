// client/src/pages/lang/LangLevelsView.jsx
// Shows the three level tiers and their categories. Beginner has real
// content; Intermediate/Advanced categories exist (so the level structure
// itself is visible) but are always empty and locked — see the file-level
// note in languageMasterclassRoutes.js for why.

import { Lock, ChevronRight } from 'lucide-react';
import { LANGUAGE_META, DIFF_STYLE, QUESTIONS_PER_LEVEL, UNLOCK_ACCURACY } from './constants';

export default function LangLevelsView({ language, categories, unlocked, onStart, loadingCatId }) {
  const meta = LANGUAGE_META[language];
  const byDifficulty = { Beginner: [], Intermediate: [], Advanced: [] };
  categories.forEach(c => { (byDifficulty[c.difficulty] ||= []).push(c); });

  return (
    <div className="space-y-6">
      {['Beginner', 'Intermediate', 'Advanced'].map(diff => {
        const isUnlocked = unlocked?.[diff];
        const diffStyle = DIFF_STYLE[diff];
        const cats = byDifficulty[diff];

        return (
          <div key={diff}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${diffStyle.badge}`}>{diffStyle.label}</span>
              {!isUnlocked && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Lock size={12} aria-hidden="true" />
                  Unlocks after {QUESTIONS_PER_LEVEL} questions at {UNLOCK_ACCURACY}%+ in the level below
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
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
