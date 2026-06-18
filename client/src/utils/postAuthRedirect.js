// client/src/utils/postAuthRedirect.js
//
// Centralizes the "where does this user go right after login/register"
// decision so RegisterPage, LoginPage, and any future entry point all agree
// on the same rule. Previously this logic was duplicated independently in
// RegisterPage.jsx and LoginPage.jsx, and neither of them checked
// onboarding_complete — both sent every new student straight to
// /student/dashboard, so the onboarding flow (subject selection, daily
// goal, study schedule) was never reached automatically.

/**
 * @param {Object} user - the user object returned from register()/login(),
 *                         expected to include `role` and `onboarding_complete`.
 * @returns {string} the route to navigate to.
 */
export function getPostAuthRedirect(user) {
  if (!user) return '/login';

  if (user.role === 'student') {
    // onboarding_complete may come back as a real boolean, or (depending on
    // the DB driver/row shape) as a string/number — normalize defensively
    // rather than assuming a strict boolean false.
    const onboarded =
      user.onboarding_complete === true ||
      user.onboarding_complete === 'true' ||
      user.onboarding_complete === 1;

    return onboarded ? '/student/dashboard' : '/onboarding';
  }

  if (user.role === 'teacher') return '/teacher/dashboard';
  if (user.role === 'admin')   return '/admin/dashboard';

  return '/';
}
