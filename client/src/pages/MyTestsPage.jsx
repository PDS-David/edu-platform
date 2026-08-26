// client/src/pages/MyTestsPage.jsx
// Route: /student/my-tests
// S7 fix: shows all teacher-assigned tests so students can find and
// take them without needing a direct URL from their teacher.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import {
  ClipboardCheck, ArrowLeft, Loader2, CheckCircle,
  Clock, Calendar, AlertCircle, BookOpen, Play,
} from 'lucide-react';

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function isOverdue(dueDateIso) {
  if (!dueDateIso) return false;
  return new Date(dueDateIso) < new Date();
}

function StatusBadge({ item }) {
  if (item.completed_at) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
        <CheckCircle size={11} /> Done · {item.score != null ? `${item.score}%` : '—'}
      </span>
    );
  }
  if (isOverdue(item.due_date)) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
      Pending
    </span>
  );
}

export default function MyTestsPage() {
  const navigate = useNavigate();
  const [tests,   setTests]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    api.get('/students/my-tests')
      .then(r => setTests(r.data || []))
      .catch(() => setError('Could not load your assigned tests.'))
      .finally(() => setLoading(false));
  }, []);

  const pending   = tests.filter(t => !t.completed_at);
  const completed = tests.filter(t =>  t.completed_at);

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <ClipboardCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">My Tests</h1>
            <p className="text-sm text-gray-500">Tests assigned to you by your teacher</p>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="text-blue-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertCircle size={32} className="text-red-400" />
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        ) : tests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <ClipboardCheck size={28} className="text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">No tests assigned yet</p>
              <p className="text-sm text-gray-400 mt-1 max-w-xs">
                When your teacher assigns a test to you or your class, it will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending tests */}
            {pending.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Pending · {pending.length}
                </h2>
                <div className="space-y-3">
                  {pending.map(test => (
                    <TestCard
                      key={test.assignment_id}
                      test={test}
                      onStart={() => navigate(`/student/test/${test.test_id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed tests */}
            {completed.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Completed · {completed.length}
                </h2>
                <div className="space-y-3">
                  {completed.map(test => (
                    <TestCard key={test.assignment_id} test={test} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TestCard({ test, onStart }) {
  const due      = fmtDate(test.due_date);
  const assigned = fmtDate(test.assigned_at);
  const overdue  = isOverdue(test.due_date) && !test.completed_at;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 ${overdue ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{test.title}</p>
          {test.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{test.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            {test.subject_name && (
              <span className="flex items-center gap-1">
                <BookOpen size={11} /> {test.subject_name}
              </span>
            )}
            {test.time_limit_minutes && (
              <span className="flex items-center gap-1">
                <Clock size={11} /> {test.time_limit_minutes} min
              </span>
            )}
            {assigned && (
              <span className="flex items-center gap-1">
                <Calendar size={11} /> Assigned {assigned}
              </span>
            )}
            {due && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-red-500 font-medium' : ''}`}>
                Due {due}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">By {test.teacher_name}</p>
        </div>

        <StatusBadge item={test} />
      </div>

      {/* Start button for pending tests */}
      {!test.completed_at && onStart && (
        <button
          onClick={onStart}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          <Play size={14} /> Start Test
        </button>
      )}
    </div>
  );
}
