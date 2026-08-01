// client/src/components/EMPrivateRoute.jsx
// Auth guard for the /em/* route group.
// Unauthenticated users go to /em/login (not /login).
// Students, teachers and (platform) admins are permitted — EM is
// role-agnostic vocabulary training for them — EXCEPT a tenant-school
// account whose school was never granted English Masterclass. That's not
// a "wait for the API to 403" situation; it's a closed door, so it's
// caught here, before any /em/* page or API call ever fires, and sent
// back through /em/login where the same closed-door messaging as a fresh
// login attempt applies.
// A tenant school_admin is excluded entirely, regardless of enable_em —
// this route group is student/study-facing, and a school_admin must never
// land here, full stop. See the role check below for details.

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function EMPrivateRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d1b3e' }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-400" />
      </div>
    );
  }

  if (!user) {
    // Preserve the intended destination so we can restore it after login if needed
    return <Navigate to="/em/login" state={{ from: location }} replace />;
  }

  // A school_admin must never reach a student/study-facing page — not via
  // login redirect (fixed separately in EMLoginPage.jsx), and not via a
  // bookmarked or manually-typed /em/* URL either. This is deliberately a
  // role check, not an enable_em check: even a school with EM fully granted
  // must never let its own admin land inside the student experience itself.
  // Sent straight to their real dashboard, not back to /em/login (there is
  // nothing wrong with their credentials or their school's access — they
  // simply don't belong on this route at all).
  if (user.role === 'school_admin') {
    return <Navigate to="/school-admin/dashboard" replace />;
  }

  // Tenant boundary: a student/teacher whose school hasn't
  // been granted English Masterclass gets sent back to /em/login, which
  // will re-derive and display the same closed-door message a fresh login
  // attempt would show (user.school is only present for tenant accounts —
  // standalone users and App Admin are unaffected).
  if (user.school && !user.school.enable_em) {
    return (
      <Navigate
        to="/em/login"
        state={{ closedDoor: { service: 'em', otherServiceEnabled: !!user.school.enable_aischoolonair } }}
        replace
      />
    );
  }

  // AISchoolOnAir login alone doesn't grant EM access for a STANDALONE
  // student — they must also complete the separate one-time EM
  // registration step. A TENANT student's access is already fully
  // determined by the school gate above (user.school.enable_em) —
  // requiring this too was a real gap left over from the access-model
  // pivot: Prompt 1 collapsed this exact requirement for the other 7
  // languages but never touched English's own gate. Non-students
  // (teachers/admins) skip this either way, matching the backend gate.
  const needsEmRegistration =
    user.role === 'student' && !user.school && !user.em_registered_at && location.pathname !== '/em/register';
  if (needsEmRegistration) {
    return <Navigate to="/em/register" replace />;
  }

  return <Outlet />;
}
