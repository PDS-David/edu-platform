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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!token || !userId) {
      setError("Invalid reset link");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await api.post("/auth/reset-password", {
        token,
        userId,
        newPassword,
      });

      navigate("/login");
    } catch (err) {
      setError(err?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
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

      <button disabled={loading}>
        {loading ? "Resetting..." : "Reset"}
      </button>

      {error && <p className="text-red-500">{error}</p>}
    </form>
  );
};

export default ResetPassword;
