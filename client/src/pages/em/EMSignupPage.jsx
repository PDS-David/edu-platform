// client/src/pages/em/EMSignupPage.jsx
// Standalone Language Masterclass registration — creates its own account and
// grants EM access in one step. Deliberately independent of AISchoolonair's
// /register: no shared form, no "create an account there first" hand-off.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PublicNav from '../../components/PublicNav';
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
  const [termsAccepted, setTermsAccepted] = useState(false);

  const { registerForEM } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!termsAccepted) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }
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

  const isReady = firstName.trim() && email.trim() && password.trim().length >= 8 && termsAccepted;


  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 50%, #f5f0ff 100%)' }}>
      <PublicNav
        right={
          <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Already have an account? Login
          </Link>
        }
      />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex" style={{ minHeight: '580px' }}>

          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative"
            style={{ background: 'linear-gradient(160deg, #3730a3 0%, #4338ca 50%, #2563eb 100%)' }}
          >
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #818cf8, transparent)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #a78bfa, transparent)', transform: 'translate(-30%, 30%)' }} />

            <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-3 relative z-10">
              English Masterclass
            </p>
            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4 relative z-10">
              Join Us &amp;<br />
              <span style={{ color: '#818cf8' }}>Master Your English</span>
            </h1>
            <p className="text-gray-300 text-sm xl:text-base max-w-xs leading-relaxed relative z-10">
              Build stronger vocabulary, improve pronunciation, practise real English,
              and track your progress through focused Masterclass exercises.
            </p>

            <div className="mt-8 w-full max-w-xs space-y-3 relative z-10">
              {[
                ['01', 'Practise real English'],
                ['02', 'Build vocabulary and fluency'],
                ['03', 'Track your progress'],
              ].map(([n, label]) => (
                <div key={n} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-xs font-bold text-indigo-200">
                    {n}
                  </span>
                  <span className="text-sm text-white/90">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 relative z-10 rounded-xl border border-white/10 bg-white/5 px-4 py-3 max-w-xs">
              <p className="text-xs text-indigo-100 leading-relaxed">
                <strong>Masterclass-only account:</strong> leave the school join code blank
                if you are registering independently. This does not enroll you in AISchoolonair.
              </p>
            </div>
          </div>

          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">
                Register With Us
              </h2>
              <p className="text-center text-gray-500 text-sm mb-7">
                Create your English Masterclass account and start learning.
              </p>

              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2" role="alert">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                      First Name *
                    </label>
                    <input
                      id="em-first-name"
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="First Name"
                      required
                      autoComplete="given-name"
                      autoFocus
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                    />
                  </div>
                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                      Last Name *
                    </label>
                    <input
                      id="em-last-name"
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Last Name"
                      required
                      autoComplete="family-name"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                    />
                  </div>
                </div>

                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Email Address *
                  </label>
                  <input
                    id="em-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email Address"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Password *
                  </label>
                  <input
                    id="em-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password (min 8 characters)"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs text-amber-600 mt-1 ml-1">
                      {8 - password.length} more character{8 - password.length !== 1 ? 's' : ''} needed
                    </p>
                  )}
                </div>

                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    School Join Code
                  </label>
                  <input
                    id="em-join-code"
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Optional — leave blank for Masterclass only"
                    maxLength={32}
                    autoComplete="off"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors uppercase tracking-wider"
                  />
                  <p className="text-[11px] text-gray-400 mt-1 ml-1">
                    Enter this only if your school gave you a join code.
                  </p>
                </div>

                <div className="flex items-start gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="em-terms"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-indigo-600"
                  />
                  <label htmlFor="em-terms" className="text-xs text-gray-500 leading-relaxed">
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="text-indigo-600 underline">Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" target="_blank" className="text-indigo-600 underline">Privacy Policy</Link>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !isReady}
                  className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all mt-1"
                  style={{
                    background: isReady && !loading
                      ? 'linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)'
                      : '#d1d5db',
                    cursor: isReady && !loading ? 'pointer' : 'not-allowed',
                  }}
                >
                  {loading ? 'Creating account…' : 'Sign Up'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-5">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
                  Login here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 pb-4">
        English Masterclass is powered by AISchoolonair.
      </p>
    </div>
  );
}
