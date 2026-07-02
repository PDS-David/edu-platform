// client/src/pages/em/TabBar.jsx
// Practice/Progress tab switcher — extracted from EnglishMasterclass.jsx
// (Task 7) to keep the orchestrator file thin. No logic or visual changes
// from the original inline TabBar.

import { Play, TrendingUp } from 'lucide-react';

const TABS = [
  { id: 'practice', label: 'Practice',    icon: Play       },
  { id: 'progress', label: 'My Progress', icon: TrendingUp },
];

export default function TabBar({ activeTab, onSelect }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {TABS.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            activeTab === t.id
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <t.icon size={13} aria-hidden="true" />
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
