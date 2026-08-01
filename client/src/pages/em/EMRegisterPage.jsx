// client/src/pages/em/EMRegisterPage.jsx
// One-time Language Masterclass registration step — STANDALONE users only.
// A tenant student's access is fully determined by their school's
// enable_em flag (see EMPrivateRoute.jsx / requireEmRegistration in
// englishMasterclassRoutes.js) — nothing to register, so EMPrivateRoute
// never sends a tenant student here in normal navigation. The redirect
// below is defense-in-depth for a stale bookmark or direct URL entry.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/apiClient';
import { SOVEREIGN, CRIMSON } from './constants';

export default function EMRegisterPage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Already registered (e.g. back-button after completing this), or a
  // tenant student whose access needs no registration at all — skip
  // straight in either way.
  if (user?.em_registered_at || user?.school) {
    navigate('/em/dashboard', { replace: true });
    return null;
  }

  const handleRegister = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/english-masterclass/register');
      updateUser({ em_registered_at: data.em_registered_at });
      navigate('/em/dashboard', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not complete registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(160deg, ${SOVEREIGN[950]} 0%, ${SOVEREIGN[900]} 100%)` }}
    >
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4 min-w-0">
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
          <p className="hidden sm:block text-[10px] tracking-widest mt-0.5" style={{ color: SOVEREIGN[200] }}>
            ENGLISH FLUENCY TRAINING
          </p>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-md rounded-3xl shadow-2xl p-8 md:p-10"
          style={{ background: '#ffffff' }}
        >
          <h1 className="text-xl font-bold mb-2" style={{ color: SOVEREIGN[900] }}>
            One more step
          </h1>
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            You're signed in with your AISchoolOnAir account, {user?.first_name || 'there'} —
            but Language Masterclass needs its own quick registration before you
            can start practising. This only takes a second and only needs to
            be done once.
          </p>

          {error && (
            <div
              className="mb-5 rounded-lg px-4 py-3 text-sm"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: SOVEREIGN[700] }}
          >
            {loading ? 'Registering…' : 'Register for Language Masterclass'}
          </button>

          <button
            onClick={() => logout()}
            className="w-full mt-3 rounded-xl py-3 text-sm font-medium hover:underline"
            style={{ color: SOVEREIGN[700] }}
          >
            Not you? Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
