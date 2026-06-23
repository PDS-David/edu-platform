// client/src/pages/TeacherPendingQuestions.jsx
// URL: /teacher/pending-questions
// Lists ALL questions submitted by this teacher with approval status,
// rejection feedback, and tab filters.

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { CheckCircle, XCircle, Clock, Loader2, BookOpen, Plus, MessageSquare } from 'lucide-react';

const STATUS_CONFIG = {
  approved: { label: 'Approved', icon: CheckCircle, cls: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', icon: XCircle,    cls: 'bg-red-100   text-red-700   border-red-200'   },
  pending:  { label: 'Pending',  icon: Clock,       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
};

const TABS = ['all', 'pending', 'approved', 'rejected'];

export default function TeacherPendingQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    api.get('/teacher/questions')
      .then(r => setQuestions(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return questions;
    return questions.filter(q => (q.status || 'pending') === activeTab);
  }, [questions, activeTab]);

  const counts = useMemo(() => ({
    all:      questions.length,
    pending:  questions.filter(q => (q.status || 'pending') === 'pending').length,
    approved: questions.filter(q => q.status === 'approved').length,
    rejected: questions.filter(q => q.status === 'rejected').length,
  }), [questions]);

  const diffColor = {
    easy:   'bg-green-100 text-green-700',
    medium: 'bg-amber-100 text-amber-700',
    hard:   'bg-red-100   text-red-700',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/teacher/dashboard" className="text-white/50 text-xs mb-1 hover:text-white/80 flex items-center gap-1">
              ← Dashboard
            </Link>
            <h1 className="text-white text-xl font-bold">My Questions</h1>
            <p className="text-white/60 text-sm mt-0.5">Questions you have submitted — track approval status</p>
          </div>
          <Link to="/teacher/resources?tab=questions"
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={14} /> Add Question
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Tab filters */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                activeTab === tab
                  ? 'bg-[#0a4a3f] text-white border-[#0a4a3f]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {activeTab === 'all'
                ? 'You haven\'t submitted any questions yet.'
                : `No ${activeTab} questions.`}
            </p>
            {activeTab === 'all' && (
              <Link to="/teacher/resources"
                className="mt-4 inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                <Plus size={14} /> Add your first question
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {filtered.map(q => {
              const status = q.status || 'pending';
              const cfg    = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
              const Icon   = cfg.icon;
              return (
                <div key={q.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 text-sm leading-snug">{q.question_text}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {q.subject_name && (
                          <span className="text-xs text-gray-400">{q.subject_name}</span>
                        )}
                        {q.difficulty && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${diffColor[q.difficulty] || 'bg-gray-100 text-gray-500'}`}>
                            {q.difficulty}
                          </span>
                        )}
                        <span className="text-xs text-gray-300">
                          {new Date(q.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Rejection feedback */}
                      {status === 'rejected' && q.feedback && (
                        <div className="mt-2.5 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <MessageSquare size={12} className="text-red-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-red-600">
                            <span className="font-semibold">Rejection reason: </span>{q.feedback}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border shrink-0 ${cfg.cls}`}>
                      <Icon size={11} /> {cfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
