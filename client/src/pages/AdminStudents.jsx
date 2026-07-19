// client/src/pages/AdminStudents.jsx
// Route: /admin/students (App Admin only)
//
// Lists STANDALONE students — people using the app directly, not
// registered with any tenant school (school_id IS NULL). Tenant students
// already have an equivalent view via their school_admin's own roster
// (GET /api/schools/me/roster, in SchoolAdminDashboard.jsx) — this is the
// App Admin's equivalent for the population nobody else is looking after.
// Each row links to the same report page a school_admin already uses for
// their own students (SchoolAdminStudentReport.jsx, registered at both
// /school-admin/students/:id and /admin/students/:id — same component,
// it already reads the logged-in user's role to know which "back" link
// to show).

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { Loader2, AlertCircle, FileText, Search, GraduationCap } from 'lucide-react';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');

  const load = (q) => {
    setLoading(true);
    api.get('/admin/students', { params: q ? { search: q } : {} })
      .then(res => setStudents(Array.isArray(res.data) ? res.data : []))
      .catch(err => setError(err?.response?.data?.error || 'Could not load students.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(''); }, []);

  // Simple debounce so every keystroke doesn't fire a request
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap size={18} className="text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900">Standalone Students</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Students using AISchoolonair directly — not registered with any tenant school.
          Tenant students are managed by their own school's admin instead.
        </p>

        <div className="relative mb-5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
          />
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            )}
            {!loading && !error && students.length === 0 && (
              <p className="text-sm text-gray-400 py-6 text-center">
                {search ? 'No matching students.' : 'No standalone students yet.'}
              </p>
            )}
            {!loading && !error && students.length > 0 && (
              <div className="divide-y divide-gray-50">
                {students.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-gray-800">{s.first_name} {s.last_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{s.email}</span>
                      <Link to={`/admin/students/${s.id}`} state={{ student: s }}
                        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
                        <FileText size={12} /> Report
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {students.length === 200 && (
          <p className="text-xs text-gray-400 mt-3">
            Showing the 200 most recently joined — narrow your search to find someone specific.
          </p>
        )}
      </div>
    </div>
  );
}
