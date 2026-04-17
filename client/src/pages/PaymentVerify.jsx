// client/src/pages/PaymentVerify.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Paystack redirects to /payment/verify?reference=EAC-xxx after checkout.
// This page calls our /api/payments/verify/:reference endpoint, then
// shows success or failure and redirects the user.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/apiClient';
import {
  CheckCircle2, XCircle, Loader2, ChevronRight, RefreshCw
} from 'lucide-react';

const _rv = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = _rv.endsWith('/api') ? _rv : `${_rv}/api`;

export default function PaymentVerify() {
  const [searchParams]           = useSearchParams();
  const [status,    setStatus]   = useState('verifying');
  const [message,   setMessage]  = useState('');
  const [planName,  setPlanName] = useState('');

  useEffect(() => {
    const reference = searchParams.get('reference');

    if (!reference) {
      setStatus('failed');
      setMessage('No payment reference found. Please try again.');
      return;
    }

    const verify = async () => {
      try {
        // ── 1. Verify payment with Paystack via our backend ──
        const res = await api.get(`/payments/verify/${reference}`);

        if (res.success) {
          // ── 2. Activate student exam types from pending_exam_board_ids ──
          // The backend reads users.pending_exam_board_ids, creates
          // student_exam_types rows, then clears the pending column.
          try {
            await api.post('/payments/activate-exam-types', {
              subscription_id: res.data?.subscription_id,
            });
          } catch (typeErr) {
            // Non-fatal — exam types can be re-activated from dashboard
            console.warn('Exam type activation error:', typeErr);
          }

          setStatus('success');
          setPlanName(res.data?.plan_name || 'your plan');
          setMessage(res.message || 'Subscription activated successfully.');
        } else {
          setStatus('failed');
          setMessage(res.error || 'Payment verification failed.');
        }
      } catch (err) {
        setStatus('failed');
        setMessage(
          err?.error ||
          'Could not verify payment. Please contact support if your account was charged.'
        );
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-gray-100 shadow-lg p-8 text-center">

        {/* Verifying */}
        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verifying Payment</h2>
            <p className="text-gray-400 text-sm">Please wait while we confirm your payment with Paystack...</p>
          </>
        )}

        {/* Success */}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-gray-500 text-sm mb-1">{message}</p>
            {planName && (
              <p className="text-green-700 font-semibold text-sm mb-6">
                Welcome to {planName} 
              </p>
            )}
            <Link
              to="/student/dashboard"
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors w-full justify-center"
            >
              Go to Dashboard <ChevronRight size={16} />
            </Link>
          </>
        )}

        {/* Failed */}
        {status === 'failed' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-9 h-9 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Failed</h2>
            <p className="text-gray-500 text-sm mb-6">{message}</p>
            <div className="flex flex-col gap-3">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors justify-center"
              >
                <RefreshCw size={15} /> Try Again
              </Link>
              <Link
                to="/student/dashboard"
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Return to Dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
