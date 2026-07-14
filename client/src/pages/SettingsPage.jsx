// client/src/pages/SettingsPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/TopNav';
import api from '../services/apiClient';
import {
  User, Lock, Bell, Eye, EyeOff, Check, AlertTriangle,
  X, Loader2, Shield, Mail, Phone, Globe, Calendar,
  Target, BookOpen, Clock, ChevronRight, Sparkles,
} from 'lucide-react';

const Toast = ({ message, type, onClose }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${type === 'success' ? 'bg-blue-600' : 'bg-red-500'}`}>
    {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
    {message}
    <button onClick={onClose}><X size={14} /></button>
  </div>
);

const Section = ({ title, subtitle, icon: Icon, children, accent = 'teal' }) => {
  const colors = { teal: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', blue: 'bg-blue-50 text-blue-600', red: 'bg-red-50 text-red-500' };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors[accent]}`}>
          <Icon size={18} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
};

const RoleBadge = ({ role }) => {
  const map = { admin: 'bg-red-100 text-red-700', teacher: 'bg-purple-100 text-purple-700', student: 'bg-blue-100 text-blue-700', school_admin: 'bg-indigo-100 text-indigo-700' };
  const label = role === 'school_admin' ? 'School Admin' : role?.charAt(0).toUpperCase() + role?.slice(1);
  return <span className={`text-xs font-semibold px-3 py-1 rounded-full ${map[role] || 'bg-gray-100 text-gray-600'}`}>{label}</span>;
};

const Toggle = ({ value, onChange }) => (
  <button onClick={() => onChange(!value)} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-blue-500' : 'bg-gray-200'}`}>
    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIMES = ['morning', 'afternoon', 'evening', 'night'];
const GOALS = [10, 20, 30, 50, 100];

export default function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  // Profile
  const [profile, setProfile] = useState({ first_name: '', last_name: '', phone: '', country: '' });
  const [profileSaving, setProfileSaving] = useState(false);

  // Avatar
  const [avatarUrl,       setAvatarUrl]       = useState(user?.avatar_url || null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);

  // Email change
  const [emailForm, setEmailForm]   = useState({ new_email: '', current_password: '' });
  const [emailErrors, setEmailErrors] = useState({});
  const [emailSaving, setEmailSaving] = useState(false);
  const [pwErrors, setPwErrors] = useState({});

  // Notifications
  const [notifs, setNotifs] = useState({ email_updates: true, weekly_digest: true, new_assignments: true });
  const [notifSaving, setNotifSaving] = useState(false);

  // Study preferences (students only)
  const [studyPrefs, setStudyPrefs] = useState({ daily_goal: 20, study_days: ['Mon','Wed','Fri'], study_time: 'evening' });
  const [studySaving, setStudySaving] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (user) {
      setProfile({
        first_name: user.first_name || user.firstName || '',
        last_name:  user.last_name  || user.lastName  || '',
        phone:   user.phone   || '',
        country: user.country || '',
      });
      if (user.daily_goal) setStudyPrefs(p => ({ ...p, daily_goal: user.daily_goal }));
      if (user.preferred_study_days) {
        try { setStudyPrefs(p => ({ ...p, study_days: JSON.parse(user.preferred_study_days) })); } catch {}
      }
      if (user.preferred_study_time) setStudyPrefs(p => ({ ...p, study_time: user.preferred_study_time }));
    }
    // S2: load notification prefs from DB so they persist across devices.
    // Falls back to defaults gracefully if the column doesn't exist yet.
    api.get('/auth/notification-preferences')
      .then(r => {
        const prefs = r.data || r;
        if (prefs && typeof prefs === 'object') {
          setNotifs(n => ({ ...n, ...prefs }));
        }
      })
      .catch(() => {
        // DB column not yet migrated on this env — fall back to localStorage
        try {
          const saved = JSON.parse(localStorage.getItem(`notif_prefs_${user.id}`) || '{}');
          if (Object.keys(saved).length) setNotifs(n => ({ ...n, ...saved }));
        } catch {}
      });
  }, [user]);

  const fullName = `${user?.first_name || user?.firstName || ''} ${user?.last_name || user?.lastName || ''}`.trim() || 'User';
  const role = user?.role || 'student';

  const trialDaysLeft = () => {
    if (user?.subscription_expires_at && user?.subscription_status === 'free_trial') {
      const days = Math.ceil((new Date(user.subscription_expires_at) - new Date()) / 86400000);
      return days > 0 ? days : 0;
    }
    return null;
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5 MB', 'error');
      return;
    }
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await api.post('/auth/avatar', form);
      const url = res.avatar_url || res.data?.avatar_url;
      setAvatarUrl(url);
      updateUser({ avatar_url: url });
      showToast('Profile photo updated', 'success');
    } catch (err) {
      showToast(err?.message || 'Upload failed', 'error');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      await api.patch('/auth/profile', profile);
      updateUser(profile);
      showToast('Profile updated successfully');
    } catch (err) {
      showToast(err?.message || 'Failed to update profile', 'error');
    } finally { setProfileSaving(false); }
  };

  const handlePasswordChange = async () => {
    const errs = {};
    if (!pwForm.current_password) errs.current_password = 'Required';
    if (!pwForm.new_password) errs.new_password = 'Required';
    else if (pwForm.new_password.length < 8) errs.new_password = 'Minimum 8 characters';
    if (pwForm.new_password !== pwForm.confirm_password) errs.confirm_password = 'Passwords do not match';
    if (Object.keys(errs).length) { setPwErrors(errs); return; }
    setPwErrors({});
    setPwSaving(true);
    try {
      await api.put('/auth/password', { current_password: pwForm.current_password, new_password: pwForm.new_password });
      showToast('Password updated successfully');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      showToast(err?.message || 'Incorrect current password', 'error');
    } finally { setPwSaving(false); }
  };

  const handleNotifSave = async () => {
    setNotifSaving(true);
    try {
      await api.patch('/auth/notification-preferences', notifs);
      // Also write to localStorage as a cache so the next load is instant
      try { localStorage.setItem(`notif_prefs_${user.id}`, JSON.stringify(notifs)); } catch {}
      showToast('Notification preferences saved');
    } catch (err) {
      showToast(err?.message || 'Failed to save preferences', 'error');
    } finally { setNotifSaving(false); }
  };

  const handleEmailChange = async () => {
    const errs = {};
    if (!emailForm.new_email)        errs.new_email        = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.new_email)) errs.new_email = 'Invalid email';
    if (!emailForm.current_password) errs.current_password = 'Required';
    setEmailErrors(errs);
    if (Object.keys(errs).length) return;

    setEmailSaving(true);
    try {
      const res = await api.patch('/auth/email', emailForm);
      updateUser({ email: res.data?.email || emailForm.new_email });
      showToast('Email updated successfully');
      setEmailForm({ new_email: '', current_password: '' });
    } catch (err) {
      showToast(err?.message || 'Failed to update email', 'error');
    } finally { setEmailSaving(false); }
  };

  const handleStudySave = async () => {
    setStudySaving(true);
    try {
      await api.patch('/users/preferences', {
        daily_goal:          studyPrefs.daily_goal,
        preferred_study_days: JSON.stringify(studyPrefs.study_days),
        preferred_study_time: studyPrefs.study_time,
      });
      updateUser({ daily_goal: studyPrefs.daily_goal });
      showToast('Study preferences saved');
    } catch (err) {
      showToast(err?.message || 'Failed to save preferences', 'error');
    } finally { setStudySaving(false); }
  };

  const PwInput = ({ field, label, showKey }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={showPw[showKey] ? 'text' : 'password'}
          value={pwForm[field]}
          onChange={e => { setPwForm(f => ({ ...f, [field]: e.target.value })); setPwErrors(er => ({ ...er, [field]: undefined })); }}
          className={`w-full border rounded-xl px-4 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 ${pwErrors[field] ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-300'}`}
        />
        <button type="button" onClick={() => setShowPw(s => ({ ...s, [showKey]: !s[showKey] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          {showPw[showKey] ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {pwErrors[field] && <p className="text-xs text-red-500 mt-1">{pwErrors[field]}</p>}
    </div>
  );

  const strengthScore = (pw) => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
    if (/[^a-zA-Z0-9]/.test(pw)) s++;
    return s;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {role !== 'student' && <TopNav />}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your account, preferences and study schedule</p>
        </div>

        {/* ── Profile ── */}
        <Section title="Profile" subtitle="Update your personal information" icon={User}>
          <div className="flex items-center gap-4 mb-5">
            {/* Clickable avatar — click to upload a new photo */}
            <label className="relative w-16 h-16 rounded-2xl shrink-0 cursor-pointer group" title="Click to change photo">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
              />
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarUploading
                  ? <Loader2 size={18} className="text-white animate-spin" />
                  : <span className="text-white text-xs font-semibold">📷</span>
                }
              </div>
            </label>
            <div>
              <p className="font-bold text-gray-900 text-lg">{fullName}</p>
              <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-0.5"><Mail size={12} /> {user?.email}</p>
              <div className="mt-1.5"><RoleBadge role={role} /></div>
            </div>
          </div>

          {/* Subscription banner for students */}
          {role === 'student' && (
            <div className={`mb-4 rounded-xl p-3 flex items-center justify-between ${user?.subscription_status === 'active' ? 'bg-green-50' : user?.subscription_status === 'free_trial' ? 'bg-blue-50' : 'bg-amber-50'}`}>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className={user?.subscription_status === 'active' ? 'text-green-600' : 'text-blue-600'} />
                <div>
                  <p className="text-xs font-bold text-gray-800 capitalize">{user?.subscription_status === 'free_trial' ? '14-Day Free Trial' : user?.subscription_status || 'Free'}</p>
                  {trialDaysLeft() !== null && <p className="text-xs text-gray-500">{trialDaysLeft()} days remaining</p>}
                </div>
              </div>
              {user?.subscription_status !== 'active' && (
                <button onClick={() => navigate('/pricing')} className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1">Upgrade <ChevronRight size={12} /></button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { field: 'first_name', label: 'First Name', icon: User },
              { field: 'last_name',  label: 'Last Name',  icon: User },
              { field: 'phone',      label: 'Phone',       icon: Phone },
              { field: 'country',    label: 'Country',     icon: Globe },
            ].map(({ field, label, icon: Icon }) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                <div className="relative">
                  <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={profile[field]}
                    onChange={e => setProfile(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleProfileSave} disabled={profileSaving} className="mt-4 flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            {profileSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Profile</>}
          </button>
        </Section>

        {/* ── Study Preferences (students only) ── */}
        {role === 'student' && (
          <Section title="Study Preferences" subtitle="Customise your daily goal and schedule" icon={Target} accent="blue">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><BookOpen size={14} /> Daily Question Goal</p>
                <div className="flex gap-2 flex-wrap">
                  {GOALS.map(g => (
                    <button key={g} onClick={() => setStudyPrefs(p => ({ ...p, daily_goal: g }))}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${studyPrefs.daily_goal === g ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Calendar size={14} /> Study Days</p>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map(d => (
                    <button key={d} onClick={() => setStudyPrefs(p => ({ ...p, study_days: p.study_days.includes(d) ? p.study_days.filter(x => x !== d) : [...p.study_days, d] }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${studyPrefs.study_days.includes(d) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Clock size={14} /> Preferred Study Time</p>
                <div className="flex gap-2 flex-wrap">
                  {TIMES.map(t => (
                    <button key={t} onClick={() => setStudyPrefs(p => ({ ...p, study_time: t }))}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border capitalize transition-colors ${studyPrefs.study_time === t ? 'bg-purple-500 border-purple-500 text-white' : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={handleStudySave} disabled={studySaving} className="mt-4 flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {studySaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Schedule</>}
            </button>
          </Section>
        )}

        {/* ── Change Password ── */}
        <Section title="Change Password" subtitle="Update your login password" icon={Lock}>
          <div className="space-y-4">
            <PwInput field="current_password" label="Current Password" showKey="current" />
            <PwInput field="new_password"     label="New Password"     showKey="new" />
            <PwInput field="confirm_password" label="Confirm Password" showKey="confirm" />
            {pwForm.new_password && (
              <div className="flex items-center gap-2">
                {[1,2,3,4].map(i => {
                  const s = strengthScore(pwForm.new_password);
                  const color = s >= 4 ? 'bg-green-500' : s >= 3 ? 'bg-blue-400' : s >= 2 ? 'bg-amber-400' : 'bg-red-400';
                  return <div key={i} className={`h-1 flex-1 rounded-full ${i <= s ? color : 'bg-gray-100'}`} />;
                })}
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {strengthScore(pwForm.new_password) >= 4 ? 'Strong' : strengthScore(pwForm.new_password) >= 3 ? 'Good' : strengthScore(pwForm.new_password) >= 2 ? 'Fair' : 'Weak'}
                </span>
              </div>
            )}
            <button onClick={handlePasswordChange} disabled={pwSaving} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {pwSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Lock size={14} /> Update Password</>}
            </button>
          </div>
        </Section>

        {/* ── Change Email ── */}
        <Section title="Change Email Address" subtitle="Update the email used to sign in" icon={Mail} accent="blue">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                <Mail size={12} /> Current email: <span className="font-semibold text-gray-700">{user?.email}</span>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">New Email Address</label>
                  <input
                    type="email"
                    value={emailForm.new_email}
                    onChange={e => setEmailForm(f => ({ ...f, new_email: e.target.value }))}
                    placeholder="new@email.com"
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${emailErrors.new_email ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-300'}`}
                  />
                  {emailErrors.new_email && <p className="text-xs text-red-500 mt-1">{emailErrors.new_email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Confirm with Current Password</label>
                  <input
                    type="password"
                    value={emailForm.current_password}
                    onChange={e => setEmailForm(f => ({ ...f, current_password: e.target.value }))}
                    placeholder="Your current password"
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${emailErrors.current_password ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-300'}`}
                  />
                  {emailErrors.current_password && <p className="text-xs text-red-500 mt-1">{emailErrors.current_password}</p>}
                </div>
              </div>
            </div>
            <button onClick={handleEmailChange} disabled={emailSaving} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {emailSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Mail size={14} /> Update Email</>}
            </button>
          </div>
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications" subtitle="Control what emails you receive" icon={Bell}>
          {[
            { field: 'email_updates',   label: 'Platform Updates',   desc: 'Important account and platform news' },
            { field: 'weekly_digest',   label: 'Weekly Digest',      desc: 'A weekly summary of your activity' },
            { field: 'new_assignments', label: 'New Assignments',     desc: role === 'student' ? 'When a teacher assigns new content' : 'When you receive a new subject assignment' },
          ].map(({ field, label, desc }) => (
            <div key={field} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <Toggle value={notifs[field]} onChange={v => setNotifs(n => ({ ...n, [field]: v }))} />
            </div>
          ))}
          <button onClick={handleNotifSave} disabled={notifSaving} className="mt-4 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            {notifSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Preferences</>}
          </button>
        </Section>

        {/* Admin badge */}
        {role === 'admin' && (
          <Section title="Administrator Access" subtitle="Full platform management" icon={Shield} accent="red">
            <div className="flex items-center gap-3 bg-red-50 rounded-xl p-3">
              <Shield size={16} className="text-red-500" />
              <div>
                <p className="text-sm font-bold text-red-700">Admin — Full platform access</p>
                <p className="text-xs text-red-500 mt-0.5">You have unrestricted access to all platform features</p>
              </div>
            </div>
            <button onClick={() => navigate('/admin/dashboard')} className="mt-3 text-sm text-red-600 hover:underline font-semibold">Go to Admin Dashboard →</button>
          </Section>
        )}

        {/* ── Sign out ── */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-red-50"><h2 className="text-sm font-bold text-red-600">Sign Out</h2></div>
          <div className="px-6 py-5 flex items-center justify-between">
            <p className="text-sm text-gray-500">You will be signed out of your account on this device.</p>
            <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 font-semibold px-4 py-2 rounded-xl text-sm transition-colors shrink-0 ml-4">
              Sign Out
            </button>
          </div>
        </div>

      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
