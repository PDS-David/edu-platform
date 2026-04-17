import { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../api/authApi";
import { setToken, getToken, clearToken } from "../utils/token";

export const AuthContext = createContext(null);

export const useAuth = () => {
  return useContext(AuthContext);
};

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ INITIAL AUTH CHECK
  useEffect(() => {
    const init = async () => {
      const token = getToken();

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await authApi.getMe();

        // ✅ Normalize response safely
        const userData =
          res?.data?.user ||
          res?.user ||
          res?.data ||
          null;

        setUser(userData);
      } catch (err) {
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // ✅ LOGIN
  const login = async (email, password) => {
    const res = await authApi.login(email, password);

    const token =
      res?.token ||
      res?.data?.token;

    const userData =
      res?.user ||
      res?.data?.user;

    if (token) setToken(token);
    setUser(userData);

    return userData;
  };

  // ✅ REGISTER
  const register = async (payload) => {
    const res = await authApi.register(payload);

    const token =
      res?.token ||
      res?.data?.token;

    const userData =
      res?.user ||
      res?.data?.user;

    if (token) setToken(token);
    setUser(userData);

    return userData;
  };

  // ✅ LOGOUT
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
