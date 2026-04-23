// client/src/pages/StudentExamTypesPage.jsx
// Route: /student/exam-types
// Students browse exam boards and enrol in subjects for their chosen exam type.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import {
  GraduationCap, ChevronDown, ChevronRight,
  Loader2, CheckCircle, Plus, ArrowLeft, BookOpen,
} from 'lucide-react';

export default function StudentExamTypesPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [examTypes,     setExamTypes]     = useState([]);
  const [expanded,      setExpanded]      = useState({});
  const [subjects,      setSubjects]      = useState({});   // typeId → []
  const [loadingSubs,   setLoadingSubs]   = useState({});
  const [enrolled,      setEnrolled]      = useState(new Set()); // subject IDs
  const [enrolling,     setEnrolling]     = useState(new Set());
  const [loadingTypes,  setLoadingTypes]  = useState(true);
  const [toast,         setToast]         = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // Load exam types
  useEffect(() => {
    api.get('/catalog/types')
      .then(r => setExamTypes((r?.data || []).filter(t => t.is_active !== false)))
      .catch(() => {})
      .finally(() => setLoadingTypes(false));
  }, []);

  // Load already-enrolled subjects
  useEffect(() => {
    api.get('/students/my-subjects')
      .then(r => {
        const ids = new Set((r.data || []).map(s => String(s.id)));
        setEnrolled(ids);
      })
      .catch(() => {});
  }, []);

  const toggleType = async (typeId) => {
    const open = !expanded[typeId];
    setExpanded(prev => ({ ...prev, [typeId]: open }));
    if (open && !subjects[typeId]) {
      setLoadingSubs(prev => ({ ...prev, [typeId]: true }));
      try {
        const r = await api.get(`/catalog/types/${typeId}/subjects`);
        setSubjects(prev => ({ ...prev, [typeId]: r.data || [] }));
      } catch {
        showToast('Failed to load subjects', false);
      } finally {
        setLoadingSubs(prev => ({ ...prev, [typeId]: false }));
      }
    }
  };

  const handleEnrol = async (subject) => {
    const sid = String(subject.id);
    if (enrolled.has(sid) || enrolling.has(sid)) return;
    setEnrolling(prev => new Set([...prev, sid]));
    try {
      await api.post('/students/subjects', { subject_id: subject.id });
      setEnrolled(prev => new Set([...prev, sid]));
      showToast(`Enrolled in ${subject.name}`);
    } catch (err) {
      showToast(err?.error || 'Enrolment failed', false);
    } finally {
      setEnrolling(prev => { const s = new Set(prev); s.delete(sid); return s; });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />

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
            <p className="text-xs text-gray-400 mt-0.5">
              Expand an exam type and enrol in the subjects you're preparing for
            </p>
          </div>
        </div>

        {/* Exam type list */}
        {loadingTypes ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-violet-300" />
          </div>
        ) : examTypes.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <GraduationCap size={32} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-500">No exam types available yet.</p>
            <p className="text-xs text-gray-400 mt-1">Ask your admin to add exam types in the catalog.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {examTypes.map(type => {
              const open  = !!expanded[type.id];
              const subs  = subjects[type.id] || [];
              const busy  = loadingSubs[type.id];

              return (
                <div key={type.id}
                  className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  {/* Type header */}
                  <button
                    onClick={() => toggleType(type.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
                    <span className="text-xl shrink-0 w-7">{type.icon_emoji || '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{type.name}</p>
                      {type.full_name && (
                        <p className="text-xs text-gray-400 truncate">{type.full_name}</p>
                      )}
                    </div>
                    <span className="text-xs font-mono bg-violet-50 text-violet-600 px-2 py-0.5 rounded shrink-0">
                      {type.code}
                    </span>
                    {open
                      ? <ChevronDown size={15} className="text-gray-400 shrink-0" />
                      : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
                  </button>

                  {/* Subjects */}
                  {open && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-3">
                      {busy ? (
                        <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
                          <Loader2 size={15} className="animate-spin" /> Loading subjects…
                        </div>
                      ) : subs.length === 0 ? (
                        <div className="text-center py-6">
                          <BookOpen size={20} className="mx-auto mb-2 text-gray-200" />
                          <p className="text-xs text-gray-400">No subjects in this exam type yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {subs.map(s => {
                            const sid       = String(s.id);
                            const isEnrolled = enrolled.has(sid);
                            const isBusy     = enrolling.has(sid);
                            return (
                              <div key={s.id}
                                className={`flex items-center gap-3 bg-white px-3 py-2.5 rounded-xl border transition-colors ${
                                  isEnrolled ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 hover:border-violet-200'
                                }`}>
                                <span className="text-base shrink-0 w-6">
                                  {s.icon_emoji || '📚'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                                  {s.code && (
                                    <p className="text-xs text-gray-400 font-mono">{s.code}</p>
                                  )}
                                </div>
                                {isEnrolled ? (
                                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 shrink-0">
                                    <CheckCircle size={13} /> Enrolled
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleEnrol(s)}
                                    disabled={isBusy}
                                    className="flex items-center gap-1 text-xs font-semibold text-violet-600 border border-violet-200 hover:bg-violet-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0">
                                    {isBusy
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : <Plus size={11} />}
                                    Enrol
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Go to my subjects */}
        {enrolled.size > 0 && (
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/student/subjects')}
              className="text-sm font-semibold text-violet-600 hover:underline">
              View my enrolled subjects →
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold border ${
          toast.ok
            ? 'bg-white border-emerald-200 text-emerald-700'
            : 'bg-white border-red-200 text-red-600'
        }`}>
          {toast.ok
            ? <CheckCircle size={14} className="text-emerald-500" />
            : <span className="text-red-400">✕</span>}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
