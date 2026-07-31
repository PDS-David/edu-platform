// client/src/pages/ChooseAppPage.jsx
// Route: /choose-app (protected — must be logged in)
//
// Shown after login only when an account genuinely has access to BOTH
// AISchoolonair and English Masterclass (see getProductAccess() in
// utils/postAuthRedirect.js). Previously every visitor saw both products
// named on the public home page nav and had to pick one before even
// logging in; now there's one login, and this is the one place — after
// authenticating — where both are ever named to a user who actually has
// both. Anyone with only one product never sees this page at all; they go
// straight to their one dashboard from getPostAuthRedirect.
//
// Switching later: there's no in-session switcher by design — the account
// stays wherever it entered until signing out. Signing out and logging
// back in returns here (or straight to the same choice) so a user can
// pick the other product "at will", which is the intended mechanism.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProductAccess } from '../utils/postAuthRedirect';
import { GraduationCap, Volume2, LogOut, ChevronRight } from 'lucide-react';

export default function ChooseAppPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { aischoolonair, em } = getProductAccess(user);

  // Defensive redirects for anyone who lands here without actually
  // qualifying for a choice — role isn't student/teacher, or the account
  // only has one product after all (e.g. a direct link, or a school's
  // access changed between login and now). Never show an empty or
  // single-option "choice."
  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return; }
    if (user.role === 'admin')        { navigate('/admin/dashboard', { replace: true }); return; }
    if (user.role === 'school_admin') { navigate('/school-admin/dashboard', { replace: true }); return; }
    if (!(aischoolonair && em)) {
      if (em) { navigate('/em/dashboard', { replace: true }); return; }
      navigate(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard', { replace: true });
    }
  }, [user, aischoolonair, em, navigate]);

  if (!user || !(aischoolonair && em)) return null;

  const firstName = user.first_name || user.name?.split(' ')[0] || '';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <p className="text-sm text-gray-400 mb-1">Welcome{firstName ? `, ${firstName}` : ''}</p>
          <h1 className="text-2xl font-bold text-gray-900">Which would you like to open?</h1>
          <p className="text-sm text-gray-500 mt-2">
            Your account has access to both. You can switch later by signing out and logging back in.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <button
            type="button"
            onClick={() => navigate(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')}
            className="group text-left bg-white border border-gray-200 rounded-2xl p-6 hover:border-blue-400 hover:shadow-lg transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
              <GraduationCap size={22} className="text-blue-600" aria-hidden="true" />
            </div>
            <h2 className="font-bold text-gray-900 mb-1">AISchoolonair</h2>
            <p className="text-sm text-gray-500 mb-4">Exam practice, AI tutoring, and progress tracking.</p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
              Continue <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/em/dashboard')}
            className="group text-left bg-white border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-lg transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
              <Volume2 size={22} className="text-indigo-600" aria-hidden="true" />
            </div>
            <h2 className="font-bold text-gray-900 mb-1">Language Masterclass</h2>
            <p className="text-sm text-gray-500 mb-4">Vocabulary, pronunciation, and written English practice.</p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
              Continue <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        </div>

        <div className="text-center mt-8">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut size={13} aria-hidden="true" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
