// client/src/context/AuthContext.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Authentication context for the EAC Learning Platform.
//
// Roles: student | teacher | admin
//
// FIX v1.1:
//   1. /auth/me response parsing corrected.
//      The api.js response interceptor already unwraps response.data, so the
//      resolved value `r` is already { success, data: {...user} }.
//      Previous code checked r.data?.data (always undefined) — fixed to r?.data.
//
//   2. login() and register() catch blocks now correctly extract the error
//      message from the api.js interceptor's rejected value.
//      The interceptor rejects with the raw backend data object
//      { success: false, error: '...' }, so err.error is the right field.
//      We throw a plain { message } object so LoginPage/RegisterPage can read
//      err.message cleanly without depending on Axios internals.
//
// FIX v1.2 (Bug 3):
//   3. User shape inconsistency between login and page refresh fixed.
//      After login the auth controller returns camelCase fields (firstName,
//      lastName). After refresh /auth/me returns snake_case (first_name,
//      last_name). Any component reading user.firstName would silently get
//      undefined after a page refresh.
//      Fix: normalizeUser() merges both casings so every consumer always
//      gets BOTH forms — camelCase for convenience and snake_case for DB
//      round-trips. Applied to every code path that sets the user object.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import api from '../services/api';

const AuthContext = createContext(null);

// ── FIX v1.2: Normalize user object so both camelCase and snake_case fields
// are always present, regardless of which endpoint returned the user.
// login/register → auth controller → camelCase (firstName, lastName)
// page refresh   → /auth/me        → snake_case (first_name, last_name)
// After normalizeUser both forms coexist, so every component works correctly
// on first load AND after refresh without defensive fallbacks.
const normalizeUser = (u) => {
  if (!u) return u;
  return {
    ...u,
    // Ensure camelCase (from login) — fall back to snake_case (from /auth/me)
    firstName: u.firstName ?? u.first_name ?? '',
    lastName:  u.lastName  ?? u.last_name  ?? '',
    // Ensure snake_case (for DB round-trips / API calls)
    first_name: u.first_name ?? u.firstName ?? '',
    last_name:  u.last_name  ?? u.lastName  ?? '',
  };
};

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // ── Restore session from localStorage on app load ─────────────────────────
  useEffect(() => {
    const token     = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      // Paint the UI immediately from localStorage
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }

      // Refresh from server in background so subscription_status,
      // xp_points, study_streak_days etc. are always fresh.
      //
      // FIX: api.js interceptor returns response.data directly, so `r` here
      // is already { success: true, data: { id, email, role, ... } }.
      // The previous check `r.data?.data` was always undefined because
      // `r` has no nested `.data.data` — it IS the data. Fixed to `r?.data`.
      api
        .get('/auth/me')
        .then(r => {
          if (r?.data) {
            const normalized = normalizeUser(r.data);
            setUser(normalized);
            localStorage.setItem('user', JSON.stringify(normalized));
          }
        })
        .catch(() => {
          // Silent — don't log out on a network error or token expiry here;
          // the 401 interceptor in api.js handles forced logouts globally.
        });
    }

    setLoading(false);
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  // Used by: LoginPage.jsx
  // Roles:   student → /student/dashboard
  //          teacher → /teacher/dashboard
  //          admin   → /admin/dashboard
  const login = async (email, password, rememberMe = false) => {
    try {
      setError(null);

      // authAPI.login() resolves to response.data (interceptor-unwrapped):
      // { success: true, data: { user: {...}, token: '...' } }
      const response = await authAPI.login({
        email,
        password,
        remember_me: rememberMe,
      });

      const { user, token } = response.data;
      const normalizedUser  = normalizeUser(user);

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);

      return normalizedUser;
    } catch (err) {
      // FIX: api.js interceptor rejects with the backend's data object directly:
      // { success: false, error: 'Invalid credentials' }
      // So err.error is the message — not err.message (which would be an Axios
      // internal like "Request failed with status code 401").
      const message =
        err.error ||
        err.message ||
        'Login failed. Please check your credentials.';

      setError(message);

      // Throw a plain object so LoginPage.jsx can read err.message cleanly
      // without depending on Axios error internals
      throw { message };
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────
  // Used by: RegisterPage.jsx
  // Roles:   student (default) | teacher | admin
  // Boards:  JAMB, WAEC/NECO, Cambridge, AQA, Edexcel, IELTS, TOEFL, SAT,
  //          Junior WAEC, and any board added via the catalog
  const register = async (userData) => {
    try {
      setError(null);

      const response = await authAPI.register(userData);

      const { user, token } = response.data;
      const normalizedUser  = normalizeUser(user);

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);

      return normalizedUser;
    } catch (err) {
      const message =
        err.error ||
        err.message ||
        'Registration failed. Please try again.';

      setError(message);
      throw { message };
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  // Clears local state and storage for all roles.
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // ── Update user in context + localStorage ─────────────────────────────────
  // Called after profile edits, subscription changes, XP updates etc.
  // Works for all roles.
  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    updateUser,
    isAuthenticated: !!user,
    // Convenience role checks used across the app
    isStudent: user?.role === 'student',
    isTeacher: user?.role === 'teacher',
    isAdmin:   user?.role === 'admin',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
