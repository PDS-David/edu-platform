// client/src/layouts/EMLayout.jsx
// Shell for all /em/* routes. Provides:
//   - Sticky navy/gold top nav with EM branding
//   - Nav links: Dashboard | Practice | Progress
//   - User avatar + logout
//   - <Outlet /> for child page content
// Deliberately has NO sidebar, no AISchoolOnAir chrome, no student dashboard links.

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, BookOpen, TrendingUp, LogOut, ExternalLink } from 'lucide-react';

// ── Brand tokens ─────────────────────────────────────────────────────────────
const NAVY   = '#0d1b3e';
const GOLD   = '#c8a84b';
const GOLD2  = '#e6c96d';

const NAV_LINKS = [
  { to: '/em/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/em/practice',  label: 'Practice',  Icon: BookOpen        },
  { to: '/em/progress',  label: 'Progress',  Icon: TrendingUp      },
];

export default function EMLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/em/login', { replace: true });
  };

  const initials = user
    ? `${(user.first_name || user.name || 'U')[0]}`.toUpperCase()
    : 'U';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb' }}>

      {/* ── Top Nav ───────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 shadow-md"
        style={{ background: NAVY }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          {/* Logo */}
          <NavLink to="/em/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD2} 100%)` }}
            >
              👑
            </div>
            <div className="hidden sm:block">
              <p className="font-bold text-white text-sm leading-tight tracking-wide">
                English Masterclass
              </p>
              <p className="text-[10px] tracking-widest" style={{ color: `${GOLD}cc` }}>
                BRITISH ENGLISH TRAINING
              </p>
            </div>
          </NavLink>

          {/* Centre nav links */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? 'text-gray-900 shadow-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD2} 100%)` }
                    : {}
                }
              >
                <Icon size={14} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right: user + escape hatch */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Back to main platform */}
            <NavLink
              to="/student/dashboard"
              className="hidden lg:flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: `${GOLD}aa` }}
            >
              <ExternalLink size={12} />
              AISchoolOnAir
            </NavLink>

            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD2} 100%)`, color: NAVY }}
              title={user?.first_name || user?.name || 'User'}
            >
              {initials}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: '#9db4d9' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={e => e.currentTarget.style.color = '#9db4d9'}
              title="Sign out"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>

        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer
        className="py-4 text-center text-[11px]"
        style={{ background: NAVY, color: `${GOLD}55` }}
      >
        English Masterclass &nbsp;·&nbsp; Powered by{' '}
        <span style={{ color: `${GOLD}88` }}>AISchoolOnAir</span>
      </footer>

    </div>
  );
}
