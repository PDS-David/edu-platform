// client/src/pages/PricingPage.jsx
// Rebuilt: dark teal quiz-style design matching AI Buddy post-quiz upgrade screen.
// Also exports <UpgradeWall /> for inline use on quiz results when daily limit hit.
// Route: /pricing?score=5&max=41&time=273&accuracy=12 (query params optional)

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  Check, RotateCcw, ArrowLeft, Loader2, X,
  Trophy, Clock, Target
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Constants ──────────────────────────────────────────────────────────────────


// Prices in Kobo (₦100 = 10000 kobo). Update these as needed.
const MONTHLY_PRICE_KOBO = 200000;   // ₦2,000/month
const ANNUAL_PRICE_KOBO  = 600000;   // ₦6,000/year  (₦500/mo — save 75%)

const MONTHLY_DISPLAY = '₦2,000';
const ANNUAL_MONTHLY_DISPLAY = '₦500';   // per month billed annually
const ANNUAL_TOTAL_DISPLAY   = '₦6,000'; // billed per year

const FEATURES = [
  '200+ Subject Videos',
  '50,000+ Practice Questions',
  'AI Assistance',
  'Progress Tracker',
  'Topic Planner',
  'Paper wise Quizzes',
  'Assessments',
];

// ── Payment handler — calls backend to create transaction record ───────────────
async function initializePayment(plan, user, navigate, setPaying) {
  if (!user) { navigate('/register?redirect=pricing'); return; }
  setPaying(plan);
  try {
    const planCode = plan === 'annual' ? 'STUDENT_YEARLY' : 'STUDENT_MONTHLY';
    const res = await api.post('/payments/initialize', { plan_code: planCode });
    if (res.success && res.data?.authorization_url) {
      window.location.href = res.data.authorization_url;
    } else {
      alert('Could not start payment. Please try again.');
      setPaying(null);
    }
  } catch (err) {
    alert(err?.error || 'Payment error. Please try again.');
    setPaying(null);
  }
}

// ── Stat card (shared between page and UpgradeWall) ────────────────────────────
const StatCard = ({ icon: Icon, label, value, accent }) => (
  <div className={`bg-white/10 backdrop-blur rounded-2xl p-4 border-l-4 ${accent} flex items-center gap-3 flex-1`}>
    <Icon size={20} className="text-white/70 shrink-0" />
    <div>
      <p className="text-white/50 text-xs font-medium">{label}</p>
      <p className="text-white text-lg font-bold">{value}</p>
    </div>
  </div>
);

// ── Format seconds → "Xm Ys" ─────────────────────────────────────────────────
const fmtTime = (s) => {
  const secs = Number(s) || 0;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
};

// ══════════════════════════════════════════════════════════════════════════════
// PRICING PAGE
// ══════════════════════════════════════════════════════════════════════════════

// ── Current Plan + Cancel Subscription card ───────────────────────────────────
function CurrentPlanCard() {
  const { user, updateUser } = useAuth();
  const [sub,        setSub]        = useState(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [confirm,    setConfirm]    = useState(false);
  const [message,    setMessage]    = useState('');

  useEffect(() => {
    api.get('/payments/subscription')
      .then(r => setSub(r.data || null))
      .catch(() => {})
      .finally(() => setLoadingSub(false));
  }, []);

  if (loadingSub) return null;
  if (!sub || !['active', 'free_trial'].includes(user?.subscription_status)) return null;

  const expiryLabel = sub.end_date
    ? new Date(sub.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await api.post('/payments/cancel', {});
      setMessage(res.message);
      setConfirm(false);
      if (updateUser) updateUser({ ...user, subscription_status: 'cancelled' });
    } catch (err) {
      setMessage(err?.error || 'Cancellation failed. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
      <p className="text-white/50 text-xs font-semibold uppercase tracking-wide mb-3">Current Plan</p>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-white font-bold text-lg">{sub.plan_name || 'Active Plan'}</p>
          <p className="text-white/50 text-xs mt-0.5">Access until {expiryLabel}</p>
        </div>
        {!message && (
          <button
            onClick={() => setConfirm(true)}
            className="text-xs font-semibold text-red-400 border border-red-400/40 px-4 py-2 rounded-xl hover:bg-red-400/10 transition-colors"
          >
            Cancel Subscription
          </button>
        )}
      </div>

      {message && (
        <p className="mt-3 text-sm text-teal-300 leading-relaxed">{message}</p>
      )}

      {confirm && (
        <div className="mt-4 bg-red-900/20 border border-red-500/20 rounded-xl p-4">
          <p className="text-white/80 text-sm mb-3">
            Are you sure you want to cancel? You will retain access until <strong>{expiryLabel}</strong>.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
            >
              {cancelling ? 'Cancelling\u2026' : 'Yes, Cancel'}
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="flex-1 border border-white/20 text-white/70 hover:text-white text-sm font-semibold py-2 rounded-xl transition-colors"
            >
              Keep Subscription
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const [paying,    setPaying]    = useState(null); // 'annual' | 'monthly'
  const [toastOpen, setToastOpen] = useState(true);

  // Optional score cards from query params
  const score    = params.get('score');
  const max      = params.get('max');
  const time     = params.get('time');
  const accuracy = params.get('accuracy');
  const hasScore = score !== null && max !== null;

  const handleEnrol = (plan) => {
    initializePayment(plan, user, navigate, setPaying);
  };

  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col">

      {/* Back link */}
      <div className="px-4 pt-5 pb-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={15} /> Back
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-lg mx-auto w-full">

        {/* Current plan + cancel — only for subscribed users */}
        <CurrentPlanCard />

        {/* Score cards — only if coming from quiz */}
        {hasScore && (
          <div className="flex gap-3 w-full mb-8">
            <StatCard icon={Trophy} label="Total Score"  value={`${score}/${max}`}   accent="border-l-green-400" />
            <StatCard icon={Clock}  label="Time Taken"   value={fmtTime(time)}        accent="border-l-purple-400" />
            <StatCard icon={Target} label="Accuracy"     value={`${accuracy}%`}       accent="border-l-pink-400" />
          </div>
        )}

        {/* Crown + heading */}
        <div className="text-5xl mb-3 select-none">👑</div>
        <h1 className="text-2xl font-bold text-white text-center mb-6 leading-snug">
          Unlock your Full<br />Learning Potential!
        </h1>

        {/* Feature checklist */}
        <ul className="space-y-2.5 mb-8 w-full">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-teal-400/20 flex items-center justify-center shrink-0">
                <Check size={12} className="text-teal-400" strokeWidth={3} />
              </span>
              <span className="text-white/90 text-sm">{f}</span>
            </li>
          ))}
        </ul>

        {/* Pricing cards */}
        <div className="grid grid-cols-2 gap-4 w-full mb-6">

          {/* 12 months — featured */}
          <div className="relative flex flex-col bg-[#0d1f3c] rounded-2xl overflow-hidden border border-purple-500/40 ring-1 ring-purple-400/20 shadow-xl">
            {/* Save badge */}
            <div className="bg-amber-400 text-gray-900 text-[10px] font-black text-center py-1.5 px-2 tracking-wide uppercase">
              Save 75% off
            </div>
            <div className="flex-1 flex flex-col p-4 gap-3">
              <p className="text-white font-bold text-base">12 months</p>
              <div>
                <p className="text-white text-2xl font-black leading-none">{ANNUAL_MONTHLY_DISPLAY}<span className="text-sm font-medium text-white/60">/Month</span></p>
                <p className="text-white/40 text-xs mt-1">Billed at {ANNUAL_TOTAL_DISPLAY}/Year</p>
              </div>
              <button
                onClick={() => handleEnrol('annual')}
                disabled={paying === 'annual'}
                className="w-full flex items-center justify-center gap-1.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50
                  text-white font-bold text-sm py-2.5 rounded-xl transition-colors mt-auto"
              >
                {paying === 'annual'
                  ? <><Loader2 size={13} className="animate-spin" /> Processing…</>
                  : 'Enrol Now'
                }
              </button>
            </div>
          </div>

          {/* 1 month */}
          <div className="flex flex-col bg-[#0d1f3c] rounded-2xl overflow-hidden border border-white/20 shadow-lg">
            <div className="flex-1 flex flex-col p-4 gap-3 pt-5">
              <p className="text-white font-bold text-base">1 month</p>
              <div>
                <p className="text-white text-2xl font-black leading-none">{MONTHLY_DISPLAY}<span className="text-sm font-medium text-white/60">/Month</span></p>
                <p className="text-white/40 text-xs mt-1">Billed at {MONTHLY_DISPLAY}/Month</p>
              </div>
              <button
                onClick={() => handleEnrol('monthly')}
                disabled={paying === 'monthly'}
                className="w-full flex items-center justify-center gap-1.5 border border-white/40 hover:bg-white/10 disabled:opacity-50
                  text-white font-semibold text-sm py-2.5 rounded-xl transition-colors mt-auto"
              >
                {paying === 'monthly'
                  ? <><Loader2 size={13} className="animate-spin" /> Processing…</>
                  : 'Enrol Now'
                }
              </button>
            </div>
          </div>
        </div>

        {/* Small print */}
        <p className="text-white/30 text-xs text-center">
          Payments secured by Paystack · Prices in NGN · VAT may apply
        </p>
      </div>

      {/* Revise Now toast */}
      {toastOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
          bg-gray-900/95 backdrop-blur text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-2xl whitespace-nowrap">
          <span>Let's revise and bounce back stronger</span>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-gray-900
              font-bold text-xs px-3 py-1.5 rounded-full transition-colors shrink-0"
          >
            Revise Now <RotateCcw size={12} />
          </button>
          <button onClick={() => setToastOpen(false)} className="text-white/40 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// UPGRADE WALL — inline component for quiz results page
// Usage: <UpgradeWall score={5} max={41} time={273} accuracy={12} />
// ══════════════════════════════════════════════════════════════════════════════
export function UpgradeWall({ score, max, time, accuracy, onRevise }) {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [paying,  setPaying]  = useState(null);
  const [visible, setVisible] = useState(true);

  const handleEnrol = (plan) => {
    initializePayment(plan, user, navigate, setPaying);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0a4a3f] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Close */}
        <div className="flex justify-end px-4 pt-4">
          <button onClick={() => setVisible(false)} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-6 flex flex-col items-center gap-4">

          {/* Score cards */}
          {score !== undefined && (
            <div className="flex gap-2 w-full">
              <StatCard icon={Trophy} label="Score"    value={`${score}/${max}`}   accent="border-l-green-400" />
              <StatCard icon={Clock}  label="Time"     value={fmtTime(time)}        accent="border-l-purple-400" />
              <StatCard icon={Target} label="Accuracy" value={`${accuracy}%`}       accent="border-l-pink-400" />
            </div>
          )}

          <div className="text-4xl">👑</div>
          <h2 className="text-xl font-bold text-white text-center leading-snug">
            Unlock your Full<br />Learning Potential!
          </h2>

          {/* Compact feature list */}
          <ul className="space-y-2 w-full">
            {FEATURES.slice(0, 5).map(f => (
              <li key={f} className="flex items-center gap-2.5">
                <Check size={12} className="text-teal-400 shrink-0" strokeWidth={3} />
                <span className="text-white/80 text-xs">{f}</span>
              </li>
            ))}
          </ul>

          {/* Cards */}
          <div className="grid grid-cols-2 gap-3 w-full">

            <div className="relative flex flex-col bg-[#0d1f3c] rounded-xl overflow-hidden border border-purple-500/40">
              <div className="bg-amber-400 text-gray-900 text-[9px] font-black text-center py-1 tracking-wide uppercase">
                Save 75%
              </div>
              <div className="p-3 flex flex-col gap-2">
                <p className="text-white font-bold text-sm">12 months</p>
                <p className="text-white font-black text-lg leading-none">{ANNUAL_MONTHLY_DISPLAY}<span className="text-xs text-white/50">/mo</span></p>
                <p className="text-white/40 text-[10px]">Billed {ANNUAL_TOTAL_DISPLAY}/yr</p>
                <button
                  onClick={() => handleEnrol('annual')}
                  disabled={paying === 'annual'}
                  className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-bold text-xs py-2 rounded-lg transition-colors"
                >
                  {paying === 'annual' ? <Loader2 size={11} className="animate-spin mx-auto" /> : 'Enrol Now'}
                </button>
              </div>
            </div>

            <div className="flex flex-col bg-[#0d1f3c] rounded-xl overflow-hidden border border-white/20">
              <div className="p-3 flex flex-col gap-2 pt-4">
                <p className="text-white font-bold text-sm">1 month</p>
                <p className="text-white font-black text-lg leading-none">{MONTHLY_DISPLAY}<span className="text-xs text-white/50">/mo</span></p>
                <p className="text-white/40 text-[10px]">Billed monthly</p>
                <button
                  onClick={() => handleEnrol('monthly')}
                  disabled={paying === 'monthly'}
                  className="w-full border border-white/30 hover:bg-white/10 disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-lg transition-colors"
                >
                  {paying === 'monthly' ? <Loader2 size={11} className="animate-spin mx-auto" /> : 'Enrol Now'}
                </button>
              </div>
            </div>
          </div>

          {/* Revise Now */}
          <button
            onClick={() => { setVisible(false); onRevise?.(); }}
            className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold text-sm px-5 py-2.5 rounded-full transition-colors w-full justify-center"
          >
            Revise Now <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
