// client/src/pages/StudentExamTypesPage.jsx
// Route: /student/exam-types
// Phase 3: self-service exam type / subject enrolment is removed. This page
// used to let students browse exam boards and enrol themselves in subjects
// directly — that flow (and its backend endpoints, POST /students/subjects
// and POST /students/exam-types/:id/join) is now locked down; assignment is
// done by the student's school or App Admin via
// POST /api/schools/students/:studentId/assign-exam-type. The route and
// component are kept (not deleted) so rollback is a one-line revert — see
// server/routes/studentRoutes.js's Phase 3 Step 4 guards.

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Lock } from 'lucide-react';

export default function StudentExamTypesPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/student/subjects')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <GraduationCap size={20} className="text-violet-500" /> Exam Types
            </h1>
          </div>
        </div>

        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Lock size={28} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-600 mb-1">Managed by your admin</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            Your exam type and subjects are assigned by your school or app
            administrator. Contact them if you need a change.
          </p>
        </div>
      </div>
    </div>
  );
}
