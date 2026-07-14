import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// `skipOnboardingCheck` is used by the /onboarding route itself — without
// it, an un-onboarded student visiting /onboarding would be redirected
// straight back to /onboarding, looping forever.
export default function PrivateRoute({ allowedRoles = [], skipOnboardingCheck = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/404" replace />;
  }

  // Tenant boundary: a student/teacher whose school hasn't been granted
  // AISchoolonair gets sent back to /login rather than reaching any
  // AISchoolonair page — mirrors EMPrivateRoute's equivalent check for the
  // /em/* tree. school_admin is deliberately exempt here (same exemption as
  // the backend's login and API gates): they still need their own
  // dashboard to manage roster/settings regardless of the content toggle.
  // user.school is only present for tenant accounts.
  if (
    user.school &&
    !user.school.enable_aischoolonair &&
    ['student', 'teacher'].includes(user.role)
  ) {
    return (
      <Navigate
        to="/login"
        state={{ closedDoor: { service: 'aischoolonair', otherServiceEnabled: !!user.school.enable_em } }}
        replace
      />
    );
  }

  // Students who haven't completed onboarding are redirected there before
  // they can reach any other student-area route. This is the safety net
  // for the redirect already performed right after login/register — it
  // covers bookmarked URLs, the browser back button, or any future entry
  // point that doesn't go through the login/register flow directly.
  const onboarded =
    user.onboarding_complete === true ||
    user.onboarding_complete === 'true' ||
    user.onboarding_complete === 1;

  if (
    user.role === 'student' &&
    !onboarded &&
    !skipOnboardingCheck &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
