// client/src/context/AuthContext.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Authentication context for the AISchoolonair.
//
// Roles: student | teacher | admin
//
// FIX v1.3 (Token extraction bug):
//   api.js response interceptor returns response.data directly, so the
//   resolved value from authAPI.login() / authAPI.register() is already:
//     { success: true, token: '...', data: { user: {...} } }
//
//   Previous code destructured `const { user, token } = response.data`
//   which looked for a nested `.data` that doesn't exist at that level,
//   causing token to be stored as "undefined" in localStorage.
//   Every subsequent protected request then got a 401, triggering the
//   auto-logout redirect — hence the "flash then back to login" bug.
//
//   Fix: extract token from response.token and user from response.data.user
//   Also fixed /auth/me handler to read r.data.user (not r.data directly).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import api from '../services/api';

const AuthContext = createContext(null);

// ── Normalize user object so both camelCase and snake_case fields are always
// present, regardless of which endpoint returned the user.
const normalizeUser = (u) => {
  if (!u) return u;
  return {
    ...u,
    firstName:  u.firstName  ?? u.first_name  ?? '',
    lastName:   u.lastName   ?? u.last_name   ?? '',
    first_name: u.first_name ?? u.firstName   ?? '',
    last_name:  u.last_name  ?? u.lastName    ?? '',
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

    if (token && savedUser && token !== 'undefined') {
      try {
        setUser(normalizeUser(JSON.parse(savedUser)));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }

      // Refresh from server in background so subscription_status,
      // xp_points, study_streak_days etc. are always fresh.
      //
      // FIX v1.3: interceptor returns response.data directly, so `r` is:
      //   { success: true, data: { id, email, role, ... } }
      // User is at r.data, not r.data.data or r directly.
      api
        .get('/auth/me')
        .then(r => {
          const freshUser = r?.data?.user ?? r?.data;
          if (freshUser && freshUser.id) {
            const normalized = normalizeUser(freshUser);
            setUser(normalized);
            localStorage.setItem('user', JSON.stringify(normalized));
          }
        })
        .catch(() => {
          // Silent — 401 interceptor in api.js handles forced logouts globally.
        });
    }

    setLoading(false);
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = async (email, password, rememberMe = false) => {
    try {
      setError(null);

      // FIX v1.3: api.js interceptor returns response.data directly, so the
      // resolved value is already:
      //   { success: true, token: '...', data: { user: {...} } }
      // token is at the TOP level, user is nested under .data.user
      const response = await authAPI.login({
        email,
        password,
        remember_me: rememberMe,
      });

      const token          = response.token;        // ✅ top-level
      const user           = response.data?.user;   // ✅ nested under data
      const normalizedUser = normalizeUser(user);

      if (!token || token === 'undefined') {
        throw { message: 'Login failed — no token received. Please try again.' };
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);

      return normalizedUser;
    } catch (err) {
      const message =
        err.error   ||
        err.message ||
        'Login failed. Please check your credentials.';
      setError(message);
      throw { message };
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────
  const register = async (userData) => {
    try {
      setError(null);

      // FIX v1.3: same shape as login —
      //   { success: true, token: '...', data: { user: {...} } }
      const response = await authAPI.register(userData);

      const token          = response.token;        // ✅ top-level
      const user           = response.data?.user;   // ✅ nested under data
      const normalizedUser = normalizeUser(user);

      if (!token || token === 'undefined') {
        throw { message: 'Registration failed — no token received. Please try again.' };
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);

      return normalizedUser;
    } catch (err) {
      const message =
        err.error   ||
        err.message ||
        'Registration failed. Please try again.';
      setError(message);
      throw { message };
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // ── Update user in context + localStorage ─────────────────────────────────
  const updateUser = (updatedUser) => {
    const normalized = normalizeUser(updatedUser);
    setUser(normalized);
    localStorage.setItem('user', JSON.stringify(normalized));
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
