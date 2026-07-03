import { createContext, useContext, useEffect, useState } from 'react';
import * as authApi from '../api/authApi';
import { setToken, getToken, clearToken } from '../utils/token';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

/**
 * AuthContext  —  AUTH-003 / AUTH-004 / AUTH-005
 *
 * - login(email, password, rememberMe) forwards rememberMe to the API
 * - Access token is stored in memory / sessionStorage (never localStorage)
 * - Refresh token lives in HttpOnly cookie managed by the server
 * - On app boot, if a stored token exists it's validated; if stale, the
 *   silent refresh flow in apiClient recovers the session automatically
 */
export default function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const token = getToken();
      if (!token) { setLoading(false); return; }

      try {
        const res = await authApi.getMe();
        setUser(res.user);
      } catch {
        // Token invalid or expired and refresh also failed (handled in apiClient)
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // AUTH-003: rememberMe drives token lifetime on the server
  const login = async (email, password, rememberMe = false) => {
    const res = await authApi.login(email, password, rememberMe);
    if (res.token) setToken(res.token, rememberMe);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload) => {
    const res = await authApi.register(payload);
    if (res.token) setToken(res.token, false);
    setUser(res.user);
    return res.user;
  };

  // Standalone English Masterclass registration — creates its own account
  // and grants EM access in one step, independent of the AISchoolonair
  // register() above.
  const registerForEM = async (payload) => {
    const res = await authApi.emRegister(payload);
    if (res.token) setToken(res.token, false);
    setUser(res.user);
    return res.user;
  };

  // AUTH-002: single-session logout — server revokes the token
  const logout = async () => {
    try { await authApi.logout(); } catch {}
    clearToken();
    setUser(null);
  };

  // AUTH-002: all-device logout
  const logoutAll = async () => {
    try { await authApi.logoutAll(); } catch {}
    clearToken();
    setUser(null);
  };

  const updateUser = (updates) => setUser(prev => ({ ...prev, ...updates }));

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, registerForEM, logout, logoutAll, updateUser,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
