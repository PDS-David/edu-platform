import { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../api/authApi";
import { setToken, getToken, clearToken } from "../utils/token";

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const token = getToken();
      if (!token) return setLoading(false);

      try {
        const res = await authApi.getMe();
        setUser(res.user);
      } catch {
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login(email, password);

    if (res.token) setToken(res.token);

    const userData = res.user;
    setUser(userData);

    return userData;
  };

  const register = async (payload) => {
    const res = await authApi.register(payload);

    if (res.token) setToken(res.token);

    const userData = res.user;
    setUser(userData);

    return userData;
  };

  const logout = () => {
    clearToken();
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
