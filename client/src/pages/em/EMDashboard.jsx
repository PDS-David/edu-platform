// client/src/pages/em/EMDashboard.jsx
// Route: /em/dashboard  (inside EMLayout + EMPrivateRoute)
//
// Task 4 implementation:
//   ✅ Time-of-day personalised greeting
//   ✅ Level progress strip (3 tiles, locked/unlocked from /level-progress API)
//   ✅ Full category grid grouped by difficulty via shared LevelSection
//   ✅ Clicking a category navigates to /em/practice with { category } state
//   ✅ Streak badge (Gold-400 flame) shown when streak ≥ 1
//   ✅ First-time welcome banner (no sessions yet)
//
// Shared components: DiffBadge, LevelGate, LevelSection (from ./em/)
// API calls: unchanged — same endpoints already used by EnglishMasterclass.jsx
// Business logic: none changed

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/apiClient';
import {
  Flame, BookOpen, Target, Star, TrendingUp, Clock,
  Loader2, AlertCircle, RefreshCw, CheckCircle2, Lock,
  Award, Sparkles, PlayCircle,
} from 'lucide-react';
import { SOVEREIGN, CRIMSON, EM_GOLD, SHADOW } from './constants';
import LevelSection from './LevelSection';
import { dedupeCategories } from './categoryUtils';

// ── Time-of-day greeting helper ───────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Stat pill — compact metric in a row ──────────────────────────────────────
// Static class map — avoids dynamic Tailwind interpolation that gets purged.
const STAT_PILL = {
  blue:   { wrap: 'bg-blue-50 border-blue-100',    icon: 'text-blue-500'    },
  green:  { wrap: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-500' },
  amber:  { wrap: 'bg-amber-50 border-amber-100',  icon: 'text-amber-500'   },
  purple: { wrap: 'bg-purple-50 border-purple-100', icon: 'text-purple-500' },
};

function StatPill({ icon: Icon, label, value, colour }) {
  const cls = STAT_PILL[colour] || STAT_PILL.blue;
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${cls.wrap}`}
      style={{ boxShadow: SHADOW.tier1 }}
    >
      <Icon size={18} className={`${cls.icon} shrink-0`} aria-hidden="true" />
      <div>
        <p className="text-lg font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Level tile in the progress strip ─────────────────────────────────────────
const LEVEL_EMOJI = { Beginner: '🌱', Intermediate: '🔥', Advanced: '⚡' };

function LevelTile({ name, unlocked }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-2xl border-2 transition-all select-none"
      style={
        unlocked
          ? {
              background:  SOVEREIGN[500],
              borderColor: 'transparent',
              boxShadow:   SHADOW.tier1,
            }
          : {
              background:  '#f9fafb',
              borderColor: '#e5e7eb',
              borderStyle: 'dashed',
              opacity:      0.65,
            }
      }
      aria-label={`${name} level — ${unlocked ? 'unlocked' : 'locked'}`}
    >
      <span className="text-xl sm:text-2xl" aria-hidden="true">
        {LEVEL_EMOJI[name]}
      </span>
      <p
        className={`text-[11px] sm:text-xs font-bold text-center leading-tight
          ${unlocked ? 'text-white' : 'text-gray-400'}`}
      >
        {name}
      </p>
      {unlocked ? (
        <span className="text-[9px] sm:text-[10px] font-semibold text-white/80 flex items-center gap-0.5">
          <CheckCircle2 size={9} aria-hidden="true" /> Unlocked
        </span>
      ) : (
        <Lock size={11} className="text-gray-400" aria-hidden="true" />
      )}
    </div>
  );
}

// ── Welcome banner — shown only for first-time users (no sessions yet) ────────
function WelcomeBanner({ onStart }) {
  return (
    <div
      className="rounded-3xl p-6 sm:p-8 relative overflow-hidden"
      style={{ background: SOVEREIGN[800], boxShadow: SHADOW.tier2 }}
      role="region"
      aria-label="Welcome to Language Masterclass"
    >
      {/* Decorative sovereign glow */}
      <div
        className="absolute top-0 right-0 w-56 h-56 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${SOVEREIGN[600]}33, transparent)`,
          transform:  'translate(30%,-30%)',
        }}
        aria-hidden="true"
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ background: CRIMSON[500] }}
            aria-hidden="true"
          >
            👑
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: SOVEREIGN[300] }}>
            Welcome to Language Masterclass
          </p>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 leading-tight">
          Your English<br />journey starts here
        </h2>

        <p className="text-sm leading-relaxed mb-6 max-w-md" style={{ color: SOVEREIGN[200] }}>
          Work through <span className="font-semibold text-white">Beginner</span>,{' '}
          <span className="font-semibold text-white">Intermediate</span>, and{' '}
          <span className="font-semibold text-white">Advanced</span> vocabulary categories.
          Score 60% or higher in any session to unlock the next level.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                       text-white transition-all hover:scale-105
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ background: SOVEREIGN[500], boxShadow: '0 2px 8px rgba(41,82,200,0.4)' }}
            onMouseEnter={e => (e.currentTarget.style.background = SOVEREIGN[400])}
            onMouseLeave={e => (e.currentTarget.style.background = SOVEREIGN[500])}
          >
            <Sparkles size={14} aria-hidden="true" /> Begin Beginner Level
          </button>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 mt-5">
          {[
            '🎙️ Real pronunciation audio',
            '🤖 AI word explanations',
            '📈 Progressive level unlock',
            '🔥 Daily streak tracking',
          ].map(f => (
            <span
              key={f}
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{ background: `${SOVEREIGN[700]}66`, color: SOVEREIGN[200] }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── How It Works modal — always reachable (unlike WelcomeBanner, which only
// ever shows once). Explains the mechanics everyone needs, plus a distinct
// section for tenant-school students naming their school and spelling out
// what's expected of them, since they may have been placed here by their
// school rather than having chosen to sign up themselves. ───────────────────
function HowItWorksModal({ school, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,15,30,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-it-works-heading"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: SHADOW.tier2 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between mb-4">
            <h2 id="how-it-works-heading" className="text-lg font-bold text-gray-900">
              How Language Masterclass works
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>

          {school?.name && (
            <div
              className="rounded-2xl px-4 py-3 mb-5 text-sm"
              style={{ background: `${SOVEREIGN[500]}0d`, border: `1px solid ${SOVEREIGN[500]}33` }}
            >
              <p className="font-bold" style={{ color: SOVEREIGN[700] }}>
                🏫 You're enrolled through {school.name}
              </p>
              <p className="text-gray-600 mt-1.5 leading-relaxed">
                What's expected of you:
              </p>
              <ul className="text-gray-600 mt-1 space-y-1 list-disc pl-4 leading-relaxed">
                <li>Practise categories regularly — your school can see your progress and streak.</li>
                <li>Score at least 60% in a session to count it as passed for that category.</li>
                <li>Work through levels in order: Beginner → Intermediate → Advanced.</li>
              </ul>
            </div>
          )}

          <ol className="space-y-4 text-sm text-gray-600">
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: SOVEREIGN[500] }}>1</span>
              <div>
                <p className="font-semibold text-gray-900">Pick a category</p>
                <p>Choose any unlocked category from Beginner, Intermediate, or Advanced.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: SOVEREIGN[500] }}>2</span>
              <div>
                <p className="font-semibold text-gray-900">Practise the words</p>
                <p>Listen to real pronunciation audio, answer questions, and get AI explanations when you're unsure.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: SOVEREIGN[500] }}>3</span>
              <div>
                <p className="font-semibold text-gray-900">Score 60%+ to unlock the next level</p>
                <p>Beginner unlocks Intermediate; Intermediate unlocks Advanced. Keep a daily streak to stay sharp.</p>
              </div>
            </li>
          </ol>

          <button
            onClick={onClose}
            className="mt-6 w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01]"
            style={{ background: SOVEREIGN[500] }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Continue learning — hero card for the last-practiced category ────────────
function ContinueLearningCard({ cat, onContinue }) {
  const best = cat._best;
  return (
    <section
      className="bg-white border border-gray-100 rounded-2xl p-5 sm:p-6"
      style={{ boxShadow: SHADOW.tier1 }}
      aria-labelledby="em-continue-heading"
    >
      <h2
        id="em-continue-heading"
        className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4"
      >
        Continue learning
      </h2>
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
          style={{ background: SOVEREIGN[50] }}
          aria-hidden="true"
        >
          {cat.icon_emoji || '📚'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 text-sm truncate">{cat.name}</p>
          <p className="text-xs text-gray-400 mb-2">{cat.word_count} words</p>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-xs">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(best ?? 0, 100)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(best ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${cat.name} progress`}
            />
          </div>
        </div>
        <button
          onClick={() => onContinue(cat)}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold
                     text-white transition-all hover:scale-105
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          style={{ background: SOVEREIGN[500] }}
          onMouseEnter={e => (e.currentTarget.style.background = SOVEREIGN[400])}
          onMouseLeave={e => (e.currentTarget.style.background = SOVEREIGN[500])}
        >
          <PlayCircle size={15} aria-hidden="true" />
          <span className="hidden sm:inline">Continue</span>
        </button>
      </div>
    </section>
  );
}

const DIFF_BADGE = {
  Beginner:     'bg-emerald-100 text-emerald-700',
  Intermediate: 'bg-blue-100 text-blue-700',
  Advanced:     'bg-purple-100 text-purple-700',
};

// ── Recommended for you — horizontal strip of untried/weak categories ────────
function RecommendedStrip({ cats, onStart }) {
  if (!cats.length) return null;
  return (
    <section aria-labelledby="em-recommended-heading">
      <h2
        id="em-recommended-heading"
        className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3"
      >
        Recommended for you
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {cats.map(cat => (
          <button
            key={cat.id}
            onClick={() => onStart(cat)}
            className="shrink-0 w-40 text-left bg-white border border-gray-100 rounded-xl p-4
                       shadow-sm hover:shadow-md hover:border-indigo-200 transition-all
                       focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <span className="text-2xl block mb-2" aria-hidden="true">{cat.icon_emoji || '📚'}</span>
            <p className="font-bold text-gray-900 text-xs mb-0.5 truncate">{cat.name}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${DIFF_BADGE[cat.difficulty] || DIFF_BADGE.Beginner}`}>
              {cat.difficulty}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Streak badge — shown in the greeting row when streak ≥ 1 ─────────────────
function StreakBadge({ count }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
      style={{
        background: `${EM_GOLD[400]}22`,
        color:       EM_GOLD[500],
        border:      `1px solid ${EM_GOLD[400]}44`,
      }}
      aria-label={`${count}-day streak`}
    >
      <Flame size={13} style={{ color: EM_GOLD[400] }} aria-hidden="true" />
      {count} day streak
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function EMDashboard() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // ── Fetch categories + level-progress + stats in parallel ────────────────
  const fetchData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/english-masterclass/categories'),
      api.get('/english-masterclass/level-progress'),
      api.get('/english-masterclass/progress'),
    ])
      .then(([catRes, levelRes, progressRes]) => {
        setData({
          categories:    catRes.data     || [],
          levelProgress: levelRes.data   || {},
          progress:      progressRes.data || {},
        });
      })
      .catch(e => setError(e.message || 'Could not load dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const firstName = user?.first_name || user?.name?.split(' ')[0] || 'there';
  const greeting  = useMemo(() => getGreeting(), []);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-3" role="status">
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: SOVEREIGN[500] }}
          aria-hidden="true"
        />
        <span className="text-gray-500 text-sm">Loading your dashboard…</span>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3" role="alert">
        <AlertCircle size={24} className="text-red-400" aria-hidden="true" />
        <p className="text-red-600 text-sm text-center">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs font-semibold hover:underline
                     focus:outline-none focus-visible:ring-2 rounded px-2 py-1"
          style={{ color: SOVEREIGN[700], '--tw-ring-color': SOVEREIGN[500] }}
        >
          <RefreshCw size={12} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  const { categories, levelProgress, progress } = data;
  const unlocked       = levelProgress?.unlocked          || { Beginner: true, Intermediate: false, Advanced: false };
  const catProgress    = levelProgress?.category_progress || {};
  const stats          = progress?.stats                  || {};
  const recentSessions = progress?.recent_sessions        || [];
  const masteredCount  = progress?.mastered_count         || 0;
  const streak         = stats.practice_streak            || 0;
  const isFirstTimer   = recentSessions.length === 0;

  // Group categories by difficulty — same logic as EnglishMasterclass.jsx
  const byDiff = { Beginner: [], Intermediate: [], Advanced: [] };
  categories.forEach(c => {
    if (byDiff[c.difficulty]) byDiff[c.difficulty].push(c);
  });

  // Deduped flat list — defensive merge for the em_categories duplicate-row
  // bug (see categoryUtils.js). Used to derive "Continue learning" and
  // "Recommended for you" without re-showing the same category repeatedly.
  const mergedCategories = dedupeCategories(categories, catProgress);

  // "Continue learning" — the category from the most recent session.
  // Sessions store category_name denormalised (survives category deletes),
  // so match on name rather than the possibly-stale category_id.
  const lastSession = recentSessions[0];
  const continueCategory = lastSession
    ? mergedCategories.find(c => c.name === lastSession.category_name) || null
    : null;

  // "Recommended for you" — up to 3 unlocked categories the student hasn't
  // continued with, prioritising untried categories, then lowest accuracy.
  const recommended = mergedCategories
    .filter(c => (unlocked[c.difficulty] ?? c.difficulty === 'Beginner'))
    .filter(c => !continueCategory || c.id !== continueCategory.id)
    .sort((a, b) => {
      const aBest = a._best ?? -1;
      const bBest = b._best ?? -1;
      return aBest - bBest; // untried (-1) and weakest first
    })
    .slice(0, 3);

  // Navigate to /em/practice with the selected category in location state
  // EMPractice reads location.state.category and pre-selects it
  const handleStartCategory = (cat) => {
    navigate('/em/practice', { state: { category: cat } });
  };

  // Scroll to the category grid (for Welcome banner CTA)
  const handleBeginFromBanner = () => {
    document.getElementById('em-category-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── Greeting row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
            🎓 Language Masterclass
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
            {greeting}, {firstName}!
          </h1>
          {!isFirstTimer && (
            <p className="text-sm text-gray-500 mt-1">
              {stats.total_sessions
                ? `${stats.total_sessions} session${stats.total_sessions !== 1 ? 's' : ''} · ${stats.words_learned || 0} words learned`
                : 'Ready to practise today?'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Always-accessible instructions — the WelcomeBanner below only
              ever shows once, for a first-timer with zero sessions; after
              that a student (especially one placed here by their school,
              who may not have chosen to sign up themselves) had no way to
              re-check what's expected of them. */}
          <button
            onClick={() => setShowHowItWorks(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                       border transition-colors focus:outline-none focus-visible:ring-2"
            style={{ borderColor: `${SOVEREIGN[500]}44`, color: SOVEREIGN[700], '--tw-ring-color': SOVEREIGN[500] }}
          >
            ℹ️ How this works
          </button>
          {/* Streak badge — Gold-400, only when streak ≥ 1 */}
          {streak >= 1 && <StreakBadge count={streak} />}
        </div>
      </div>

      {showHowItWorks && (
        <HowItWorksModal school={user?.school} onClose={() => setShowHowItWorks(false)} />
      )}

      {/* ── First-time welcome banner ─────────────────────────────────────── */}
      {isFirstTimer && (
        <WelcomeBanner onStart={handleBeginFromBanner} />
      )}

      {/* ── Returning-user hero stats ─────────────────────────────────────── */}
      {!isFirstTimer && (
        <section aria-label="Your statistics">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill
              icon={BookOpen}
              label="Words Learned"
              value={stats.words_learned || 0}
              colour="blue"
            />
            <StatPill
              icon={Star}
              label="Mastered"
              value={masteredCount}
              colour="amber"
            />
            <StatPill
              icon={Target}
              label="Accuracy"
              value={`${Math.round(stats.overall_accuracy || 0)}%`}
              colour="green"
            />
            <StatPill
              icon={TrendingUp}
              label="Sessions"
              value={stats.total_sessions || 0}
              colour="purple"
            />
          </div>
        </section>
      )}

      {/* ── Continue learning ────────────────────────────────────────────── */}
      {!isFirstTimer && continueCategory && (
        <ContinueLearningCard cat={continueCategory} onContinue={handleStartCategory} />
      )}

      {/* ── Recommended for you ──────────────────────────────────────────── */}
      {!isFirstTimer && (
        <RecommendedStrip cats={recommended} onStart={handleStartCategory} />
      )}

      {/* ── Level progress strip ─────────────────────────────────────────── */}
      <section aria-labelledby="em-levels-heading">
        <div className="flex items-center justify-between mb-3">
          <h2
            id="em-levels-heading"
            className="text-sm font-bold text-gray-700 uppercase tracking-wider"
          >
            Your Levels
          </h2>
          {!unlocked.Intermediate && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Answer 30 questions at ≥70% in Beginner to unlock Intermediate
            </span>
          )}
        </div>

        {/* 3-tile strip */}
        <div className="grid grid-cols-3 gap-3">
          {['Beginner', 'Intermediate', 'Advanced'].map(name => (
            <LevelTile key={name} name={name} unlocked={!!unlocked[name]} />
          ))}
        </div>
        {/* Mobile hint */}
        {!unlocked.Intermediate && (
          <p className="text-xs text-gray-400 mt-2 text-center sm:hidden">
            Answer 30 questions at ≥70% in Beginner to unlock Intermediate
          </p>
        )}
      </section>

      {/* ── Full category grid, grouped by difficulty ─────────────────────── */}
      {/* Uses the shared LevelSection component (also used by EnglishMasterclass)  */}
      {/* Clicking a category card navigates to /em/practice with category state   */}
      <section
        id="em-category-grid"
        aria-labelledby="em-categories-heading"
        className="scroll-mt-20"
      >
        <h2
          id="em-categories-heading"
          className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-5"
        >
          Practice by Category
        </h2>

        {['Beginner', 'Intermediate', 'Advanced'].map(diff => (
          <LevelSection
            key={diff}
            level={diff}
            categories={byDiff[diff]}
            unlocked={unlocked[diff] ?? (diff === 'Beginner')}
            categoryProgress={catProgress}
            levelDetail={levelProgress?.level_detail}
            onStart={handleStartCategory}
            loadingId={null}
          />
        ))}
      </section>

      {/* "More Languages (preview)" promo-card section intentionally
          removed -- Da was explicit after live review: "The French and
          German buttons at the bottom of the Language Masterclass page IS
          NOT NEEDED. ALL THAT IS NEEDED TO NAVIGATE INTO THE LANGUAGES IS
          THE DROPDOWN." That dropdown now lives in EMLayout.jsx's header
          (see LanguageDropdown.jsx), reachable from every /em/* page,
          including this one. */}

      {/* ── Recent sessions (returning users) ───────────────────────────── */}
      {!isFirstTimer && recentSessions.length > 0 && (
        <section
          className="bg-white border border-gray-100 rounded-2xl p-5"
          style={{ boxShadow: SHADOW.tier1 }}
          aria-labelledby="em-recent-heading"
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              id="em-recent-heading"
              className="text-sm font-bold text-gray-700 uppercase tracking-wider"
            >
              Recent Sessions
            </h3>
            <button
              onClick={() => navigate('/em/progress')}
              className="text-xs font-semibold hover:underline
                         focus:outline-none focus-visible:ring-2 rounded"
              style={{ color: SOVEREIGN[700], '--tw-ring-color': SOVEREIGN[500] }}
            >
              View all →
            </button>
          </div>
          <ul className="space-y-3" aria-label="Recent practice sessions">
            {recentSessions.slice(0, 4).map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xl shrink-0" aria-hidden="true">{s.icon_emoji || '📚'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.category_name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(s.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short',
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className={`text-sm font-bold ${
                    s.accuracy >= 80
                      ? 'text-emerald-600'
                      : s.accuracy >= 60
                        ? 'text-amber-600'
                        : 'text-red-500'
                  }`}>
                    {Math.round(s.accuracy)}%
                  </p>
                  <p className="text-xs text-gray-400">
                    {s.correct_words}/{s.total_words} words
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Motivational strip (returning users with streak) ────────────── */}
      {!isFirstTimer && streak >= 3 && (
        <div
          className="rounded-2xl p-5 flex items-center gap-4"
          style={{ background: SOVEREIGN[800] }}
          role="complementary"
          aria-label="Streak motivation"
        >
          <Award
            size={26}
            style={{ color: EM_GOLD[400] }}
            className="shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">
              🔥 {streak}-day streak — incredible!
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: SOVEREIGN[200] }}>
              Keep showing up every day to stay ahead.
            </p>
          </div>
          <button
            onClick={() => navigate('/em/practice')}
            className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all
                       hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ background: SOVEREIGN[500] }}
            onMouseEnter={e => (e.currentTarget.style.background = SOVEREIGN[400])}
            onMouseLeave={e => (e.currentTarget.style.background = SOVEREIGN[500])}
          >
            Practise Now
          </button>
        </div>
      )}

    </div>
  );
}
