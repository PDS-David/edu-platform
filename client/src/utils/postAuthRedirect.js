// client/src/utils/postAuthRedirect.js
//
// Centralizes the "where does this user go right after login/register"
// decision so RegisterPage, LoginPage, EMLoginPage, and any future entry
// point all agree on the same rule. Previously this logic was duplicated
// independently in RegisterPage.jsx and LoginPage.jsx, and neither of them
// checked onboarding_complete — both sent every new student straight to
// /student/dashboard, so the onboarding flow (subject selection, daily
// goal, study schedule) was never reached automatically.
//
// Extended to decide between AISchoolonair and English Masterclass for a
// student/teacher who could reach either: previously every login had to
// pick a product up front (two separate login forms/nav links), exposing
// both products to every visitor regardless of which one they actually
// use. Now there is one login, and this decides after authenticating:
// straight to the one product the account actually has, or a chooser if
// it genuinely has both — never both products' branding shown to someone
// who only has one.

/**
 * Which product(s) a student/teacher account has access to.
 * - Tenant accounts (user.school present): the school's own toggles.
 * - Standalone accounts: AISchoolonair is the default platform anyone
 *   registers into; English Masterclass access is its own explicit signup
 *   (user.em_registered_at set), never assumed.
 */
export function getProductAccess(user) {
  if (!user) return { aischoolonair: false, em: false };
  const school = user.school;
  return {
    aischoolonair: school ? !!school.enable_aischoolonair : true,
    em:            school ? !!school.enable_em            : !!user.em_registered_at,
  };
}

function studentAISchoolonairHome(user) {
  // onboarding_complete may come back as a real boolean, or (depending on
  // the DB driver/row shape) as a string/number — normalize defensively
  // rather than assuming a strict boolean false.
  const onboarded =
    user.onboarding_complete === true ||
    user.onboarding_complete === 'true' ||
    user.onboarding_complete === 1;
  return onboarded ? '/student/dashboard' : '/onboarding';
}

/**
 * @param {Object} user - the user object returned from register()/login(),
 *                         expected to include `role` and `onboarding_complete`.
 * @returns {string} the route to navigate to.
 */
export function getPostAuthRedirect(user) {
  if (!user) return '/login';

  if (user.role === 'admin')        return '/admin/dashboard';
  if (user.role === 'school_admin') return '/school-admin/dashboard';

  if (user.role === 'student' || user.role === 'teacher') {
    const { aischoolonair, em } = getProductAccess(user);

    // Has both — let them pick, rather than silently guessing one and
    // hiding the other. This is the one place both products are ever
    // named to this user; from here on they only see the one they chose.
    if (aischoolonair && em) return '/choose-app';

    // English-Masterclass-only account (or tenant with only EM enabled):
    // AISchoolonair must never be shown to them at all.
    if (em && !aischoolonair) return '/em/dashboard';

    // AISchoolonair-only (the common case, and the fallback if a tenant
    // school somehow has neither flag set — same as today's behaviour).
    if (user.role === 'teacher') return '/teacher/dashboard';
    return studentAISchoolonairHome(user);
  }

  return '/';
}
