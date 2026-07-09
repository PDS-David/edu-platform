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
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import {
  School, Users, GraduationCap, UserCheck, Copy, Check,
  Loader2, LogOut, AlertCircle,
} from 'lucide-react';

export default function SchoolAdminDashboard() {
  const { logout } = useAuth();
  const [school,  setSchool]  = useState(null);
  const [roster,  setRoster]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [copied,  setCopied]  = useState(false);

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
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <School size={18} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {school?.name || 'Your School'}
            </p>
            <p className="text-xs text-gray-400">School Admin</p>
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
            <div className="grid grid-cols-3 gap-3 mb-6">
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
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Roster</p>
              {(roster || []).length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">
                  No one has joined your school yet. Share your join code above to get started.
                </p>
              )}
              <div className="divide-y divide-gray-50">
                {(roster || []).map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-gray-800">{u.first_name} {u.last_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{u.email}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {u.role.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
