import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../services/apiClient";

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get("token");
  const userId = params.get("id");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) return;

    try {
      await api.post("/auth/reset-password", {
        token,
        userId,
        newPassword,
      });

      navigate("/login");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="border p-2 rounded"
      />

      <input
        type="password"
        placeholder="Confirm password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="border p-2 rounded"
      />

      <button className="bg-black text-white px-4 py-2 rounded">
        Reset
      </button>
    </form>
  );
};

export default ResetPassword;
