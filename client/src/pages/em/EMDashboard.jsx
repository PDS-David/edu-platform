// client/src/pages/em/EMDashboard.jsx
// English Masterclass — dedicated dashboard page (/em/dashboard).
// Shows: welcome hero, live stats, level unlock status, quick-start cards,
// and recent session log. Completely independent of the student dashboard.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/apiClient';
import {
  BookOpen, Flame, Target, Star, TrendingUp, Clock,
  Play, ChevronRight, Loader2, AlertCircle, Lock,
  CheckCircle2, Award, RefreshCw,
} from 'lucide-react';

// ── Brand tokens ─────────────────────────────────────────────────────────────
const NAVY  = '#0d1b3e';
const GOLD  = '#c8a84b';
const GOLD2 = '#e6c96d';

// ── Level styling ─────────────────────────────────────────────────────────────
const LEVEL = {
  Beginner:     { emoji: '🌱', from: 'from-emerald-500', to: 'to-teal-500',    badge: 'bg-emerald-100 text-emerald-700' },
  Intermediate: { emoji: '🔥', from: 'from-blue-500',    to: 'to-indigo-500',  badge: 'bg-blue-100 text-blue-700'       },
  Advanced:     { emoji: '⚡', from: 'from-purple-500',  to: 'to-fuchsia-500', badge: 'bg-purple-100 text-purple-700'   },
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, colour }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-${colour}-50 shrink-0`}>
        <Icon size={20} className={`text-${colour}-500`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Level badge ───────────────────────────────────────────────────────────────
function LevelBadge({ name, unlocked }) {
  const s = LEVEL[name];
  return (
    <div
      className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all ${
        unlocked
          ? 'border-transparent shadow-sm'
          : 'border-dashed border-gray-200 bg-gray-50 opacity-60'
      }`}
      style={unlocked ? { background: `linear-gradient(135deg, ${NAVY} 0%, #1e3a6e 100%)` } : {}}
    >
      <span className="text-2xl">{s.emoji}</span>
      <p className={`text-xs font-bold ${unlocked ? 'text-white' : 'text-gray-400'}`}>{name}</p>
      {unlocked
        ? <span className="text-[10px] font-semibold text-yellow-300 flex items-center gap-1"><CheckCircle2 size={10} /> Unlocked</span>
        : <Lock size={12} className="text-gray-400" />
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function EMDashboard() {
  const { user } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/english-masterclass/progress'),
      api.get('/english-masterclass/level-progress'),
      api.get('/english-masterclass/categories'),
    ])
      .then(([progressRes, levelRes, catRes]) => {
        setData({
          progress:      progressRes.data  || {},
          levelProgress: levelRes.data     || {},
          categories:    catRes.data       || [],
        });
      })
      .catch(e => setError(e.message || 'Could not load dashboard data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const firstName = user?.first_name || user?.name?.split(' ')[0] || 'Student';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={26} className="animate-spin mr-3" style={{ color: GOLD }} />
        <span className="text-gray-500 text-sm">Loading your dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-32 gap-3">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-1 text-xs font-semibold hover:underline"
          style={{ color: NAVY }}
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  const { progress, levelProgress, categories } = data;
  const stats           = progress?.stats || {};
  const recentSessions  = progress?.recent_sessions || [];
  const masteredCount   = progress?.mastered_count  || 0;
  const unlocked        = levelProgress?.unlocked   || { Beginner: true, Intermediate: false, Advanced: false };
  const catProgress     = levelProgress?.category_progress || {};
  const hasAnySession   = Object.keys(catProgress).length > 0;

  // Pick 3 featured (unlocked) categories for quick-start
  const featuredCats = categories
    .filter(c => unlocked[c.difficulty])
    .slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* ── Welcome hero ──────────────────────────────────────────────────── */}
      <div
        className="rounded-3xl p-8 relative overflow-hidden shadow-lg"
        style={{ background: `linear-gradient(140deg, ${NAVY} 0%, #1e3a6e 60%, #162040 100%)` }}
      >
        {/* Decorative gold circle */}
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${GOLD}, transparent)`, transform: 'translate(30%,-30%)' }}
        />
        {/* Union Jack mini */}
        <div className="absolute bottom-6 right-8 opacity-10 pointer-events-none">
          <svg viewBox="0 0 80 54" width="80" height="54" xmlns="http://www.w3.org/2000/svg">
            <rect width="80" height="54" rx="4" fill="#012169"/>
            <line x1="0" y1="0" x2="80" y2="54" stroke="white" strokeWidth="10"/>
            <line x1="80" y1="0" x2="0" y2="54" stroke="white" strokeWidth="10"/>
            <line x1="0" y1="0" x2="80" y2="54" stroke="#C8102E" strokeWidth="6"/>
            <line x1="80" y1="0" x2="0" y2="54" stroke="#C8102E" strokeWidth="6"/>
            <rect x="30" y="0" width="20" height="54" fill="white"/>
            <rect x="0" y="17" width="80" height="20" fill="white"/>
            <rect x="33" y="0" width="14" height="54" fill="#C8102E"/>
            <rect x="0" y="20" width="80" height="14" fill="#C8102E"/>
          </svg>
        </div>

        <div className="relative z-10">
          <p className="text-sm font-semibold mb-1" style={{ color: GOLD }}>
            🇬🇧 English Masterclass
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back, {firstName}!
          </h1>
          <p className="text-sm max-w-lg leading-relaxed mb-6" style={{ color: '#9db4d9' }}>
            {hasAnySession
              ? `You've completed ${stats.total_sessions || 0} sessions and learned ${stats.words_learned || 0} British English words. Keep your streak going!`
              : 'Start your British English vocabulary journey. Work through Beginner, Intermediate, and Advanced levels — each unlocking when you score 60% or higher.'}
          </p>
          <Link
            to="/em/practice"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold shadow-md transition-all hover:scale-105"
            style={{ background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD2} 100%)`, color: NAVY }}
          >
            <Play size={15} /> Start Practising
          </Link>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BookOpen}   label="Words Learned"    value={stats.words_learned || 0}                         colour="blue"   />
        <StatCard icon={Star}       label="Mastered"         value={masteredCount}                                     colour="amber"  />
        <StatCard icon={Flame}      label="Day Streak"       value={`${stats.practice_streak || 0}d`}                 colour="orange" />
        <StatCard icon={Target}     label="Overall Accuracy" value={`${Math.round(stats.overall_accuracy || 0)}%`}    colour="green"  />
      </div>

      {/* ── Level unlock status ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">Your Levels</h2>
        <div className="grid grid-cols-3 gap-4">
          {['Beginner', 'Intermediate', 'Advanced'].map(name => (
            <LevelBadge key={name} name={name} unlocked={!!unlocked[name]} />
          ))}
        </div>
        {!unlocked.Intermediate && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            Score ≥ 60% in any Beginner session to unlock Intermediate.
          </p>
        )}
      </div>

      {/* ── Quick-start categories ────────────────────────────────────────── */}
      {featuredCats.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800">Quick Start</h2>
            <Link
              to="/em/practice"
              className="text-xs font-semibold flex items-center gap-1 hover:underline"
              style={{ color: NAVY }}
            >
              All categories <ChevronRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {featuredCats.map(cat => {
              const prog = catProgress[cat.id];
              const best = prog?.best_accuracy ?? null;
              const s    = LEVEL[cat.difficulty];
              return (
                <Link
                  key={cat.id}
                  to="/em/practice"
                  state={{ openCatId: cat.id }}
                  className="group bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{cat.icon_emoji || '📚'}</span>
                    {best !== null
                      ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${best >= 80 ? 'bg-emerald-100 text-emerald-700' : best >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                          Best {Math.round(best)}%
                        </span>
                      : <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{cat.difficulty}</span>
                    }
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{cat.name}</h3>
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{cat.description}</p>
                  {best !== null && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${s.from} ${s.to}`}
                        style={{ width: `${Math.min(best, 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{cat.word_count} words</span>
                    <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      {best !== null ? 'Practice again' : 'Start'} <ChevronRight size={12} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats supplement ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <Clock size={18} className="text-purple-500 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Total Practice Time</p>
            <p className="font-bold text-gray-900">{Math.round((stats.total_practice_secs || 0) / 60)} minutes</p>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <TrendingUp size={18} className="text-indigo-500 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Total Sessions</p>
            <p className="font-bold text-gray-900">{stats.total_sessions || 0}</p>
          </div>
        </div>
      </div>

      {/* ── Recent sessions ───────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Recent Sessions</h3>
          <Link
            to="/em/progress"
            className="text-xs font-semibold flex items-center gap-1 hover:underline"
            style={{ color: NAVY }}
          >
            Full history <ChevronRight size={13} />
          </Link>
        </div>
        {recentSessions.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No sessions yet.</p>
            <p className="text-xs mt-1">
              Head to{' '}
              <Link to="/em/practice" className="font-semibold underline" style={{ color: NAVY }}>Practice</Link>
              {' '}to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSessions.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{s.icon_emoji || '📚'}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.category_name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${s.accuracy >= 80 ? 'text-green-600' : s.accuracy >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                    {Math.round(s.accuracy)}%
                  </p>
                  <p className="text-xs text-gray-400">{s.correct_words}/{s.total_words} words</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Motivational footer strip ─────────────────────────────────────── */}
      {hasAnySession && (
        <div
          className="rounded-2xl p-5 flex items-center gap-4"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1e3a6e 100%)` }}
        >
          <Award size={28} style={{ color: GOLD }} className="shrink-0" />
          <div>
            <p className="font-bold text-white text-sm">
              {stats.practice_streak >= 3
                ? `🔥 ${stats.practice_streak}-day streak! Keep it up!`
                : 'Build a daily habit — practise a little every day.'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#9db4d9' }}>
              Consistent practice is the fastest route to British English fluency.
            </p>
          </div>
          <Link
            to="/em/practice"
            className="ml-auto shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105"
            style={{ background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD2} 100%)`, color: NAVY }}
          >
            Practise Now
          </Link>
        </div>
      )}

    </div>
  );
}
