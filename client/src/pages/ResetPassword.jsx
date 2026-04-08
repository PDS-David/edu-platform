import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const BG     = 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)';
const BTN    = 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)';
const ACCENT = '#6366f1';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();

  const token  = searchParams.get('token');
  const userId = searchParams.get('id');

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [success,         setSuccess]         = useState(false);

  useEffect(() => {
    if (!token || !userId) setError('This reset link is invalid or incomplete. Please request a new one.');
  }, [token, userId]);

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const isReady = newPassword.length >= 6 && passwordsMatch && token && userId;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (newPassword.length < 6)         { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    try {
      const res  = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/reset-password`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token, userId, newPassword }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed. The link may have expired.');
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3500);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>

      <PublicNav />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex" style={{ minHeight: '480px' }}>

          {/* Left panel */}
          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative"
            style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #2e1065 60%, #1e3a5f 100%)' }}
          >
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #818cf8, transparent)', transform: 'translate(30%,-30%)' }} />
            <div className="text-5xl mb-5">🔑</div>
            <h2 className="text-2xl xl:text-3xl font-bold text-white mb-3">Create a new password</h2>
            <p className="text-gray-300 text-sm leading-relaxed max-w-xs mb-6">
              Choose a strong, unique password that you haven't used before for your EAC account.
            </p>
            <div className="space-y-2 max-w-xs">
              {[
                '✅ At least 6 characters long',
                '✅ Mix of letters and numbers recommended',
                '✅ Avoid easily guessed words',
              ].map((tip, i) => (
                <p key={i} className="text-indigo-200 text-xs">{tip}</p>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">

              {/* Mobile logo removed — PublicNav handles branding on all screen sizes */}

              {success ? (
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">Password Updated!</h2>
                  <p className="text-gray-500 text-sm mb-5">
                    Your password has been changed successfully. Redirecting you to sign in…
                  </p>
                  <Link
                    to="/login"
                    className="inline-block py-3 px-8 rounded-lg text-sm font-semibold text-white"
                    style={{ background: BTN }}
                  >
                    Sign In Now
                  </Link>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">New Password</h2>
                  <p className="text-center text-gray-500 text-sm mb-7">Set a new password for your account.</p>

                  {error && (
                    <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-red-600">{error}</p>
                        {(error.includes('expired') || error.includes('invalid')) && (
                          <Link to="/forgot-password" className="text-xs font-medium underline mt-1 inline-block" style={{ color: ACCENT }}>
                            Request a new link →
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">

                    {/* New password */}
                    <div className="relative">
                      <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">New Password *</label>
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        disabled={!token || !userId}
                        className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors disabled:bg-gray-50"
                      />
                      <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                        {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {/* Confirm password */}
                    <div className="relative">
                      <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">Confirm Password *</label>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className={`w-full px-4 py-3 pr-11 border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors
                          ${confirmPassword && !passwordsMatch
                            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-100'
                          }`}
                      />
                      <button type="button" onClick={() => setShowConfirm(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {/* Password match indicator */}
                    {confirmPassword && (
                      <p className={`text-xs flex items-center gap-1 ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordsMatch ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                        {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !isReady}
                      className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all mt-1"
                      style={{
                        background: isReady && !loading ? BTN : '#d1d5db',
                        cursor:     isReady && !loading ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Resetting…
                        </span>
                      ) : 'Reset Password'}
                    </button>
                  </form>
                </>
              )}

              <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center gap-1 text-sm">
                <ArrowLeft size={14} className="text-gray-400" />
                <Link to="/login" className="text-gray-500 hover:text-gray-700">Back to Sign In</Link>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
