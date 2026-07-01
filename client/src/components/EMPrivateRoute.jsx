// client/src/components/EMPrivateRoute.jsx
// Auth guard for the /em/* route group.
// Unauthenticated users go to /em/login (not /login).
// All authenticated roles are permitted — EM is open to students,
// teachers and admins (the content is role-agnostic vocabulary training).

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

  return <Outlet />;
}
