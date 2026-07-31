// client/src/layouts/EMLayout.jsx
// Shell for all /em/* routes — sticky nav, <Outlet />, footer.
//
// Design system applied (see client/src/pages/em/constants.js):
//   • Header bg:       SOVEREIGN[800] #162045
//   • Active nav:      white text + SOVEREIGN[500] 2-px bottom underline
//   • Inactive nav:    SOVEREIGN[200] text, hover white
//   • Logo icon bg:    CRIMSON[500] #CF142B  (British accent, not gold)
//   • Body bg:         SOVEREIGN[50] #F0F4FD
//   • Footer bg:       SOVEREIGN[950] #0A0F1E
//   • Gold is NOT used here — reserved for rewards/achievements only.
//
// Navigation: the left sidebar below (same visual language as
// PracticeSession.jsx's "Exercises" panel) is the ONE way to move between
// Dashboard/Practice/Progress, on every screen size — it has no "hidden"
// breakpoint classes, so it's the same UI on mobile as on desktop. There
// used to also be a separate mobile hamburger + bottom-sheet menu with the
// same 3 links; removed on request, since having two different UI patterns
// reach the same destinations was exactly the "second way" that wasn't
// wanted. Sign-out remains reachable via the icon button in the header on
// every screen size (it never depended on the removed menu).
//
// Logic / auth / API calls: untouched.

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, BookOpen, TrendingUp, LogOut,
} from 'lucide-react';
import { SOVEREIGN, CRIMSON } from '../pages/em/constants';

const NAV_LINKS = [
  { to: '/em/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/em/practice',  label: 'Practice',  Icon: BookOpen        },
  { to: '/em/progress',  label: 'Progress',  Icon: TrendingUp      },
];

export default function EMLayout() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/em/login', { replace: true });
  };

  const firstName = user?.first_name || user?.name?.split(' ')[0] || 'Student';
  const initials  = firstName[0]?.toUpperCase() || 'S';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: SOVEREIGN[50] }}
    >
      {/* ── Top Nav ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30"
        style={{
          background: SOVEREIGN[800],
          boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(10,15,30,0.24)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

          {/* ── Brand mark ──────────────────────────────────────────────────── */}
          <NavLink
            to="/em/dashboard"
            className="flex items-center gap-2.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-lg"
            aria-label="Language Masterclass — go to dashboard"
          >
            {/* Crown icon (default), or the tenant school's own logo when
                one has been uploaded — same logo+name treatment as the
                school_admin/App Admin dashboards, rather than a text-only
                subtitle here while every other dashboard shows the actual
                logo image. */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 overflow-hidden"
              style={{ background: user?.school?.logo_url ? 'transparent' : CRIMSON[500] }}
              aria-hidden="true"
            >
              {user?.school?.logo_url
                ? <img src={user.school.logo_url} alt="" className="w-full h-full object-cover" />
                : '👑'}
            </div>
            <div className="hidden sm:block leading-none">
              {/* Same hierarchy as SchoolAdminDashboard.jsx's header: school
                  name is the primary bold line, not "Language Masterclass" —
                  that was competing with the school's own name/logo for
                  prominence, which is exactly backwards for a tenant
                  school's own students. Role + product badges take the
                  secondary line, same as the admin view. */}
              <p
                className="font-bold text-sm tracking-wide text-white leading-tight"
                style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
              >
                {user?.school?.name || 'Language Masterclass'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[10px] capitalize" style={{ color: SOVEREIGN[300] }}>
                  {user?.role || 'Student'}
                </p>
                {user?.school?.enable_aischoolonair && (
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-white text-[9px] font-semibold">AISchoolonair</span>
                )}
                {user?.school?.enable_em && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ background: `${SOVEREIGN[500]}55`, color: '#fff' }}>EM</span>
                )}
              </div>
            </div>
          </NavLink>

          {/* Navigation lives in the persistent left sidebar below — the
              one and only place Dashboard/Practice/Progress switching
              happens, on every screen size. */}

          {/* ── Right controls ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Avatar — Sovereign-500 flat (not gold; gold is for rewards only) */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white select-none"
              style={{ background: SOVEREIGN[500] }}
              title={firstName}
              aria-hidden="true"
            >
              {initials}
            </div>

            {/* Sign out — icon-only on narrow screens, icon+label from sm up.
                Reachable on every screen size regardless of the sidebar. */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs font-medium transition-colors rounded px-2 py-1
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{ color: SOVEREIGN[300] }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={e => (e.currentTarget.style.color = SOVEREIGN[300])}
              aria-label="Sign out of Language Masterclass"
            >
              <LogOut size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-5 items-start">
          {/* Left sidebar — same visual language as PracticeSession.jsx's
              "Exercises" panel (cream box, small-caps label, icon+label rows,
              active state), just one level up: this switches between the
              three EM sections instead of between the three exercise types
              within a practice session. Every /em/* page renders through
              this single shared layout, so this one panel covers all of
              them — Dashboard, Practice, and Progress — automatically.
              No "hidden" breakpoint classes: this is the only nav, on every
              screen size, mobile included (stacked full-width above the
              page content via flex-col on narrow screens). */}
          <nav
            className="sm:w-56 shrink-0 bg-[#f0ede8] border border-[#e8e4dd] rounded-2xl p-3 space-y-1 h-fit w-full"
            aria-label="Language Masterclass navigation"
          >
            <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">
              Language Masterclass
            </p>
            {NAV_LINKS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
                    isActive
                      ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]'
                      : 'text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={15} className={isActive ? 'text-indigo-500' : 'text-[#b5a99a]'} aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Whichever EM page is active renders here, to the right of the
              sidebar above — unchanged internally, just no longer full-width
              alone at the top of the page. */}
          <div className="flex-1 min-w-0 w-full">
            <Outlet />
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        className="py-4 text-center text-[11px]"
        style={{ background: SOVEREIGN[950], color: `${SOVEREIGN[300]}88` }}
      >
        Language Masterclass &nbsp;·&nbsp; Educational Advancement Centre &nbsp;·&nbsp;
        Pronoia Digital Services &nbsp;·&nbsp; +234 810 755 1000
      </footer>
    </div>
  );
}
