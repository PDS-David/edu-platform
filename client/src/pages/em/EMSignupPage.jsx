// client/src/pages/em/EMSignupPage.jsx
// Standalone Language Masterclass registration — creates its own account and
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
            {}
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
            <Link to="/login" className="font-semibold hover:underline" style={{ color: SOVEREIGN[700] }}>
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
