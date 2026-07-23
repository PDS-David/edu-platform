import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import PublicNav from '../components/PublicNav';
import { getPostAuthRedirect } from '../utils/postAuthRedirect';

const LoginPage = () => {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [error,       setError]       = useState('');
  const [closedDoor,  setClosedDoor]  = useState(null); // { message, otherServiceEnabled }
  const [loading,     setLoading]     = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  // PrivateRoute redirects here (rather than rendering the dashboard) when
  // an already-authenticated tenant user's school doesn't have AISchoolonair
  // enabled — e.g. they followed a bookmarked link straight to a dashboard
  // page. Surface the same closed-door messaging immediately, without
  // making them submit the form again.
  useEffect(() => {
    const reason = location.state?.closedDoor;
    if (reason?.service === 'aischoolonair') {
      setClosedDoor({
        message: 'Your school has not been registered for AISchoolonair. Contact your school admin or App Admin.',
        otherServiceEnabled: !!reason.otherServiceEnabled,
      });
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setClosedDoor(null);
    setLoading(true);
    try {
      const user = await login(email, password, rememberMe, 'aischoolonair');
      navigate(getPostAuthRedirect(user));
    } catch (err) {
      // Defensively extract string — err.error may be an object if server sends {error: {message:...}}
      const raw = err?.message ?? '';
      setError(typeof raw === 'string' ? raw : (raw?.message || 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  // EAC brand — matches Register page exactly
  const BG       = 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 50%, #f5f0ff 100%)';
  const BTN      = 'linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)';
  const ACCENT   = '#6366f1';

  const isReady  = email.trim() && password.trim();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>

      <PublicNav />

      {/* ── Centered card ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex"
          style={{ minHeight: '520px' }}
        >

          {/* ── Left panel — branding ── */}
          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative"
            style={{ background: 'linear-gradient(160deg, #3730a3 0%, #4338ca 50%, #2563eb 100%)' }}
          >
            {/* Decorative blobs */}
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #818cf8, transparent)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #a78bfa, transparent)', transform: 'translate(-30%, 30%)' }} />

            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4 relative z-10">
              Welcome Back! 👋 
            </h1>
            <p className="text-gray-300 text-sm xl:text-base max-w-xs leading-relaxed relative z-10 mb-6">
              Sign in to continue your exam preparation journey. Your progress and study data are waiting for you.
            </p>

            {/* Mini stats */}
            <div className="grid grid-cols-2 gap-3 relative z-10 w-full max-w-xs">
              {[
                { v: '200,000+', l: 'Practice Questions' },
                { v: '13',       l: 'Exam Types' },
                { v: '50,000+',  l: 'Active Students' },
                { v: '14 Days',  l: 'Free Trial' },
              ].map((s, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-white font-bold text-lg leading-none">{s.v}</p>
                  <p className="text-indigo-300 text-xs mt-0.5">{s.l}</p>
                </div>
              ))}
            </div>

            {/* SVG illustration */}
            <div className="mt-8 w-48 xl:w-56 relative z-10 opacity-80">
              <svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg" className="w-full">
                <rect x="40" y="120" width="200" height="12" rx="4" fill="#7c3aed" opacity="0.8"/>
                <rect x="55" y="60" width="170" height="62" rx="6" fill="#4c1d95"/>
                <rect x="59" y="64" width="162" height="54" rx="4" fill="#1e1b4b"/>
                <rect x="63" y="68" width="154" height="46" rx="3" fill="#0f0a2e"/>
                <rect x="67" y="72" width="70" height="7" rx="2" fill="#818cf8" opacity="0.8"/>
                <rect x="67" y="83" width="45" height="4" rx="2" fill="#a78bfa" opacity="0.5"/>
                <rect x="67" y="91" width="55" height="4" rx="2" fill="#a78bfa" opacity="0.4"/>
                <circle cx="185" cy="90" r="12" fill="none" stroke="#818cf8" strokeWidth="1.5" opacity="0.7"/>
                <circle cx="185" cy="90" r="3.5" fill="#f472b6"/>
                <ellipse cx="185" cy="90" rx="12" ry="4" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6"/>
                <ellipse cx="185" cy="90" rx="12" ry="4" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6" transform="rotate(60 185 90)"/>
              </svg>
            </div>
          </div>

          {/* ── Right panel — form ── */}
          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">

              {/* Mobile logo - replaced by PublicNav on all screen sizes */}

              <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">Sign In</h2>
              <p className="text-center text-gray-500 text-sm mb-7">
                Enter your credentials to access your account.
              </p>

              {/* Error */}
              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Closed door: credentials were correct, but this school
                  hasn't been granted access to AISchoolonair. Distinct from
                  a plain login error — this isn't "try again", it's "this
                  isn't for you", so it gets its own explanation and, if
                  relevant, a way to the door that IS open for them. */}
              {closedDoor && (
                <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 mb-0.5">Access not available</p>
                      <p className="text-sm text-amber-700">{closedDoor.message}</p>
                    </div>
                  </div>
                  {closedDoor.otherServiceEnabled && (
                    <p className="text-sm text-amber-700 mt-2 ml-6">
                      Your school does have English Masterclass — try{' '}
                      <Link to="/em/login" className="font-semibold underline">signing in there</Link> instead.
                    </p>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Email */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

                {/* Password */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Password *
                  </label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Remember me + Forgot */}
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                    <span className="text-gray-600">Remember me</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="font-medium hover:underline"
                    style={{ color: ACCENT }}
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Submit */}
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
                      Signing in…
                    </span>
                  ) : 'Sign In'}
                </button>

              </form>

              <p className="text-center text-sm text-gray-500 mt-5">
                Don't have an account?{' '}
                <Link to="/register" className="font-semibold" style={{ color: ACCENT }}>
                  Sign up free
                </Link>
              </p>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default LoginPage;
