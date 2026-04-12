// Drop this anywhere in StudentDashboard.jsx:
//   import GamificationBar from '../components/GamificationBar';
//   <GamificationBar />

import { useState, useEffect } from 'react';
import api from '../services/api';
import { Flame, Zap } from 'lucide-react';

const BADGE_META = {
  first_answer:     { emoji: '', label: 'First Answer'  },
  streak_3:         { emoji: '', label: '3-Day Streak'  },
  streak_7:         { emoji: '', label: '7-Day Streak'  },
  streak_30:        { emoji: '', label: '30-Day Streak' },
  accuracy_80:      { emoji: '', label: '80% Accuracy'  },
  quiz_master_10:   { emoji: '', label: 'Quiz Master'   },
  subject_complete: { emoji: '', label: 'Subject Done'  },
};

const ALL_BADGES = Object.keys(BADGE_META);

function xpLevel(xp) {
  if (xp < 100)  return { label: 'Beginner', next: 100,  color: 'bg-gray-400'   };
  if (xp < 500)  return { label: 'Learner',  next: 500,  color: 'bg-blue-500'   };
  if (xp < 2000) return { label: 'Scholar',  next: 2000, color: 'bg-purple-500' };
  return               { label: 'Master',   next: null, color: 'bg-amber-500'  };
}

export default function GamificationBar() {
  // ALL hooks must be declared before any conditional returns
  const [data,   setData]   = useState(null);
  const [earned, setEarned] = useState([]);

  useEffect(() => {
    api.get('/analytics/summary')
      .then(r => setData(r.data))          // FIX: was r.data.data (api.js already unwraps once)
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/analytics/badges')
      .then(r => setEarned((r.data || []).map(b => b.badge_code)))  // FIX: was r.data.data
      .catch(() => {});
  }, []);

  // Early return AFTER all hooks
  if (!data) return null;

  const xp     = data.xp_points        || 0;
  const streak = data.study_streak_days || 0;
  const level  = xpLevel(xp);
  const pct    = level.next ? Math.round((xp / level.next) * 100) : 100;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">

      {/* Streak + XP row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Flame size={16} className={streak > 0 ? 'text-amber-500' : 'text-gray-300'} />
          <span className="text-sm font-bold text-gray-800">{streak}</span>
          <span className="text-xs text-gray-400">day streak</span>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Zap size={12} className="text-amber-500" />
              <span className="text-xs font-semibold text-gray-700">{level.label}</span>
            </div>
            <span className="text-xs text-gray-400">{xp}{level.next ? `/${level.next}` : ''} XP</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${level.color} rounded-full transition-all duration-500`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Badge shelf */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">Badges</p>
        <div className="flex items-center gap-2 flex-wrap">
          {ALL_BADGES.map(code => {
            const meta     = BADGE_META[code];
            const isEarned = earned.includes(code);
            return (
              <div key={code} title={meta.label}
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all ${
                  isEarned
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-gray-50 border border-gray-100 grayscale opacity-30'
                }`}>
                {meta.emoji}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
