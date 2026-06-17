import { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../api/authApi";

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // DEF-001: the auth token now lives only in an HttpOnly cookie set by the
  // server — JavaScript cannot read it, so there is no local token to check
  // before deciding whether to attempt a session restore. Instead, just ask
  // the server "who am I" on load; the browser sends the cookie
  // automatically (apiClient is configured with withCredentials: true), and
  // the server replies 401 if there's no valid cookie or it has expired.
  useEffect(() => {
    const init = async () => {
      try {
        const res = await authApi.getMe();
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login(email, password);
    // The server sets the HttpOnly auth cookie on this response; res.token
    // is still returned in the body for any non-browser consumers but is
    // intentionally not persisted to localStorage here.
    const userData = res.user;
    setUser(userData);

    return userData;
  };

  const register = async (payload) => {
    const res = await authApi.register(payload);
    const userData = res.user;
    setUser(userData);

    return userData;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the network call fails, clear local state — the cookie may
      // have already expired, and there is nothing else for the client to
      // clean up (no localStorage token to remove anymore).
    }
    setUser(null);
  };

  // Allows any consumer to patch the in-memory user object after a successful
  // profile or preferences save — without requiring a full re-fetch from the API.
  // Does not affect the token, login, or logout flows.
  const updateUser = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
