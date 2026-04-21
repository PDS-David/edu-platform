// client/src/pages/TeacherPendingQuestions.jsx
// URL: /teacher/pending-questions
// Lists questions submitted by this teacher.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { CheckCircle, Loader2, BookOpen, Plus } from 'lucide-react';

export default function TeacherPendingQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.get('/teacher/questions')
      .then(r => setQuestions(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, []);

  const diffColor = { easy: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', hard: 'bg-red-100 text-red-700' };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/teacher/dashboard" className="text-white/50 text-xs mb-1 hover:text-white/80 flex items-center gap-1">← Dashboard</Link>
            <h1 className="text-white text-xl font-bold">My Questions</h1>
            <p className="text-white/60 text-sm mt-0.5">Questions you have submitted</p>
          </div>
          <Link to="/teacher/resources?tab=questions"
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={14} /> Add Question
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">You haven't submitted any questions yet.</p>
            <Link to="/teacher/resources"
              className="mt-4 inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              <Plus size={14} /> Add your first question
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Question</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Difficulty</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {questions.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <p className="text-gray-800 line-clamp-2 max-w-xs">{q.question_text}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">{q.subject_name || '—'}</td>
                    <td className="px-5 py-3.5">
                      {q.difficulty && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${diffColor[q.difficulty] || 'bg-gray-100 text-gray-500'}`}>
                          {q.difficulty}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                        <CheckCircle size={12} /> Approved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
