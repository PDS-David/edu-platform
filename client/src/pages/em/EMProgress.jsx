// client/src/pages/em/EMProgress.jsx
// Route: /em/progress  (inside EMLayout + EMPrivateRoute)
//
// Task 6 implementation:
//   ✅ ProgressTab extracted from EnglishMasterclass.jsx into this file
//   ✅ Retry button on the error state
//   ✅ "Browse levels" CTA in the empty state → navigate('/em/dashboard')
//   ✅ Dynamic Tailwind class purge bug fixed — static STAT_COLOURS map
//   ✅ Design system colours applied (SOVEREIGN, EM_GOLD from constants.js)
//
// Exports:
//   ProgressContent  — named export, the data + display block used by
//                      EnglishMasterclass.jsx as its progress tab
//   default          — the full standalone page (heading + ProgressContent)
//
// API calls / business logic: UNTOUCHED from the original ProgressTab.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/apiClient';
import {
  BookOpen, Star, Flame, Target, Clock, TrendingUp,
  Loader2, AlertCircle, RefreshCw, LayoutDashboard,
} from 'lucide-react';
import { SOVEREIGN, EM_GOLD, SHADOW } from './constants';
import { useAuth } from '../../context/AuthContext';
import PrintReportButton from '../../components/PrintReportButton';
import PrintableReportHeader from '../../components/PrintableReportHeader';

// ── Static colour map — fixes the production Tailwind purge bug ───────────────
// The original code used `text-${s.color}-500` / `bg-${s.color}-50` which are
// dynamic string interpolations. Tailwind's purge step only keeps classes it
// finds as complete strings in source — interpolated names get stripped.
// Every class string here is written out in full so they are always kept.
const STAT_COLOURS = {
  blue:   { iconBg: 'bg-blue-50',    icon: 'text-blue-500',    value: 'text-blue-600'    },
  amber:  { iconBg: 'bg-amber-50',   icon: 'text-amber-500',   value: 'text-amber-600'   },
  orange: { iconBg: 'bg-orange-50',  icon: 'text-orange-500',  value: 'text-orange-600'  },
  green:  { iconBg: 'bg-emerald-50', icon: 'text-emerald-500', value: 'text-emerald-600' },
};

// ── Small stat card ────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, colour }) {
  const cls = STAT_COLOURS[colour] || STAT_COLOURS.blue;
  return (
    <div
      className="bg-white border border-gray-100 rounded-2xl p-4 text-center"
      style={{ boxShadow: SHADOW.tier1 }}
    >
      <div className={`w-9 h-9 rounded-xl ${cls.iconBg} flex items-center justify-center mx-auto mb-2`}>
        <Icon size={18} className={cls.icon} aria-hidden="true" />
      </div>
      <div className={`text-2xl font-bold font-mono ${cls.value}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

// ── Session row ───────────────────────────────────────────────────────────────
function SessionRow({ session }) {
  const { icon_emoji, category_name, created_at, accuracy, correct_words, total_words } = session;
  const accClass =
    accuracy >= 80 ? 'text-emerald-600'
    : accuracy >= 60 ? 'text-amber-600'
    : 'text-red-500';
  const borderColor =
    accuracy >= 80 ? '#0F9B5A'
    : accuracy >= 60 ? '#D97706'
    : '#DC2626';

  return (
    <div
      className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 pl-3"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">{icon_emoji || '📚'}</span>
        <div>
          <p className="text-sm font-semibold text-gray-800">{category_name}</p>
          <p className="text-xs text-gray-400">
            {new Date(created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        <p className={`text-sm font-bold ${accClass}`}>{Math.round(accuracy)}%</p>
        <p className="text-xs text-gray-400">{correct_words}/{total_words} words</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressContent — the actual data-fetching and rendering logic.
// Named export so EnglishMasterclass can import it as its progress tab.
// ─────────────────────────────────────────────────────────────────────────────
export function ProgressContent() {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // ── Unchanged fetch logic from the original ProgressTab ────────────────────
  const fetchProgress = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/english-masterclass/progress')
      .then(r => setData(r.data))
      .catch(e => setError(e.message || 'Could not load progress data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2" role="status">
        <Loader2
          size={22}
          className="animate-spin"
          style={{ color: SOVEREIGN[500] }}
          aria-hidden="true"
        />
        <span className="text-gray-400 text-sm">Loading progress…</span>
      </div>
    );
  }

  // ── Error state — with retry button (Task 6 addition) ─────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3" role="alert">
        <AlertCircle size={24} className="text-red-400" aria-hidden="true" />
        <p className="text-red-600 text-sm text-center max-w-xs">{error}</p>
        <button
          onClick={fetchProgress}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                     text-white transition-all hover:scale-105
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{ background: SOVEREIGN[700] }}
          onMouseEnter={e => (e.currentTarget.style.background = SOVEREIGN[600])}
          onMouseLeave={e => (e.currentTarget.style.background = SOVEREIGN[700])}
        >
          <RefreshCw size={14} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  const { stats, recent_sessions = [], mastered_count = 0 } = data || {};

  // ── Empty state — with "Browse levels" CTA (Task 6 addition) ──────────────
  const hasAnySessions = recent_sessions.length > 0 || (stats?.total_sessions || 0) > 0;

  if (!hasAnySessions) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: SOVEREIGN[50] }}
          aria-hidden="true"
        >
          <BookOpen size={28} style={{ color: SOVEREIGN[400] }} />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-700">No sessions yet</p>
          <p className="text-sm text-gray-400 mt-1 max-w-xs leading-relaxed">
            Complete your first practice session to start tracking your progress.
          </p>
        </div>
        <button
          onClick={() => navigate('/em/dashboard')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                     text-white transition-all hover:scale-105
                     focus:outline-none focus-visible:ring-2"
          style={{
            background:        SOVEREIGN[700],
            '--tw-ring-color': SOVEREIGN[500],
          }}
          onMouseEnter={e => (e.currentTarget.style.background = SOVEREIGN[600])}
          onMouseLeave={e => (e.currentTarget.style.background = SOVEREIGN[700])}
        >
          <LayoutDashboard size={15} aria-hidden="true" /> Browse Levels
        </button>
      </div>
    );
  }

  // ── Populated progress view ────────────────────────────────────────────────
  const studentName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email;

  return (
    <div className="max-w-2xl printable-report">

      <div className="flex items-start justify-between gap-3 mb-2">
        <PrintableReportHeader
          title="English Masterclass Progress Report"
          subtitle={studentName}
        />
        <PrintReportButton className="no-print shrink-0 mt-1" />
      </div>

      {/* Stat cards grid — static colour classes, purge-safe */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={BookOpen}
          label="Words Learned"
          value={stats?.words_learned || 0}
          colour="blue"
        />
        <StatCard
          icon={Star}
          label="Mastered"
          value={mastered_count}
          colour="amber"
        />
        <StatCard
          icon={Flame}
          label="Day Streak"
          value={`${stats?.practice_streak || 0}d`}
          colour="orange"
        />
        <StatCard
          icon={Target}
          label="Accuracy"
          value={`${Math.round(stats?.overall_accuracy || 0)}%`}
          colour="green"
        />
      </div>

      {/* Time + sessions row */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div
          className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3"
          style={{ boxShadow: SHADOW.tier1 }}
        >
          <Clock size={18} className="text-purple-500 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xs text-gray-500">Total Practice Time</p>
            <p className="font-bold text-gray-900">
              {Math.round((stats?.total_practice_secs || 0) / 60)} min
            </p>
          </div>
        </div>
        <div
          className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3"
          style={{ boxShadow: SHADOW.tier1 }}
        >
          <TrendingUp size={18} style={{ color: SOVEREIGN[500] }} className="shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xs text-gray-500">Total Sessions</p>
            <p className="font-bold text-gray-900">{stats?.total_sessions || 0}</p>
          </div>
        </div>
      </div>

      {/* Recent sessions list */}
      <div
        className="bg-white border border-gray-100 rounded-2xl p-5"
        style={{ boxShadow: SHADOW.tier1 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
            Recent Sessions
          </h3>
          <span className="text-xs text-gray-400">
            {recent_sessions.length} session{recent_sessions.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-0">
          {recent_sessions.map((s, i) => (
            <SessionRow key={i} session={s} />
          ))}
        </div>

        {/* Browse more CTA at bottom of list */}
        <div className="mt-4 pt-3 border-t border-gray-50">
          <button
            onClick={() => navigate('/em/dashboard')}
            className="flex items-center gap-1.5 text-xs font-semibold hover:underline
                       focus:outline-none focus-visible:ring-2 rounded"
            style={{ color: SOVEREIGN[700], '--tw-ring-color': SOVEREIGN[500] }}
          >
            <LayoutDashboard size={12} aria-hidden="true" /> Browse more categories
          </button>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export — the full standalone page used by /em/progress
// ─────────────────────────────────────────────────────────────────────────────
export default function EMProgress() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: SOVEREIGN[500] }}
        >
          English Masterclass
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Progress</h1>
      </div>

      <ProgressContent />
    </div>
  );
}
