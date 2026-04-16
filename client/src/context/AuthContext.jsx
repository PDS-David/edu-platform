import { createContext, useEffect, useState } from 'react';
import * as authApi from '../api/authApi';
import { setToken, getToken, clearToken } from '../utils/token';

export const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * INIT AUTH ON APP LOAD
   */
  useEffect(() => {
    const init = async () => {
      const token = getToken();

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await authApi.getMe();
        setUser(res.data);
      } catch (err) {
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  /**
   * LOGIN
   */
  const login = async (email, password) => {
    const res = await authApi.login(email, password);

    setToken(res.token);
    setUser(res.user);

    return res.user;
  };

  /**
   * REGISTER
   */
  const register = async (payload) => {
    const res = await authApi.register(payload);

    setToken(res.token);
    setUser(res.user);

    return res.user;
  };

  /**
   * LOGOUT
   */
  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
