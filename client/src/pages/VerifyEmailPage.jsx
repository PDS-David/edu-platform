// client/src/pages/VerifyEmailPage.jsx
// Route: /verify-email?token=<token>&id=<userId>
// Reads token + id from URL, calls POST /api/auth/verify-email on mount.
// Shows success or error message with navigation options.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/apiClient';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const BG_GRADIENT = 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 50%, #f5f0ff 100%)';
const BTN_ACTIVE  = 'linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token  = searchParams.get('token');
    const userId = searchParams.get('id');

    if (!token || !userId) {
      setStatus('error');
      setMessage('Invalid verification link. Please check your email and try again.');
      return;
    }

    api.post('/auth/verify-email', { token, userId })
      .then(r => {
        setStatus('success');
        setMessage(r.message || 'Email verified successfully.');
      })
      .catch(err => {
        setStatus('error');
        setMessage(
          err?.error ||
          'This verification link is invalid or has expired. Please register again.'
        );
      });
  }, []); // eslint-disable-line

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG_GRADIENT }}>

      <PublicNav />

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center text-center gap-6">

          {/* Status icon */}
          {status === 'loading' && (
            <Loader2 size={48} className="text-indigo-500 animate-spin" />
          )}
          {status === 'success' && (
            <CheckCircle size={48} className="text-blue-500" />
          )}
          {status === 'error' && (
            <XCircle size={48} className="text-red-400" />
          )}

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {status === 'loading' && 'Verifying your email…'}
              {status === 'success' && 'Email Verified!'}
              {status === 'error'   && 'Verification Failed'}
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              {status === 'loading' ? 'Please wait a moment.' : message}
            </p>
          </div>

          {/* Actions */}
          {status === 'success' && (
            <Link
              to="/login"
              className="w-full py-3 rounded-xl text-sm font-semibold text-white text-center"
              style={{ background: BTN_ACTIVE }}
            >
              Go to Login
            </Link>
          )}
          {status === 'error' && (
            <div className="flex flex-col gap-3 w-full">
              <Link
                to="/register"
                className="w-full py-3 rounded-xl text-sm font-semibold text-white text-center"
                style={{ background: BTN_ACTIVE }}
              >
                Register Again
              </Link>
              <Link
                to="/"
                className="w-full py-3 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors text-center"
              >
                Back to Home
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
