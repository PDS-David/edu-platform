import { useState } from "react";
import PublicNav from "../components/PublicNav";
import api from "../services/apiClient";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.post("/auth/forgot-password", {
        email: email.toLowerCase().trim(),
      });

      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />

      <div className="flex-1 flex items-center justify-center">
        {!submitted ? (
          <form onSubmit={handleSubmit}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="border p-2"
            />

            <button disabled={loading}>
              {loading ? "Sending..." : "Send Reset"}
            </button>

            {error && <p className="text-red-500">{error}</p>}
          </form>
        ) : (
          <p>Check your email</p>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
