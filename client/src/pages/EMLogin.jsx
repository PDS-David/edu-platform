// client/src/pages/EMLogin.jsx
// Standalone login page for English Masterclass.
// Completely separate from AISchoolOnAir — own branding, own post-login redirect.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, AlertCircle, BookOpen } from 'lucide-react';

export default function EMLogin() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, false);
      // Always land on EM dashboard regardless of platform onboarding state
      navigate('/em/dashboard', { replace: true });
    } catch (err) {
      const raw = err?.message ?? '';
      setError(typeof raw === 'string' ? raw : (raw?.message || 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  const ready = email.trim() && password.trim();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 50%, #1a1a2e 100%)' }}>

      {/* ── EM Top Bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Union Jack-inspired icon */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: 'linear-gradient(135deg, #cf142b 0%, #00247d 100%)' }}>
            🇬🇧
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">English Masterclass</p>
            <p className="text-blue-300 text-[10px]">British English Vocabulary Training</p>
          </div>
        </div>
        <Link to="/" className="text-blue-300 hover:text-white text-xs font-medium transition-colors">
          ← Back to AISchoolOnAir
        </Link>
      </header>

      {/* ── Two-panel card ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex" style={{ minHeight: '500px' }}>

          {/* Left — decorative branding panel */}
          <div className="hidden md:flex flex-col justify-center flex-1 px-10 py-12 relative overflow-hidden"
            style={{ background: 'linear-gradient(160deg, #00247d 0%, #cf142b 100%)' }}>
            {/* Decorative Union Jack lines */}
            <div className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `
                  linear-gradient(to bottom, transparent 45%, white 45%, white 55%, transparent 55%),
                  linear-gradient(to right,  transparent 45%, white 45%, white 55%, transparent 55%)
                `,
              }} />
            <div className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: `
                  linear-gradient(45deg,  transparent 40%, white 40%, white 60%, transparent 60%),
                  linear-gradient(-45deg, transparent 40%, white 40%, white 60%, transparent 60%)
                `,
              }} />

            <div className="relative z-10">
              <div className="text-6xl mb-6">🇬🇧</div>
              <h2 className="text-3xl font-bold text-white leading-tight mb-4">
                Master<br/>British English
              </h2>
              <p className="text-blue-100 text-sm leading-relaxed mb-6">
                Build your vocabulary word by word. Practise pronunciation, learn definitions,
                and track your progress from Beginner to Advanced.
              </p>
              <div className="space-y-2">
                {[
                  '🎙️  Listen and repeat with authentic British pronunciation',
                  '📈  Progressive levels — unlock as you improve',
                  '🤖  AI-powered word explanations',
                  '🔥  Daily streak tracking',
                ].map(f => (
                  <div key={f} className="flex items-start gap-2 text-xs text-blue-100 leading-relaxed">{f}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — login form */}
          <div className="flex-1 bg-white flex flex-col justify-center px-8 md:px-12 py-12">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h1>
              <p className="text-sm text-gray-500">Use your AISchoolOnAir account to access English Masterclass</p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all pr-11"
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>

              <button type="submit" disabled={!ready || loading}
                className="w-full py-3 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                style={{ background: loading || !ready ? '#94a3b8' : 'linear-gradient(135deg, #00247d 0%, #cf142b 100%)' }}>
                {loading
                  ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Signing in…</>
                  : 'Sign in to English Masterclass'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 font-semibold hover:underline">
                Register on AISchoolOnAir
              </Link>
            </p>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-[10px] text-gray-300">Powered by AISchoolOnAir · Pronoia Digital Services</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
