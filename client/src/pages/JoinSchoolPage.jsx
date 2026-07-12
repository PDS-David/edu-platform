// client/src/pages/JoinSchoolPage.jsx
// Route: /join-school (any authenticated teacher or student)
//
// This didn't exist before — POST /api/schools/join was only ever callable
// directly via the API, with no UI anywhere for a regular teacher/student to
// actually use it. Role-agnostic by design: works the same for a teacher or
// a student, since the backend endpoint itself has no role restriction.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { School, ArrowRight, Check, AlertCircle, Loader2 } from 'lucide-react';

export default function JoinSchoolPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [joined,  setJoined]  = useState(null); // { school_name } once successful

  // Already affiliated with a school — nothing to do here.
  const alreadyInSchool = !!user?.school_id;

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/schools/join', { join_code: code.trim() });
      const data = res.data || res;
      setJoined({ school_name: data.school_name });
      // Reflect the new school_id in the auth context immediately, so the
      // rest of the app (e.g. this same page, or resource assignment) sees
      // it without needing a full refresh.
      updateUser({ school_id: data.school_id });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not join that school. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <TopNav />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <School size={22} className="text-indigo-600" />
          </div>

          {alreadyInSchool && !joined ? (
            <>
              <h1 className="text-lg font-bold text-gray-900 mb-1">You're already part of a school</h1>
              <p className="text-sm text-gray-500 mb-5">
                Your account is already linked to a school. If that's changed, contact your school
                admin or AISchoolonair support.
              </p>
              <button onClick={() => navigate(-1)}
                className="text-sm font-semibold text-indigo-600 hover:underline">
                Go back
              </button>
            </>
          ) : joined ? (
            <>
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                <Check size={20} className="text-green-600" />
              </div>
              <h1 className="text-lg font-bold text-gray-900 mb-1">You've joined {joined.school_name}</h1>
              <p className="text-sm text-gray-500 mb-5">
                Your account is now linked to your school.
              </p>
              <button onClick={() => navigate(-1)}
                className="text-sm font-semibold text-indigo-600 hover:underline">
                Continue
              </button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold text-gray-900 mb-1">Join your school</h1>
              <p className="text-sm text-gray-500 mb-5">
                Enter the join code your school admin gave you. This links your existing account —
                nothing else changes.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-left">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={submit} className="space-y-3">
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AB3DEF9H"
                  maxLength={8}
                  autoFocus
                  className="w-full text-center tracking-widest font-mono font-bold text-lg px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all uppercase"
                />
                <button type="submit" disabled={!code.trim() || loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {loading ? 'Joining…' : 'Join School'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
