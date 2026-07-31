// client/src/pages/em/EMSignupPage.jsx
// Standalone English Masterclass registration — creates its own account and
// grants EM access in one step. Deliberately independent of AISchoolonair's
// /register: no shared form, no "create an account there first" hand-off.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { SOVEREIGN, CRIMSON } from './constants';
import branding from '../../config/branding';

export default function EMSignupPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [joinCode,  setJoinCode]  = useState('');
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const { registerForEM } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await registerForEM({
        first_name: firstName,
        last_name:  lastName,
        email,
        password,
        // Optional — links this new EM account to a tenant school the same
        // way AISchoolonair's join code does (same schools table). Left
        // blank for anyone signing up who isn't part of a school.
        join_code: joinCode.trim() || undefined,
      });
      navigate('/em/dashboard', { replace: true });
    } catch (err) {
      const raw = err?.response?.data?.error ?? err?.message ?? '';
      setError(typeof raw === 'string' && raw ? raw : 'Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isReady = firstName.trim() && email.trim() && password.trim().length >= 8;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(160deg, ${SOVEREIGN[950]} 0%, ${SOVEREIGN[900]} 100%)` }}
    >
      <header className="flex items-center justify-between flex-wrap gap-y-2 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-sm shrink-0"
            style={{ background: CRIMSON[500] }}
            aria-hidden="true"
          >
            👑
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight tracking-wide truncate">
              Language Masterclass
            </p>
            {/* Dropped below sm — see EMLoginPage.jsx for why (keeps this
                header from overflowing on a narrow phone). */}
            <p className="hidden sm:block text-[10px] tracking-widest mt-0.5" style={{ color: SOVEREIGN[200] }}>
              ENGLISH FLUENCY TRAINING
            </p>
          </div>
        </div>
        <Link
          to="/"
          className="text-xs font-medium transition-colors hover:underline shrink-0"
          style={{ color: SOVEREIGN[200] }}
        >
          <span className="sm:hidden">← Back</span>
          <span className="hidden sm:inline">← Back to Home Page</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 md:p-10">
          <div
            className="w-10 h-1 rounded-full mb-5"
            style={{ background: CRIMSON[500] }}
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-7">
            Start learning English — no AISchoolonair account needed.
          </p>

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

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="em-first-name" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  First Name
                </label>
                <input
                  id="em-first-name"
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Ada"
                  required
                  autoComplete="given-name"
                  autoFocus
                  className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                  onFocus={e => { e.target.style.borderColor = SOVEREIGN[500]; e.target.style.boxShadow = `0 0 0 3px ${SOVEREIGN[500]}22`; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <div>
                <label htmlFor="em-last-name" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Last Name
                </label>
                <input
                  id="em-last-name"
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Okafor"
                  autoComplete="family-name"
                  className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                  onFocus={e => { e.target.style.borderColor = SOVEREIGN[500]; e.target.style.boxShadow = `0 0 0 3px ${SOVEREIGN[500]}22`; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="em-signup-email" className="block text-xs font-semibold text-gray-600 mb-1.5">
                Email Address
              </label>
              <input
                id="em-signup-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                onFocus={e => { e.target.style.borderColor = SOVEREIGN[500]; e.target.style.boxShadow = `0 0 0 3px ${SOVEREIGN[500]}22`; }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div>
              <label htmlFor="em-signup-password" className="block text-xs font-semibold text-gray-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="em-signup-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 pr-11 border-2 border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                  onFocus={e => { e.target.style.borderColor = SOVEREIGN[500]; e.target.style.boxShadow = `0 0 0 3px ${SOVEREIGN[500]}22`; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors focus:outline-none"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Optional school affiliation — collapsed by default since most
               EM sign-ups aren't through a school. */}
            {showJoinCode ? (
              <div>
                <label htmlFor="em-signup-joincode" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  School Join Code (optional)
                </label>
                <input
                  id="em-signup-joincode"
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AB3DEF9H"
                  maxLength={8}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none uppercase tracking-widest font-mono"
                  onFocus={e => { e.target.style.borderColor = SOVEREIGN[500]; e.target.style.boxShadow = `0 0 0 3px ${SOVEREIGN[500]}22`; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowJoinCode(true)}
                className="text-xs font-medium hover:underline text-left"
                style={{ color: SOVEREIGN[600] }}
              >
                Signing up through a school? Add a join code
              </button>
            )}

            <button
              type="submit"
              disabled={loading || !isReady}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all focus:outline-none"
              style={{
                background: isReady && !loading ? SOVEREIGN[700] : '#d1d5db',
                cursor:     isReady && !loading ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" aria-hidden="true" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" aria-hidden="true" />
          </div>

          <p className="text-center text-xs text-gray-500">
            Already have a Language Masterclass account?{' '}
            <Link to="/em/login" className="font-semibold hover:underline" style={{ color: SOVEREIGN[700] }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <p className="text-center text-[11px] pb-4" style={{ color: `${SOVEREIGN[300]}66` }}>
        Language Masterclass is powered by{' '}
        <span style={{ color: `${SOVEREIGN[300]}99` }}>{branding.poweredByFull}</span>
      </p>
    </div>
  );
}
