// client/src/pages/lang/LangLevelGate.jsx
// Shown in place of a locked difficulty section — ported from English
// Masterclass's pages/em/LevelGate.jsx so French/German get the same
// "here's exactly what to do to unlock this" progress card instead of the
// one-line lock caption LangLevelsView used previously.
//
// Props:
//   level         {string} — 'Intermediate' | 'Advanced'
//   requiredLevel {string} — 'Beginner' | 'Intermediate'
//   detail        {object} — level_detail[requiredLevel] from GET /level-progress:
//                             { questions_answered, questions_required, accuracy, accuracy_required }
//                             Optional — falls back to static copy if not supplied.

import { Lock } from 'lucide-react';
import { DIFF_STYLE } from './constants';

// Gradient classes by difficulty — same static map as EM's LevelGate,
// static strings so Tailwind's purge doesn't drop them.
const GLOW = {
  Beginner:     'from-emerald-500 to-teal-500',
  Intermediate: 'from-blue-500 to-indigo-500',
  Advanced:     'from-purple-500 to-fuchsia-500',
};

export default function LangLevelGate({ level, requiredLevel, detail }) {
  const s    = DIFF_STYLE[level]    || DIFF_STYLE.Beginner;
  const glow = GLOW[level]          || GLOW.Beginner;

  const questionsRequired = detail?.questions_required ?? 30;
  const accuracyRequired  = detail?.accuracy_required ?? 70;
  const questionsAnswered = Math.min(detail?.questions_answered ?? 0, questionsRequired);
  const accuracy          = detail?.accuracy ?? null;
  const questionsPct      = Math.round((questionsAnswered / questionsRequired) * 100);

  return (
    <div
      className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6
                 flex flex-col items-center gap-3 opacity-70 select-none"
      aria-label={`${level} level — locked`}
    >
      <div
        className={`w-14 h-14 rounded-full bg-gradient-to-br ${glow}
                    flex items-center justify-center opacity-30`}
        aria-hidden="true"
      >
        <Lock size={24} className="text-white" />
      </div>

      <p className="font-bold text-gray-500 text-base">{s.label}</p>

      <p className="text-xs text-gray-400 text-center leading-relaxed max-w-xs">
        Answer <span className="font-semibold">{questionsRequired} questions</span> in{' '}
        <span className="font-semibold">{requiredLevel}</span> at{' '}
        {accuracyRequired}% accuracy or higher to unlock this level.
      </p>

      {detail && (
        <div className="w-full max-w-[220px] mt-1">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>{questionsAnswered}/{questionsRequired} questions</span>
            {accuracy !== null && <span>{accuracy}% accuracy</span>}
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${glow}`}
              style={{ width: `${questionsPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
