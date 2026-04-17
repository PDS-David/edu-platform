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
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      await api.post("/auth/reset-password", {
        token,
        userId,
        newPassword,
      });

      navigate("/login");
    } catch (err) {
      setError(err?.message || "Reset failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && <p className="text-red-500">{error}</p>}

      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="New password"
      />

      <input
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Confirm password"
      />

      <button className="bg-green-600 text-white px-4 py-2">
        Reset
      </button>
    </form>
  );
};

export default ResetPassword;
