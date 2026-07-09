import { useState } from "react";
import { Link } from "react-router-dom";
import PublicNav from "../components/PublicNav";
import api from "../services/apiClient";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post("/auth/forgot-password", {
        email: email.toLowerCase().trim(),
      });

      setSubmitted(true);
    } catch {
      setSubmitted(true); // intentionally silent (security best practice)
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />

      <div className="flex-1 flex items-center justify-center">
        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              className="border p-2 rounded"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
            <button disabled={loading} className="bg-black text-white px-4 py-2 rounded">
              Send Reset
            </button>
          </form>
        ) : (
          <div className="text-center">
            <p>Check your email</p>
            <Link to="/login" className="inline-block mt-3 text-sm font-semibold text-blue-600 hover:underline">
              ← Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
