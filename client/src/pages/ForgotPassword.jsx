import { useState } from "react";
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
      setSubmitted(true); // security-safe behavior
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="border p-2"
            />
            <button disabled={loading} className="bg-blue-600 text-white px-4 py-2">
              Send Reset
            </button>
          </form>
        ) : (
          <p>Check your email</p>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
