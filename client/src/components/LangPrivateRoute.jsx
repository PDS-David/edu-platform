// client/src/components/LangPrivateRoute.jsx
// Auth guard for the /language/:code* route group (French, German,
// Mandarin, Arabic, Spanish, Swahili, Yoruba — English is handled
// separately by EMPrivateRoute/the /em/* tree).
//
// This route group was previously wrapped in the generic AISchoolonair
// PrivateRoute, which checks user.school.enable_aischoolonair — the wrong
// flag. Backend access for Language Masterclass is gated entirely on
// req.school.hasLanguageMasterclass (derived from schools.enable_em; see
// server/routes/languageMasterclassRoutes.js and the comment on
// user.school.hasLanguageMasterclass in server/controllers/auth.js, which
// was added specifically to power this guard). Reusing PrivateRoute meant:
//   - a school with Language Masterclass enabled but AISchoolonair
//     disabled got bounced to /login before ever reaching the page, and
//   - a school with AISchoolonair enabled but Language Masterclass
//     disabled reached the page fine and then got a 403 from every API
//     call once it loaded (LANGUAGE_MASTERCLASS_NOT_ENABLED_FOR_SCHOOL).
// This guard checks the correct flag so both cases are caught up front,
// same as EMPrivateRoute does for /em/*.
//
// No dedicated login page exists for Language Masterclass (unlike EM),
// so unauthenticated users still go to the shared /login, same as before.
//
// Standalone (schoolless) users are not gated here — per
// languageMasterclassRoutes.js, their one-time registration
// (user_language_registrations) now happens silently on their first
// request to any language-scoped route, inside requireLanguageRegistration
// on the backend. There is no registration UI/button anywhere in the
// frontend for this, and no separate view state in LanguageMasterclass.jsx
// to redirect to — a not-yet-registered standalone student's first
// content request just succeeds.

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LangPrivateRoute({ allowedRoles = [] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/404" replace />;
  }

  // Tenant boundary: a student/teacher whose school hasn't been granted
  // Language Masterclass gets sent back to /login with the same
  // closed-door messaging pattern PrivateRoute/EMPrivateRoute use —
  // caught here, before any /language/* page or API call ever fires.
  if (user.school && !user.school.hasLanguageMasterclass) {
    return (
      <Navigate
        to="/login"
        state={{
          closedDoor: {
            service: 'language_masterclass',
            otherServiceEnabled: !!user.school.enable_aischoolonair,
          },
        }}
        replace
      />
    );
  }

  return <Outlet />;
}
