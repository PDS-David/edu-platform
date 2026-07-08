// client/src/pages/em/EMRegisterPage.jsx
// One-time English Masterclass registration step.
//
// The user already has a valid AISchoolOnAir session at this point (this
// page lives behind EMPrivateRoute), but that account alone does not grant
// EM access — POST /english-masterclass/register is the explicit, separate
// registration required before any EM content route will respond.

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

  // Already registered (e.g. back-button after completing this) — skip straight in.
  if (user?.em_registered_at) {
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
      <header className="flex items-center gap-3 px-6 py-4">
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
          <p className="text-[10px] tracking-widest mt-0.5" style={{ color: SOVEREIGN[200] }}>
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
            but English Masterclass needs its own quick registration before you
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
            {loading ? 'Registering…' : 'Register for English Masterclass'}
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
