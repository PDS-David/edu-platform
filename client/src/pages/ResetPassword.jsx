import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../services/apiClient";

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get("token");
  // NOTE: the password-reset email (server/services/emailService.js,
  // sendPasswordResetEmail) only ever builds the link as
  // `${APP_URL}/reset-password?token=${token}` — it never includes an
  // `id`/`userId` param. The server's resetPassword controller
  // (server/controllers/auth.js) looks the user up solely by token:
  //   SELECT id FROM users WHERE reset_password_token = :token AND ...
  // and never reads req.body.userId at all. So `id` from the URL is
  // always null in real use and was never functionally required —
  // removed rather than kept as dead/misleading state.

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");

    if (!token) {
      setError("This reset link is missing or invalid. Please request a new one.");
      return;
    }
    // Matches the server's actual rule (controllers/auth.js validatePassword:
    // minimum 8 characters, nothing more) — checked client-side too so the
    // user gets instant feedback instead of waiting on a round-trip for
    // something we already know will fail.
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      // BUG FIX: was sending { token, userId, newPassword }. The server
      // (POST /auth/reset-password -> exports.resetPassword) destructures
      // `const { token, new_password } = req.body;` — new_password
      // (snake_case) was always undefined under the old camelCase key, so
      // `if (!token || !new_password)` failed on every single attempt,
      // returning a 400 that the old catch block only logged to the
      // console and never showed the user. userId was never read at all
      // (see note above) — dropped from the payload.
      await api.post("/auth/reset-password", {
        token,
        new_password: newPassword,
      });

      setSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      // err.message is populated by apiClient's response interceptor from
      // error.response.data.error (the server's actual message, e.g.
      // "Token is invalid or has expired" or "Password must be at least
      // 8 characters") with safe fallbacks — see services/apiClient.js.
      setError(err?.message || "Password reset failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-sm mx-auto mt-12 text-center space-y-2">
        <p className="text-green-700 font-medium">Password reset successful.</p>
        <p className="text-sm text-gray-500">Redirecting you to log in...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto mt-12">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <input
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        disabled={submitting}
        className="border p-2 rounded w-full disabled:opacity-60"
      />

      <input
        type="password"
        placeholder="Confirm password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        disabled={submitting}
        className="border p-2 rounded w-full disabled:opacity-60"
      />

      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
      >
        {submitting ? "Resetting..." : "Reset"}
      </button>
    </form>
  );
};

export default ResetPassword;
