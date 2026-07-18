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
// Logic / auth / API calls: untouched.

import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, BookOpen, TrendingUp, LogOut,
  Menu, X,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const sheetRef = useRef(null);

  const handleLogout = async () => {
    await logout();
    navigate('/em/login', { replace: true });
  };

  // Close mobile sheet on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', handler);
    // Prevent body scroll while sheet is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

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
            aria-label="English Masterclass — go to dashboard"
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
                  name is the primary bold line, not "English Masterclass" —
                  that was competing with the school's own name/logo for
                  prominence, which is exactly backwards for a tenant
                  school's own students. Role + product badges take the
                  secondary line, same as the admin view. */}
              <p
                className="font-bold text-sm tracking-wide text-white truncate max-w-[10rem]"
                style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
              >
                {user?.school?.name || 'English Masterclass'}
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

          {/* ── Desktop nav links ────────────────────────────────────────────── */}
          <nav
            className="hidden md:flex items-center gap-1"
            aria-label="English Masterclass navigation"
          >
            {NAV_LINKS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  // Active: white text + 2px Sovereign-500 bottom border (per spec).
                  // Inactive: Sovereign-200 text, hover white. No background fills.
                  `flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors rounded-t-lg
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60
                  ${isActive
                    ? 'text-white border-b-2'
                    : 'text-white/60 hover:text-white border-b-2 border-transparent'
                  }`
                }
                style={({ isActive }) =>
                  isActive ? { borderBottomColor: SOVEREIGN[500] } : {}
                }
              >
                <Icon size={14} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

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

            {/* Sign out */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs font-medium transition-colors rounded px-2 py-1
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{ color: SOVEREIGN[300] }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={e => (e.currentTarget.style.color = SOVEREIGN[300])}
              aria-label="Sign out of English Masterclass"
            >
              <LogOut size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg transition-colors text-white/60 hover:text-white hover:bg-white/10
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              aria-controls="em-mobile-nav"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom sheet ──────────────────────────────────────────────── */}
      {/* Backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      {/* Sheet */}
      <div
        id="em-mobile-nav"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`
          fixed bottom-0 left-0 right-0 z-50 md:hidden
          rounded-t-3xl transition-transform duration-300 ease-out
          ${menuOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
        style={{ background: SOVEREIGN[800], maxHeight: '80vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" aria-hidden="true" />
        </div>

        {/* Close button */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: SOVEREIGN[500] }}
              aria-hidden="true"
            >
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{firstName}</p>
              <p className="text-xs" style={{ color: SOVEREIGN[300] }}>
                {user?.school?.name || 'English Masterclass'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Close navigation menu"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Nav items — 56px min-height touch targets */}
        <nav className="px-3 py-2 overflow-y-auto" aria-label="Mobile navigation">
          {NAV_LINKS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-4 rounded-xl text-sm font-semibold transition-colors mb-1
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60
                 ${isActive
                   ? 'bg-white/15 text-white'
                   : 'text-white/60 hover:text-white hover:bg-white/10'
                 }`
              }
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Divider + Sign out */}
        <div className="border-t border-white/10 px-3 py-3">
          <button
            onClick={() => { setMenuOpen(false); handleLogout(); }}
            className="flex items-center gap-3 px-4 py-4 rounded-xl text-sm font-semibold w-full text-left
                       text-white/60 hover:text-white hover:bg-white/10 transition-colors
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <LogOut size={18} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        className="py-4 text-center text-[11px]"
        style={{ background: SOVEREIGN[950], color: `${SOVEREIGN[300]}88` }}
      >
        English Masterclass &nbsp;·&nbsp; Educational Advancement Centre &nbsp;·&nbsp;
        Pronoia Digital Services &nbsp;·&nbsp; +234 810 755 1000
      </footer>
    </div>
  );
}
