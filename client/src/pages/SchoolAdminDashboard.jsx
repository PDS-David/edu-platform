// client/src/pages/SchoolAdminDashboard.jsx
// Route: /school-admin/dashboard (school_admin only)
//
// Intentionally minimal — this is the first slice of a school_admin's
// experience. It only shows their own school's roster (teachers/students who
// have joined via the school's join_code) and the join_code itself, for
// handing to new staff/students. It does NOT expose any platform-wide admin
// functionality (question banks, exam types, other schools' data, etc.) —
// those stay App-Admin-only. Isolation is enforced server-side by
// GET /api/schools/me/roster, which is hard-scoped to req.user.school_id.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import {
  School, Users, GraduationCap, UserCheck, Copy, Check,
  Loader2, LogOut, AlertCircle, Plus, X, Image as ImageIcon, FileText,
} from 'lucide-react';

function InviteModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ role: 'teacher', email: '', password: '', first_name: '', last_name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/schools/me/invite', form);
      onCreated(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  const ready = form.email.trim() && form.password.trim().length >= 8 && form.first_name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Add a Teacher or Student</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Creates the account directly, already linked to your school — no join code
          needed for this person. We'll email them their login details.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-3">
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer">
              <input type="radio" name="role" checked={form.role === 'teacher'} onChange={() => setForm(f => ({ ...f, role: 'teacher' }))} className="accent-indigo-600" />
              <span className="text-sm text-gray-700">Teacher</span>
            </label>
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer">
              <input type="radio" name="role" checked={form.role === 'student'} onChange={() => setForm(f => ({ ...f, role: 'student' }))} className="accent-indigo-600" />
              <span className="text-sm text-gray-700">Student</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
              <input value={form.first_name} onChange={set('first_name')} required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
              <input value={form.last_name} onChange={set('last_name')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={set('email')} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Temporary Password *</label>
            <input type="text" value={form.password} onChange={set('password')} required minLength={8}
              placeholder="At least 8 characters"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <button type="submit" disabled={!ready || loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {loading ? 'Creating…' : `Create ${form.role === 'teacher' ? 'Teacher' : 'Student'} Account`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SchoolAdminDashboard() {
  const { logout } = useAuth();
  const [school,  setSchool]  = useState(null);
  const [roster,  setRoster]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [copied,  setCopied]  = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoError, setLogoError] = useState('');

  const loadRoster = () => {
    api.get('/schools/me/roster')
      .then(res => setRoster(res.data || []))
      .catch(() => {});
  };

  const loadSchool = () => {
    api.get('/schools/me')
      .then(res => setSchool(res.data || null))
      .catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      api.get('/schools/me'),
      api.get('/schools/me/roster'),
    ])
      .then(([schoolRes, rosterRes]) => {
        setSchool(schoolRes.data || null);
        setRoster(rosterRes.data || []);
      })
      .catch(err => setError(err?.response?.data?.error || 'Could not load your school.'))
      .finally(() => setLoading(false));
  }, []);

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    setLogoSaving(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      await api.patch('/schools/me/logo', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      loadSchool();
    } catch (err) {
      setLogoError(err?.response?.data?.error || err?.message || 'Could not update logo.');
    } finally {
      setLogoSaving(false);
    }
  };

  const teachers = (roster || []).filter(u => u.role === 'teacher');
  const students = (roster || []).filter(u => u.role === 'student');
  const admins   = (roster || []).filter(u => u.role === 'school_admin');

  const copyCode = () => {
    if (!school?.join_code) return;
    navigator.clipboard?.writeText(school.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="relative w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center overflow-hidden cursor-pointer group shrink-0">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickLogo} className="hidden" />
            {school?.logo_url
              ? <img src={school.logo_url} alt="" className="w-full h-full object-cover" />
              : <School size={18} className="text-indigo-600" />}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              {logoSaving
                ? <Loader2 size={12} className="text-white animate-spin" />
                : <ImageIcon size={12} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />}
            </span>
          </label>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {school?.name || 'Your School'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">School Admin</p>
              {school?.enable_aischoolonair && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-semibold">AISchoolonair</span>
              )}
              {school?.enable_em && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-semibold">EM</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <LogOut size={15} /> Sign out
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Your School</h1>
        <p className="text-sm text-gray-500 mb-6">
          Only your own school's teachers and students — this view can't see any other
          school's data, and no other school can see yours.
        </p>

        {logoError && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{logoError}</p>
          </div>
        )}

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <UserCheck size={16} className="text-indigo-500 mb-2" />
                <p className="text-xl font-bold text-gray-900">{admins.length}</p>
                <p className="text-xs text-gray-400">Admins</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <Users size={16} className="text-indigo-500 mb-2" />
                <p className="text-xl font-bold text-gray-900">{teachers.length}</p>
                <p className="text-xs text-gray-400">Teachers</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <GraduationCap size={16} className="text-indigo-500 mb-2" />
                <p className="text-xl font-bold text-gray-900">{students.length}</p>
                <p className="text-xs text-gray-400">Students</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <span className="text-[11px] font-bold text-indigo-500 mb-2 block">EM</span>
                <p className="text-xl font-bold text-gray-900">{(roster || []).filter(u => u.uses_english_masterclass).length}</p>
                <p className="text-xs text-gray-400">Use Language Masterclass (English)</p>
              </div>
            </div>

            {school?.join_code && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-indigo-900">Your join code</p>
                  <p className="text-xs text-indigo-600 mt-0.5">Give this to new teachers and students — they enter it once from their account to join.</p>
                </div>
                <button onClick={copyCode}
                  className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-indigo-700 hover:border-indigo-400 transition-colors shrink-0 ml-4">
                  {school.join_code}
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-indigo-400" />}
                </button>
              </div>
            )}

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Roster</p>
                <button onClick={() => setShowInvite(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  <Plus size={14} /> Add Teacher or Student
                </button>
              </div>
              {(roster || []).length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">
                  No one has joined your school yet. Share your join code above to get started.
                </p>
              )}
              <div className="divide-y divide-gray-50">
                {(roster || []).map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-gray-800">{u.first_name} {u.last_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{u.email}</span>
                      {u.uses_english_masterclass && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600" title="Also uses Language Masterclass (English)">
                          EM
                        </span>
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {u.role.replace('_', ' ')}
                      </span>
                      {u.role === 'student' && (
                        <Link to={`/school-admin/students/${u.id}`} state={{ student: u }}
                          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
                          <FileText size={12} /> Report
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={() => {
            setShowInvite(false);
            loadRoster();
          }}
        />
      )}
    </div>
  );
}
