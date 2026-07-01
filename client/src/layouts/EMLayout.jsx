// client/src/layouts/EMLayout.jsx
// Shell for all /em/* routes.
//
// Task 3 redesign:
//  - 56px nav bar: "EM" monogram (Fraunces/Crimson), centre NavLinks with
//    bottom-border active indicator, first name + ghost sign-out on right.
//  - Mobile: hamburger (aria-expanded) + bottom sheet (80vh, backdrop,
//    Escape key, body-scroll lock, Sovereign-50/700 active rows).
//  - Footer: full contact line per spec.
//  - Design tokens: Sovereign palette + Crimson-500 accent.
//  - Logic unchanged: same useAuth(), logout(), navigate('/em/login').

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, BookOpen, TrendingUp, LogOut, Menu, X } from 'lucide-react';

// ── Design tokens (Sovereign palette) ────────────────────────────────────────
const S950 = '#0A0F1E'; // nav + footer background
const S800 = '#162045'; // subtle secondary bg
const S700 = '#1D2F6F'; // active text in bottom sheet
const S500 = '#2952C8'; // active bottom-border on desktop nav
const S200 = '#B8C8F4'; // inactive nav text
const S50  = '#F0F4FD'; // active row bg in bottom sheet
const CR500 = '#CF142B'; // Crimson — "EM" monogram

// ── Nav routes ────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { to: '/em/dashboard', label: 'Dashboard',   Icon: LayoutDashboard },
  { to: '/em/practice',  label: 'Practice',    Icon: BookOpen        },
  { to: '/em/progress',  label: 'My Progress', Icon: TrendingUp      },
];

export default function EMLayout() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const location         = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Derived user info ───────────────────────────────────────────────────────
  const firstName = user?.first_name || user?.name?.split(' ')[0] || 'Student';
  const initials  = firstName[0].toUpperCase();

  // ── Close sheet on route change ─────────────────────────────────────────────
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // ── Escape key closes sheet ─────────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // ── Body scroll lock while sheet is open ────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // ── Auth ────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await logout();
    navigate('/em/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: S50 }}>

      {/* ══ NAV BAR — 56px ═══════════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-30"
        style={{ background: S950, height: '56px' }}
      >
        <div
          className="h-full max-w-6xl mx-auto px-4 sm:px-6 flex items-stretch justify-between"
        >

          {/* LEFT — "EM" monogram + wordmark ─────────────────────────────── */}
          <NavLink
            to="/em/dashboard"
            className="flex items-center gap-2.5 shrink-0"
            aria-label="English Masterclass home"
          >
            {/* Monogram: Fraunces, Crimson-500 */}
            <span
              className="font-display font-bold leading-none select-none"
              style={{ fontSize: '22px', color: CR500 }}
            >
              EM
            </span>
            {/* Wordmark: hidden on mobile */}
            <span className="hidden md:block text-white text-sm font-medium tracking-wide">
              English Masterclass
            </span>
          </NavLink>

          {/* CENTRE — desktop nav links (hidden on mobile) ───────────────── */}
          <nav
            className="hidden md:flex items-stretch gap-6"
            aria-label="Main navigation"
          >
            {NAV_LINKS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 text-sm font-medium border-b-2 px-1 transition-colors ${
                    isActive
                      ? 'text-white border-[#2952C8]'
                      : 'border-transparent hover:text-white'
                  }`
                }
                style={({ isActive }) => ({ color: isActive ? '#ffffff' : S200 })}
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* RIGHT — first name + sign out + hamburger ───────────────────── */}
          <div className="flex items-center gap-3 shrink-0">

            {/* First name — hidden on mobile */}
            <span
              className="hidden md:block text-sm"
              style={{ color: S200 }}
            >
              {firstName}
            </span>

            {/* Sign out — desktop ghost button */}
            <button
              type="button"
              onClick={handleLogout}
              className="hidden md:flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: S200 }}
              onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={e => e.currentTarget.style.color = S200}
              aria-label="Sign out"
            >
              <LogOut size={15} />
              Sign out
            </button>

            {/* Hamburger — mobile only */}
            <button
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="em-mobile-sheet"
              onClick={() => setMenuOpen(m => !m)}
              className="md:hidden p-1.5 rounded-md transition-colors"
              style={{ color: S200 }}
              onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={e => e.currentTarget.style.color = S200}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

          </div>
        </div>
      </header>

      {/* ══ MOBILE BOTTOM SHEET ══════════════════════════════════════════════ */}

      {/* Backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(10,15,30,0.55)' }}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sheet */}
      <div
        id="em-mobile-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white rounded-t-2xl shadow-2xl
          transition-transform duration-300 ease-out flex flex-col
          ${menuOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: '80vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: '#D8D8E5' }} />
        </div>

        {/* User row */}
        <div
          className="flex items-center gap-3 px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid #EDEDF5' }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: S700 }}
          >
            {initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{firstName}</p>
            <p className="text-xs" style={{ color: '#8A8A9A' }}>Student</p>
          </div>
        </div>

        {/* Nav rows — 56px tall each */}
        <nav
          className="flex-1 overflow-y-auto px-3 py-2"
          aria-label="Mobile navigation"
        >
          {NAV_LINKS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? '' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
              style={({ isActive }) => ({
                height: '56px',
                background: isActive ? S50 : undefined,
                color:      isActive ? S700 : undefined,
              })}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sign out — pinned at bottom */}
        <div
          className="shrink-0 px-3 pb-8 pt-2"
          style={{ borderTop: '1px solid #EDEDF5' }}
        >
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 w-full rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            style={{ height: '56px' }}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </div>

      {/* ══ PAGE CONTENT ═════════════════════════════════════════════════════ */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer
        className="py-3 text-center text-xs"
        style={{ background: S950, color: S200 + '99' }}
      >
        English Masterclass &nbsp;·&nbsp; AISchoolOnAir &nbsp;·&nbsp;
        Pronoia Digital Services &nbsp;·&nbsp; +234 810 755 1000
      </footer>

    </div>
  );
}
