import api from "./api";

export const login = (email, password) =>
  api.post("/api/auth/login", { email, password });

export const register = (payload) =>
  api.post("/api/auth/register", payload);

export const getMe = () =>
  api.get("/api/users/me");
