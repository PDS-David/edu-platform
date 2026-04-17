import { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../services/authApi";
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
        const user = await authApi.getMe();
        setUser(user);
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

    if (res?.token) setToken(res.token);
    setUser(res?.user);

    return res?.user;
  };

  const register = async (payload) => {
    const res = await authApi.register(payload);

    if (res?.token) setToken(res.token);
    setUser(res?.user);

    return res?.user;
  };

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
