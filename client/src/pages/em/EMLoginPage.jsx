// client/src/pages/em/EMLoginPage.jsx
// Standalone English Masterclass login — completely separate from
// the main AISchoolOnAir platform. Navy/gold British palette.
// On successful login → /em/dashboard (not /student/dashboard).

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

// ── Brand tokens ─────────────────────────────────────────────────────────────
const NAVY  = '#0d1b3e';
const GOLD  = '#c8a84b';
const GOLD2 = '#e6c96d';

export default function EMLoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, false);
      // Always send to EM dashboard regardless of role
      navigate('/em/dashboard', { replace: true });
    } catch (err) {
      const raw = err?.message ?? '';
      setError(typeof raw === 'string' ? raw : (raw?.message || 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  const isReady = email.trim() && password.trim();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #162040 60%, #1a2a50 100%)` }}
    >
      {/* ── Minimal EM-only top bar ── */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Crown + flag motif */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg"
            style={{ background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD2} 100%)` }}
          >
            👑
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight tracking-wide">
              English Masterclass
            </p>
            <p className="text-[10px] tracking-widest" style={{ color: GOLD }}>
              BRITISH ENGLISH TRAINING
            </p>
          </div>
        </div>
        <Link
          to="/"
          className="text-xs font-medium hover:underline"
          style={{ color: `${GOLD}bb` }}
        >
          ← Back to AISchoolOnAir
        </Link>
      </header>

      {/* ── Centered card ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex"
          style={{ minHeight: '520px' }}
        >
          {/* ── Left branding panel ── */}
          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative overflow-hidden"
            style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #14244a 100%)` }}
          >
            {/* Gold decorative rings */}
            <div
              className="absolute top-0 right-0 w-56 h-56 rounded-full opacity-10"
              style={{ background: `radial-gradient(circle, ${GOLD}, transparent)`, transform: 'translate(30%,-30%)' }}
            />
            <div
              className="absolute bottom-0 left-0 w-44 h-44 rounded-full opacity-10"
              style={{ background: `radial-gradient(circle, ${GOLD2}, transparent)`, transform: 'translate(-30%,30%)' }}
            />

            {/* Union Jack SVG motif */}
            <div className="mb-8 relative z-10">
              <svg viewBox="0 0 80 54" width="80" height="54" xmlns="http://www.w3.org/2000/svg">
                {/* Blue field */}
                <rect width="80" height="54" rx="4" fill="#012169"/>
                {/* White saltire */}
                <line x1="0" y1="0" x2="80" y2="54" stroke="white" strokeWidth="10"/>
                <line x1="80" y1="0" x2="0" y2="54" stroke="white" strokeWidth="10"/>
                {/* Red saltire */}
                <line x1="0" y1="0" x2="80" y2="54" stroke="#C8102E" strokeWidth="6"/>
                <line x1="80" y1="0" x2="0" y2="54" stroke="#C8102E" strokeWidth="6"/>
                {/* White cross */}
                <rect x="30" y="0" width="20" height="54" fill="white"/>
                <rect x="0" y="17" width="80" height="20" fill="white"/>
                {/* Red cross */}
                <rect x="33" y="0" width="14" height="54" fill="#C8102E"/>
                <rect x="0" y="20" width="80" height="14" fill="#C8102E"/>
              </svg>
            </div>

            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4 relative z-10">
              Welcome Back 🎓
            </h1>
            <p className="text-sm xl:text-base max-w-xs leading-relaxed relative z-10 mb-6" style={{ color: '#9db4d9' }}>
              Continue your journey to mastering British English vocabulary. Progress, streaks and unlocks are waiting for you.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 relative z-10 w-full max-w-xs">
              {[
                { v: '3 Levels',   l: 'Beginner → Advanced' },
                { v: '🇬🇧',         l: 'British English Only' },
                { v: 'AI-Powered', l: 'Word Explanations'    },
                { v: 'TTS Audio',  l: 'Listen & Spell'       },
              ].map((s, i) => (
                <div key={i} className="rounded-xl p-3 border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${GOLD}33` }}>
                  <p className="font-bold text-base leading-none" style={{ color: GOLD }}>{s.v}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#7a9ac4' }}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right form panel ── */}
          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">

              {/* Mobile logo */}
              <div className="flex md:hidden items-center justify-center gap-2 mb-6">
                <span className="text-2xl">👑</span>
                <div>
                  <p className="font-bold text-gray-900 text-sm leading-tight">English Masterclass</p>
                  <p className="text-[10px] tracking-widest text-gray-400 uppercase">British English Training</p>
                </div>
              </div>

              {/* Gold accent bar */}
              <div className="w-12 h-1 rounded-full mb-5" style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD2})` }} />

              <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign In</h2>
              <p className="text-sm text-gray-500 mb-7">Access your English Masterclass account.</p>

              {/* Error */}
              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Email */}
                <div className="relative">
                  <label
                    htmlFor="em-email"
                    className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10"
                  >
                    Email Address *
                  </label>
                  <input
                    id="em-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors"
                    style={{ '--tw-ring-color': `${GOLD}44` }}
                    onFocus={e => { e.target.style.borderColor = GOLD; e.target.style.boxShadow = `0 0 0 3px ${GOLD}22`; }}
                    onBlur={e  => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                {/* Password */}
                <div className="relative">
                  <label
                    htmlFor="em-password"
                    className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10"
                  >
                    Password *
                  </label>
                  <input
                    id="em-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition-colors"
                    onFocus={e => { e.target.style.borderColor = GOLD; e.target.style.boxShadow = `0 0 0 3px ${GOLD}22`; }}
                    onBlur={e  => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Forgot */}
                <div className="flex justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium hover:underline"
                    style={{ color: NAVY }}
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !isReady}
                  className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all mt-1"
                  style={{
                    background: isReady && !loading ? '#1D2F6F' : '#d1d5db',
                    cursor:     isReady && !loading ? 'pointer'  : 'not-allowed',
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <p className="text-center text-xs text-gray-500">
                Not yet a student?{' '}
                <Link to="/register" className="font-semibold hover:underline" style={{ color: NAVY }}>
                  Register on AISchoolOnAir
                </Link>{' '}first, then return here.
              </p>

            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] pb-4" style={{ color: `${GOLD}66` }}>
        English Masterclass is powered by <span style={{ color: `${GOLD}99` }}>AISchoolOnAir</span>
      </p>
    </div>
  );
}
