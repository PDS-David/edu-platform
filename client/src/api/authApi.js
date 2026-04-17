import api from "../services/apiClient";

/**
 * LOGIN
 */
export const login = async (email, password) => {
  const res = await api.post("/auth/login", {
    email,
    password,
  });

  return res.data;
};

/**
 * REGISTER
 */
export const register = async (payload) => {
  const res = await api.post("/auth/register", payload);
  return res.data;
};

/**
 * GET CURRENT USER
 */
export const getMe = async () => {
  const res = await api.get("/auth/me");
  return res.data;
};
