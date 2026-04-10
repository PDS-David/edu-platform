// client/src/pages/SettingsPage.jsx
// Route: /settings
// Unified settings page for Admin, Teacher, and Student roles.
// Features: profile info display, change password, notification preferences.

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/TopNav';
import api from '../services/api';
import {
  User, Lock, Bell, ChevronRight,
  Eye, EyeOff, Check, AlertTriangle,
  X, Loader2, Shield, Mail,
} from 'lucide-react';

// ── Toast ─────────────────────────────────────────────────────────────────────
const Toast = ({ message, type, onClose }) => (
  <div
    className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium
      ${type === 'success' ? 'bg-green-600' : 'bg-red-500'}`}
  >
    {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
    {message}
    <button onClick={onClose}><X size={14} /></button>
  </div>
);

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section = ({ title, subtitle, icon: Icon, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
      <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-teal-600" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

// ── Role badge ────────────────────────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const map = {
    admin:   { label: 'Admin',   classes: 'bg-red-100 text-red-700'    },
    teacher: { label: 'Teacher', classes: 'bg-purple-100 text-purple-700' },
    student: { label: 'Student', classes: 'bg-blue-100 text-blue-700'  },
  };
  const cfg = map[role] || { label: role, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  // ── Password form ─────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password:     '',
    confirm_password: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSaving,    setPwSaving]    = useState(false);
  const [pwErrors,    setPwErrors]    = useState({});

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState({
    email_updates:   true,
    weekly_digest:   true,
    new_assignments: true,
  });
  const [notifSaving, setNotifSaving] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fullName =
    `${user?.first_name || user?.firstName || ''} ${user?.last_name || user?.lastName || ''}`.trim() ||
    user?.username ||
    'User';

  const role = user?.role || 'student';

  const validatePassword = () => {
    const errs = {};
    if (!pwForm.current_password) errs.current_password = 'Required';
    if (!pwForm.new_password)     errs.new_password     = 'Required';
    else if (pwForm.new_password.length < 8)
      errs.new_password = 'Must be at least 8 characters';
    if (pwForm.new_password !== pwForm.confirm_password)
      errs.confirm_password = 'Passwords do not match';
    return errs;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePasswordChange = async () => {
    const errs = validatePassword();
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return; }
    setPwErrors({});
    setPwSaving(true);
    try {
      await api.put('/auth/change-password', {
        current_password: pwForm.current_password,
        new_password:     pwForm.new_password,
      });
      showToast('Password updated successfully');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      showToast(err?.error || 'Failed to update password. Check your current password.', 'error');
    } finally {
      setPwSaving(false);
    }
  };

  const handleNotifSave = async () => {
    setNotifSaving(true);
    try {
      await api.put('/auth/notifications', notifications);
      showToast('Notification preferences saved');
    } catch {
      showToast('Failed to save preferences', 'error');
    } finally {
      setNotifSaving(false);
    }
  };

  // ── Password input helper ─────────────────────────────────────────────────
  const PwInput = ({ field, label, show, onToggle, placeholder }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={pwForm[field]}
          onChange={e => { setPwForm(f => ({ ...f, [field]: e.target.value })); setPwErrors(er => ({ ...er, [field]: undefined })); }}
          placeholder={placeholder}
          className={`w-full border rounded-xl px-4 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2
            ${pwErrors[field]
              ? 'border-red-300 focus:ring-red-200'
              : 'border-gray-200 focus:ring-teal-300'
            }`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {pwErrors[field] && (
        <p className="text-xs text-red-500 mt-1">{pwErrors[field]}</p>
      )}
    </div>
  );

  // ── Notification toggle ───────────────────────────────────────────────────
  const NotifToggle = ({ field, label, description }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => setNotifications(n => ({ ...n, [field]: !n[field] }))}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          notifications[field] ? 'bg-teal-500' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            notifications[field] ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your account preferences</p>
        </div>

        {/* ── Profile Info ── */}
        <Section
          title="Profile"
          subtitle="Your account information"
          icon={User}
        >
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
              {fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-lg">{fullName}</p>
              <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-0.5">
                <Mail size={12} /> {user?.email || '—'}
              </p>
              <div className="mt-2">
                <RoleBadge role={role} />
              </div>
            </div>
          </div>

          {/* Role-specific info */}
          {role === 'teacher' && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Username</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{user?.username || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Account Type</p>
                <p className="text-sm font-semibold text-purple-700 mt-0.5">Teacher</p>
              </div>
            </div>
          )}

          {role === 'student' && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Subscription</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5 capitalize">
                  {user?.subscription_status || 'Free'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Account Type</p>
                <p className="text-sm font-semibold text-blue-700 mt-0.5">Student</p>
              </div>
            </div>
          )}

          {role === 'admin' && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="bg-red-50 rounded-xl p-3 flex items-center gap-2">
                <Shield size={14} className="text-red-500 shrink-0" />
                <p className="text-xs text-red-700 font-semibold">Administrator — Full platform access</p>
              </div>
            </div>
          )}
        </Section>

        {/* ── Change Password ── */}
        <Section
          title="Change Password"
          subtitle="Update your login password"
          icon={Lock}
        >
          <div className="space-y-4">
            <PwInput
              field="current_password"
              label="Current Password"
              show={showCurrent}
              onToggle={() => setShowCurrent(s => !s)}
              placeholder="Enter your current password"
            />
            <PwInput
              field="new_password"
              label="New Password"
              show={showNew}
              onToggle={() => setShowNew(s => !s)}
              placeholder="Minimum 8 characters"
            />
            <PwInput
              field="confirm_password"
              label="Confirm New Password"
              show={showConfirm}
              onToggle={() => setShowConfirm(s => !s)}
              placeholder="Re-enter your new password"
            />

            {/* Password strength hint */}
            {pwForm.new_password && (
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map(i => {
                  const len = pwForm.new_password.length;
                  const strength =
                    len >= 12 && /[A-Z]/.test(pwForm.new_password) && /[0-9]/.test(pwForm.new_password) && /[^a-zA-Z0-9]/.test(pwForm.new_password) ? 4 :
                    len >= 10 ? 3 :
                    len >= 8  ? 2 : 1;
                  const color =
                    strength >= 4 ? 'bg-green-500' :
                    strength >= 3 ? 'bg-teal-400' :
                    strength >= 2 ? 'bg-amber-400' : 'bg-red-400';
                  return (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? color : 'bg-gray-100'}`}
                    />
                  );
                })}
                <span className="text-xs text-gray-400 ml-1 whitespace-nowrap">
                  {pwForm.new_password.length >= 12 && /[A-Z]/.test(pwForm.new_password) && /[0-9]/.test(pwForm.new_password) ? 'Strong' :
                   pwForm.new_password.length >= 10 ? 'Good' :
                   pwForm.new_password.length >= 8  ? 'Fair' : 'Weak'}
                </span>
              </div>
            )}

            <button
              onClick={handlePasswordChange}
              disabled={pwSaving}
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              {pwSaving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <><Lock size={14} /> Update Password</>
              }
            </button>
          </div>
        </Section>

        {/* ── Notifications ── */}
        <Section
          title="Notifications"
          subtitle="Control what emails you receive"
          icon={Bell}
        >
          <div>
            <NotifToggle
              field="email_updates"
              label="Email Updates"
              description="Receive important account and platform updates"
            />
            <NotifToggle
              field="weekly_digest"
              label="Weekly Digest"
              description="Get a weekly summary of your activity and progress"
            />
            <NotifToggle
              field="new_assignments"
              label="New Assignments"
              description={
                role === 'student'
                  ? 'Notify me when a teacher assigns new content'
                  : 'Notify me when I receive a new subject assignment'
              }
            />
          </div>
          <button
            onClick={handleNotifSave}
            disabled={notifSaving}
            className="mt-4 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {notifSaving
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><Check size={14} /> Save Preferences</>
            }
          </button>
        </Section>

        {/* ── Danger Zone (sign out) ── */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-red-50">
            <h2 className="text-sm font-bold text-red-600">Sign Out</h2>
          </div>
          <div className="px-6 py-5 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              You will be signed out of your account on this device.
            </p>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 font-semibold px-4 py-2 rounded-xl text-sm transition-colors shrink-0 ml-4"
            >
              Sign Out
            </button>
          </div>
        </div>

      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
