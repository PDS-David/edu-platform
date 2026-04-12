import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const BG     = 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)';
const BTN    = 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)';
const ACCENT = '#6366f1';

const ForgotPassword = () => {
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fetch(`${((import.meta.env.VITE_API_URL || 'http://localhost:5000').endsWith('/api') ? (import.meta.env.VITE_API_URL || 'http://localhost:5000') : `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`)}/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      // Always show success — security best practice (don't reveal if email exists)
      setSubmitted(true);
    } catch {
      setSubmitted(true); // still show success on network error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>

      <PublicNav />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex" style={{ minHeight: '460px' }}>

          {/* Left panel */}
          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative"
            style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #2e1065 60%, #1e3a5f 100%)' }}
          >
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #818cf8, transparent)', transform: 'translate(30%,-30%)' }} />
            <div className="text-5xl mb-5">🔐</div>
            <h2 className="text-2xl xl:text-3xl font-bold text-white mb-3">Forgot your password?</h2>
            <p className="text-gray-300 text-sm leading-relaxed max-w-xs">
              No worries — it happens to everyone. Enter your registered email address and we'll send you a secure reset link.
            </p>
            <div className="mt-6 bg-white/5 rounded-xl p-4 border border-white/10 max-w-xs">
              <p className="text-indigo-200 text-xs leading-relaxed">
                🛡️ For your security, the reset link expires in <strong className="text-white">1 hour</strong>. If you don't see the email, check your spam folder.
              </p>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">

              {/* Mobile logo removed — PublicNav handles branding on all screen sizes */}

              {!submitted ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">Reset Password</h2>
                  <p className="text-center text-gray-500 text-sm mb-7">
                    Enter your email and we'll send you reset instructions.
                  </p>

                  {error && (
                    <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                      <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">Email Address *</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !email.trim()}
                      className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all"
                      style={{
                        background: email.trim() && !loading ? BTN : '#d1d5db',
                        cursor:     email.trim() && !loading ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Sending…
                        </span>
                      ) : 'Send Reset Instructions'}
                    </button>
                  </form>
                </>
              ) : (
                /* Success state */
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">Check your email</h2>
                  <p className="text-gray-500 text-sm leading-relaxed mb-4">
                    If an account exists for <strong className="text-gray-800">{email}</strong>, you'll receive reset instructions shortly.
                  </p>
                  <p className="text-xs text-gray-400 mb-6">
                    Didn't receive it? Check your spam folder or{' '}
                    <a href="mailto:info@eac.edu.ng" className="underline" style={{ color: ACCENT }}>
                      contact support
                    </a>.
                  </p>
                  <button
                    onClick={() => { setSubmitted(false); setEmail(''); }}
                    className="text-sm font-medium hover:underline"
                    style={{ color: ACCENT }}
                  >
                    Try a different email
                  </button>
                </div>
              )}

              <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center gap-4 text-sm">
                <Link to="/login" className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
                  <ArrowLeft size={14} /> Back to Sign In
                </Link>
                <span className="text-gray-200">|</span>
                <Link to="/register" className="font-medium" style={{ color: ACCENT }}>Create account</Link>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
