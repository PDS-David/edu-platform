// client/src/pages/em/EMLoginPage.jsx
// Standalone English Masterclass login page — completely separate from the
// main AISchoolOnAir platform.
//
// Design system applied (see constants.js):
//   • Page bg:       SOVEREIGN[950] → SOVEREIGN[900] gradient
//   • Left panel:    SOVEREIGN[800] solid (not gradient — spec says flat)
//   • Accent bar:    CRIMSON[500] (the designated EM accent colour)
//   • Submit btn:    SOVEREIGN[700] flat, white text (no gold border-bottom)
//   • Input focus:   SOVEREIGN[500] border
//   • Back link:     SOVEREIGN[200] text
//   • Gold NOT used — reserved for rewards/achievements only
//
// Business logic / API calls / auth: UNTOUCHED.

import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { SOVEREIGN, CRIMSON } from './constants';
import branding from '../../config/branding';
import { getPostAuthRedirect } from '../../utils/postAuthRedirect';

export default function EMLoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [closedDoor, setClosedDoor] = useState(null); // { message, otherServiceEnabled }
  const [loading,  setLoading]  = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  // EMPrivateRoute redirects here (rather than rendering a bare login form)
  // when an already-authenticated tenant user's school doesn't have EM
  // enabled — e.g. they followed a link straight to /em/dashboard. Surface
  // the same closed-door messaging immediately, without making them submit
  // the form again.
  useEffect(() => {
    const reason = location.state?.closedDoor;
    if (reason?.service === 'em') {
      setClosedDoor({
        message: 'Your school has not been registered for English Masterclass. Contact your school admin or App Admin.',
        otherServiceEnabled: !!reason.otherServiceEnabled,
      });
      // Clear the state so a manual refresh of /em/login doesn't keep
      // re-showing this after the user has moved past it (e.g. logged out
      // and logged into a different account in the same tab).
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setClosedDoor(null);
    setLoading(true);
    try {
      const user = await login(email, password, false, 'em');
      // AISchoolOnAir login succeeding is not enough — English Masterclass
      // requires its own one-time registration step on top of that account.
      //
      // BUGFIX: this used to send EVERY successful login here straight to
      // /em/dashboard except unregistered students — including school_admin.
      // The backend deliberately allows a school_admin to authenticate
      // through this portal (they're exempt from the aischoolonair gate and
      // still subject to the em one — see server/controllers/auth.js), but
      // that was never meant to land them on a student-facing EM page. A
      // school_admin (and, for the same reason, a teacher or App Admin, if
      // either ever reaches this form) must always land on their own real
      // dashboard, never in the student/study view — getPostAuthRedirect is
      // the single shared source of truth for that mapping, already used by
      // the main /login page.
      if (user?.role === 'student') {
        if (!user?.em_registered_at) {
          navigate('/em/register', { replace: true });
        } else {
          navigate('/em/dashboard', { replace: true });
        }
      } else {
        navigate(getPostAuthRedirect(user), { replace: true });
      }
    } catch (err) {
      const code = err?.raw?.response?.data?.code;
      if (code === 'SERVICE_NOT_ENABLED_FOR_SCHOOL') {
        setClosedDoor({
          message: err?.raw?.response?.data?.error || 'Your school has not been registered for English Masterclass.',
          otherServiceEnabled: !!err?.raw?.response?.data?.other_service_enabled,
        });
      } else {
        const raw = err?.message ?? '';
        setError(typeof raw === 'string' ? raw : (raw?.message || 'Invalid email or password'));
      }
    } finally {
      setLoading(false);
    }
  };

  const isReady = email.trim() && password.trim();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: `linear-gradient(160deg, ${SOVEREIGN[950]} 0%, ${SOVEREIGN[900]} 100%)`,
      }}
    >
      {/* ── Minimal EM top bar ────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Crown icon — CRIMSON[500] (EM accent colour, per design system) */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-sm"
            style={{ background: CRIMSON[500] }}
            aria-hidden="true"
          >
            👑
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight tracking-wide">
              English Masterclass
            </p>
            <p
              className="text-[10px] tracking-widest mt-0.5"
              style={{ color: SOVEREIGN[200] }}
            >
              ENGLISH FLUENCY TRAINING
            </p>
          </div>
        </div>

        <Link
          to="/"
          className="text-xs font-medium transition-colors hover:underline"
          style={{ color: SOVEREIGN[200] }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={e => (e.currentTarget.style.color = SOVEREIGN[200])}
        >
          ← Back to Home Page
        </Link>
      </header>

      {/* ── Two-panel card ────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex"
          style={{ minHeight: '520px' }}
        >
          {/* ── Left branding panel — SOVEREIGN[800] flat background ──────── */}
          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative overflow-hidden"
            style={{ background: SOVEREIGN[800] }}
          >
            {/* Decorative glow — Sovereign tint, not gold (gold = rewards only) */}
            <div
              className="absolute top-0 right-0 w-56 h-56 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${SOVEREIGN[500]}33, transparent)`,
                transform: 'translate(30%,-30%)',
              }}
              aria-hidden="true"
            />
            <div
              className="absolute bottom-0 left-0 w-44 h-44 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${SOVEREIGN[600]}22, transparent)`,
                transform: 'translate(-30%,30%)',
              }}
              aria-hidden="true"
            />

            {/* Crown mark — content/identity mark, not chrome */}
            <div className="mb-8 relative z-10" aria-hidden="true">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
                style={{ background: CRIMSON[500] }}
              >
                👑
              </div>
            </div>

            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4 relative z-10">
              Welcome Back 🎓
            </h1>
            <p
              className="text-sm xl:text-base max-w-xs leading-relaxed relative z-10 mb-6"
              style={{ color: SOVEREIGN[200] }}
            >
              Continue your journey to mastering English vocabulary.
              Progress, streaks and level unlocks are waiting for you.
            </p>

            {/* Feature stat tiles — Sovereign-700 bg, Sovereign-400 border */}
            <div className="grid grid-cols-2 gap-3 relative z-10 w-full max-w-xs">
              {[
                { v: '3 Levels',   l: 'Beginner → Advanced' },
                { v: '🌍',         l: 'English for Everyone' },
                { v: 'AI-Powered', l: 'Word Explanations'    },
                { v: 'TTS Audio',  l: 'Listen & Spell'       },
              ].map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 border"
                  style={{
                    background:   `${SOVEREIGN[700]}55`,
                    borderColor:  `${SOVEREIGN[400]}44`,
                  }}
                >
                  <p
                    className="font-bold text-base leading-none text-white"
                  >
                    {s.v}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: SOVEREIGN[300] }}>
                    {s.l}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right form panel ────────────────────────────────────────────── */}
          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">

              {/* Mobile logo (visible only when left panel is hidden) */}
              <div className="flex md:hidden items-center justify-center gap-2 mb-6">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                  style={{ background: CRIMSON[500] }}
                  aria-hidden="true"
                >
                  👑
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm leading-tight">
                    English Masterclass
                  </p>
                  <p className="text-[10px] tracking-widest text-gray-400 uppercase">
                    English Learning Platform
                  </p>
                </div>
              </div>

              {/* Crimson accent bar — spec: CRIMSON[500] (not gold) */}
              <div
                className="w-10 h-1 rounded-full mb-5"
                style={{ background: CRIMSON[500] }}
                aria-hidden="true"
              />

              <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign In</h2>
              <p className="text-sm text-gray-500 mb-7">
                Access your English Masterclass account.
              </p>

              {/* Error banner */}
              {error && (
                <div
                  className="mb-5 p-3 rounded-xl border flex items-start gap-2"
                  role="alert"
                  style={{ background: '#FEE2E2', borderColor: '#FECACA' }}
                >
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Closed door: credentials were correct, but this school
                  hasn't been granted access to English Masterclass. */}
              {closedDoor && (
                <div
                  className="mb-5 p-4 rounded-xl border"
                  role="alert"
                  style={{ background: '#FEF3C7', borderColor: '#FDE68A' }}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 mb-0.5">Access not available</p>
                      <p className="text-sm text-amber-700">{closedDoor.message}</p>
                    </div>
                  </div>
                  {closedDoor.otherServiceEnabled && (
                    <p className="text-sm text-amber-700 mt-2 ml-6">
                      Your school does have AISchoolonair — try{' '}
                      <Link to="/login" className="font-semibold underline">signing in there</Link> instead.
                    </p>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-5">

                {/* Email */}
                <div>
                  <label
                    htmlFor="em-email"
                    className="block text-xs font-semibold text-gray-600 mb-1.5"
                  >
                    Email Address
                  </label>
                  <input
                    id="em-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900
                               placeholder-gray-400 transition-colors
                               focus:outline-none"
                    onFocus={e => {
                      e.target.style.borderColor  = SOVEREIGN[500];
                      e.target.style.boxShadow    = `0 0 0 3px ${SOVEREIGN[500]}22`;
                    }}
                    onBlur={e => {
                      e.target.style.borderColor  = '#e5e7eb';
                      e.target.style.boxShadow    = 'none';
                    }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="em-password"
                    className="block text-xs font-semibold text-gray-600 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="em-password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full px-4 py-3 pr-11 border-2 border-gray-200 rounded-xl text-sm text-gray-900
                                 placeholder-gray-400 transition-colors
                                 focus:outline-none"
                      onFocus={e => {
                        e.target.style.borderColor = SOVEREIGN[500];
                        e.target.style.boxShadow   = `0 0 0 3px ${SOVEREIGN[500]}22`;
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#e5e7eb';
                        e.target.style.boxShadow   = 'none';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700
                                 transition-colors focus:outline-none focus-visible:ring-2 rounded"
                      style={{ '--tw-ring-color': SOVEREIGN[500] }}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {/* Forgot password */}
                <div className="flex justify-end -mt-2">
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium hover:underline transition-colors"
                    style={{ color: SOVEREIGN[700] }}
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Submit — flat SOVEREIGN[700], no gradient, no gold border */}
                <button
                  type="submit"
                  disabled={loading || !isReady}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all
                             focus:outline-none focus-visible:ring-2"
                  style={{
                    background:       isReady && !loading ? SOVEREIGN[700] : '#d1d5db',
                    cursor:           isReady && !loading ? 'pointer'       : 'not-allowed',
                    boxShadow:        isReady && !loading ? '0 2px 8px rgba(29,47,111,0.25)' : 'none',
                    '--tw-ring-color': SOVEREIGN[500],
                  }}
                  onMouseEnter={e => {
                    if (isReady && !loading) e.currentTarget.style.background = SOVEREIGN[600];
                  }}
                  onMouseLeave={e => {
                    if (isReady && !loading) e.currentTarget.style.background = SOVEREIGN[700];
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Signing in…
                    </span>
                  ) : 'Sign In to English Masterclass'}
                </button>

              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gray-200" aria-hidden="true" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-200" aria-hidden="true" />
              </div>

              <p className="text-center text-xs text-gray-500">
                New to English Masterclass?{' '}
                <Link
                  to="/em/signup"
                  className="font-semibold hover:underline"
                  style={{ color: SOVEREIGN[700] }}
                >
                  Create an account
                </Link>{' '}
                — no AISchoolonair account required.
              </p>

            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p
        className="text-center text-[11px] pb-4"
        style={{ color: `${SOVEREIGN[300]}66` }}
      >
        English Masterclass is powered by{' '}
        <span style={{ color: `${SOVEREIGN[300]}99` }}>{branding.poweredByFull}</span>
      </p>
    </div>
  );
}
