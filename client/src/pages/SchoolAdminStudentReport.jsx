// client/src/pages/SchoolAdminStudentReport.jsx
// Routes: /school-admin/students/:studentId (school_admin — their own
//         school's students) AND /admin/students/:studentId (App Admin —
//         standalone students not registered with any tenant school).
// Same component, same report content, same print button — the only
// role-specific bit is the back-link destination/label just below. Reuses
// the existing GET /api/analytics/student/:studentId/summary and .../topics
// endpoints, which already worked unconditionally for admin (no scope
// restriction at all — see server/middleware/teacherScope.js, every check
// there starts with `if (role === 'admin') return next();`) and were
// separately extended for school_admin with a school-based scope check.
// No backend changes were needed to add the admin side of this — only the
// admin-facing student list (GET /api/admin/students) and this route/link.
//
// Includes a print button (window.print() + @media print rules below) since
// there's no PDF-generation library anywhere in this codebase — the
// browser's own print-to-PDF is the simplest, most robust way to get a
// printable/savable report without adding a new dependency.

import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import {
  ArrowLeft, Loader2, AlertCircle, Printer, Flame, Trophy, Clock, Target, BookOpen,
} from 'lucide-react';

const fmtTime = (mins, secs) => {
  const h = Math.floor((mins || 0) / 60);
  const m = (mins || 0) % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${secs || 0}s`;
};

const accColor = (pct) => {
  if (pct >= 70) return 'text-emerald-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-600';
};

export default function SchoolAdminStudentReport() {
  const { studentId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const isAppAdmin = user?.role === 'admin';
  const backTo = isAppAdmin ? '/admin/students' : '/school-admin/dashboard';
  const backLabel = isAppAdmin ? 'Back to students' : 'Back to dashboard';
  // Passed via <Link state={...}> from the roster list — avoids a second
  // round trip just to show a name/email at the top of the report. Falls
  // back gracefully to just showing the ID if opened directly (e.g. a
  // bookmarked/refreshed URL) rather than erroring.
  const studentMeta = location.state?.student || null;

  const [summary, setSummary] = useState(null);
  const [topics,  setTopics]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/analytics/student/${studentId}/summary`),
      api.get(`/analytics/student/${studentId}/topics`),
    ])
      .then(([summaryRes, topicsRes]) => {
        setSummary(summaryRes.data || null);
        setTopics(Array.isArray(topicsRes.data) ? topicsRes.data : []);
      })
      .catch(err => {
        const status = err?.response?.status;
        const apiMsg = err?.response?.data?.error;
        // Distinguishing the status matters here: a 403 almost always means
        // the backend server is still running older code that hasn't
        // learned about school_admin's access yet (a deploy/restart problem,
        // not a data problem), whereas a 500 is a genuine server-side error
        // worth investigating on its own. Showing which one happened turns
        // "could not load" from a dead end into an actionable clue.
        if (status === 403) {
          setError('Access denied (403) loading this report. If this report feature was recently added, the backend server may need to be restarted with the latest code — this is a deployment step, not a data problem.');
        } else if (apiMsg) {
          setError(`${apiMsg}${status ? ` (${status})` : ''}`);
        } else {
          setError(`Could not load this student's report${status ? ` (HTTP ${status})` : ' (network error — check your connection or that the server is reachable)'}.`);
        }
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  const studentName = studentMeta
    ? `${studentMeta.first_name || ''} ${studentMeta.last_name || ''}`.trim()
    : `Student ${studentId}`;

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <div className="print:hidden">
        <TopNav />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link to={backTo} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} /> {backLabel}
          </Link>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Printer size={14} /> Print Report
          </button>
        </div>

        {/* Print-only header — the browser's print dialog already shows the page
            title/date in its own header/footer, but this makes a saved PDF
            self-explanatory without that browser chrome. */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold">Student Progress Report</h1>
          <p className="text-sm text-gray-500">Generated {new Date().toLocaleDateString()}</p>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 print:hidden">Student Progress Report</h1>
          <p className="text-lg font-semibold text-gray-800 mt-1">{studentName}</p>
          {studentMeta?.email && <p className="text-sm text-gray-400">{studentMeta.email}</p>}
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 print:hidden">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !error && summary && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">AISchoolonair</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="border rounded-2xl p-4 bg-white border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-medium">Overall Accuracy</span>
                  <Target size={14} className="text-gray-300" />
                </div>
                <p className={`text-2xl font-bold ${accColor(summary.accuracy_pct)}`}>{summary.accuracy_pct}%</p>
              </div>
              <div className="border rounded-2xl p-4 bg-white border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-medium">Questions Attempted</span>
                  <BookOpen size={14} className="text-gray-300" />
                </div>
                <p className="text-2xl font-bold text-gray-800">{summary.total_attempts}</p>
              </div>
              <div className="border rounded-2xl p-4 bg-white border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-medium">Study Streak</span>
                  <Flame size={14} className="text-gray-300" />
                </div>
                <p className="text-2xl font-bold text-gray-800">{summary.study_streak_days} days</p>
              </div>
              <div className="border rounded-2xl p-4 bg-white border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-medium">Time Spent</span>
                  <Clock size={14} className="text-gray-300" />
                </div>
                <p className="text-2xl font-bold text-gray-800">{fmtTime(summary.time_spent_minutes, summary.time_spent_seconds)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="border rounded-2xl p-4 bg-indigo-50 border-indigo-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-medium">Quizzes Completed</span>
                  <Trophy size={14} className="text-indigo-400" />
                </div>
                <p className="text-2xl font-bold text-indigo-600">{summary.quizzes_completed}</p>
              </div>
              <div className="border rounded-2xl p-4 bg-amber-50 border-amber-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-medium">XP Points</span>
                  <Trophy size={14} className="text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-amber-600">{summary.xp_points}</p>
              </div>
            </div>

            {/* English Masterclass tracks its own separate activity — a
                student who mainly uses EM will legitimately show zeros
                above (those numbers only ever come from AISchoolonair
                quiz/practice data). Only rendered when the student is
                actually EM-registered, matching the roster's "EM" badge,
                so this section doesn't show up empty for students who
                were never enrolled in it. */}
            {summary.english_masterclass && (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">English Masterclass</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                  <div className="border rounded-2xl p-4 bg-white border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Accuracy</span>
                      <Target size={14} className="text-gray-300" />
                    </div>
                    <p className={`text-2xl font-bold ${accColor(summary.english_masterclass.accuracy_pct)}`}>{summary.english_masterclass.accuracy_pct}%</p>
                  </div>
                  <div className="border rounded-2xl p-4 bg-white border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Words Mastered</span>
                      <BookOpen size={14} className="text-gray-300" />
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{summary.english_masterclass.words_mastered} / {summary.english_masterclass.words_learned}</p>
                  </div>
                  <div className="border rounded-2xl p-4 bg-white border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Practice Streak</span>
                      <Flame size={14} className="text-gray-300" />
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{summary.english_masterclass.practice_streak_days} days</p>
                  </div>
                  <div className="border rounded-2xl p-4 bg-white border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Sessions</span>
                      <Trophy size={14} className="text-gray-300" />
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{summary.english_masterclass.total_sessions}</p>
                  </div>
                </div>
              </>
            )}

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="p-6">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">AISchoolonair — Topic-by-Topic Breakdown</p>
                {topics.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">
                    No AISchoolonair practice attempts recorded yet.
                    {summary.english_masterclass && ' (English Masterclass activity is shown separately above.)'}
                  </p>
                )}
                <div className="divide-y divide-gray-50">
                  {topics.map(t => (
                    <div key={t.topic_id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <span className="text-gray-800">{t.topic}</span>
                        <span className="text-xs text-gray-400 ml-2">{t.subject_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{t.attempt_count} attempts</span>
                        <span className={`text-sm font-semibold ${accColor(t.accuracy_pct)}`}>{t.accuracy_pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
