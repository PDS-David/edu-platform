// client/src/pages/TeacherExaminationsPage.jsx
// Route: /teacher/examinations
//
// Did not exist before this — confirmed via grep that Phase 2A/2B built
// the create/attach/assign backend routes but no frontend ever consumed
// them, and no GET endpoint even existed to list a teacher's own created
// exams. This page is list-only: there is still no exam-creation form in
// the app (title/subject/schedule/question-picker) — that's a separate,
// larger gap than the "missing results view" this page exists to make
// reachable, not folded in here.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import {
  FileText, ArrowLeft, Loader2, AlertCircle, Clock,
  Calendar, Users, BookOpen, BarChart2,
} from 'lucide-react';

function fmtDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TeacherExaminationsPage() {
  const navigate = useNavigate();
  const [exams,   setExams]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    api.get('/teacher/examinations')
      .then(r => setExams(r.data || []))
      .catch(() => setError('Could not load your examinations.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
          <FileText size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Examinations</h1>
          <p className="text-sm text-gray-500">Exams you've scheduled and assigned</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-violet-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <FileText size={28} className="text-gray-400" />
          </div>
          <p className="font-semibold text-gray-700">No examinations created yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map(exam => (
            <div key={exam.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{exam.title}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                    {exam.subject_name && (
                      <span className="flex items-center gap-1"><BookOpen size={11} /> {exam.subject_name}</span>
                    )}
                    <span className="flex items-center gap-1"><Clock size={11} /> {exam.duration_minutes} min</span>
                    {exam.scheduled_start && (
                      <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDateTime(exam.scheduled_start)}</span>
                    )}
                    <span className="flex items-center gap-1"><Users size={11} /> {exam.assigned_count} assigned</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/teacher/examinations/${exam.id}/results`)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                <BarChart2 size={14} /> View Results
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
