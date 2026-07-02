// client/src/pages/em/DiffBadge.jsx
// Shared difficulty badge pill — used by LevelSection, LevelGate, EMDashboard,
// and AdminEnglishMasterclass.
//
// Props:
//   level {string} — 'Beginner' | 'Intermediate' | 'Advanced'

// All Tailwind classes are written as complete static strings so they are never
// purged from the production build.
const DIFF_STYLE = {
  Beginner: {
    badge: 'bg-emerald-100 text-emerald-700',
    label: '🌱 Beginner',
  },
  Intermediate: {
    badge: 'bg-blue-100 text-blue-700',
    label: '🔥 Intermediate',
  },
  Advanced: {
    badge: 'bg-purple-100 text-purple-700',
    label: '⚡ Advanced',
  },
};

export { DIFF_STYLE };

export default function DiffBadge({ level }) {
  const s = DIFF_STYLE[level] || DIFF_STYLE.Beginner;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
      {level}
    </span>
  );
}
