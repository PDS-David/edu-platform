// client/src/pages/SubjectPage.jsx
// URL: /student/subject/:subjectId
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import {
  ChevronDown, ChevronRight, Loader2, BookOpen,
  ClipboardList, Zap, Trophy, CheckCircle,
} from 'lucide-react';
import TopNav from '../components/TopNav';

export default function SubjectPage() {
  const { subjectId } = useParams();
  const { user }      = useAuth();
  const navigate      = useNavigate();

  const [subject,      setSubject]      = useState(null);
  const [topics,       setTopics]       = useState([]);
  const [expandedId,   setExpandedId]   = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [activeMode,   setActiveMode]   = useState('resources'); // resources|practice|quiz

  useEffect(() => {
    if (!subjectId) return;
    setLoading(true);
    Promise.all([
      api.get(`/subjects/${subjectId}`),
      api.get('/topics', { params: { subject_id: subjectId } }),
    ])
      .then(([subRes, topicRes]) => {
        setSubject(subRes.data || subRes);
        const list = topicRes.data?.topics || topicRes.data || [];
        setTopics(list);
        if (list.length > 0) setExpandedId(list[0].id); // auto-expand first topic
      })
      .catch(err => console.error('SubjectPage load error:', err))
      .finally(() => setLoading(false));
  }, [subjectId]);

  // Auto-enroll silently on first visit
  useEffect(() => {
    if (!user || !subjectId || user.role !== 'student') return;
    api.post('/students/subjects', { subject_id: subjectId }).catch(() => {});
  }, [user, subjectId]);

  const goToSubtopic = (subtopicId) => {
    const tab = activeMode === 'practice' ? 'practice' : activeMode === 'quiz' ? 'quiz' : 'resources';
    navigate(`/student/subtopic/${subtopicId}?tab=${tab}`);
  };

  const modeConfig = {
    resources: { label: 'Resources',          icon: BookOpen,      color: 'bg-blue-600',   tab: 'resources' },
    practice:  { label: 'Practice Questions', icon: ClipboardList, color: 'bg-violet-600', tab: 'practice'  },
    quiz:      { label: 'Quiz',               icon: Zap,           color: 'bg-amber-500',  tab: 'quiz'      },
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    </div>
  );

  const subjectName    = subject?.name || 'Subject';
  const boardName      = subject?.exam_board_name || subject?.exam_board_code || '';
  const subjectCode    = subject?.code || '';

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />

      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Link to="/student/subjects" className="hover:text-blue-600">My Subjects</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium">{subjectName}</span>
        </nav>

        {/* Subject header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl shrink-0">
              {subject?.icon_emoji || '📚'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{subjectName}</h1>
                {subjectCode && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {subjectCode}
                  </span>
                )}
              </div>
              {boardName && (
                <p className="text-xs text-gray-400 mt-0.5">{boardName}</p>
              )}
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                {topics.length} topic{topics.length !== 1 ? 's' : ''} ·{' '}
                {topics.reduce((n, t) => n + (t.subtopics?.length || 0), 0)} subtopics
              </p>
            </div>
          </div>
        </div>

        {/* Mode selector — what do you want to do? */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            What do you want to do?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(modeConfig).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const active = activeMode === key;
              return (
                <button key={key} onClick={() => setActiveMode(key)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all border ${
                    active
                      ? `${cfg.color} text-white border-transparent shadow-sm`
                      : 'bg-gray-50 text-gray-600 border-gray-100 hover:border-gray-200'
                  }`}>
                  <Icon size={16} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2.5 text-center">
            {activeMode === 'resources' && 'Pick a subtopic below to read notes and study materials'}
            {activeMode === 'practice' && 'Pick a subtopic below to practise questions with AI feedback'}
            {activeMode === 'quiz'     && 'Pick a subtopic below to take a timed quiz'}
          </p>
        </div>

        {/* Topic accordion — the main event */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Choose a topic to {modeConfig[activeMode].label.toLowerCase()}
            </p>
          </div>

          {topics.length === 0 ? (
            <div className="p-10 text-center">
              <BookOpen size={28} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-semibold text-gray-600 mb-1">No topics yet</p>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                Your teacher hasn't added topics for this subject yet. Check back soon.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {topics.map((topic, ti) => {
                const open = expandedId === topic.id;
                const subtopics = topic.subtopics || [];
                return (
                  <div key={topic.id}>
                    {/* Topic row */}
                    <button
                      onClick={() => setExpandedId(open ? null : topic.id)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {ti + 1}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-gray-800">{topic.name}</span>
                      <span className="text-xs text-gray-400 mr-2 shrink-0">
                        {subtopics.length} subtopic{subtopics.length !== 1 ? 's' : ''}
                      </span>
                      {open
                        ? <ChevronDown size={15} className="text-gray-400 shrink-0" />
                        : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
                    </button>

                    {/* Subtopics */}
                    {open && (
                      <div className="bg-slate-50 border-t border-gray-100">
                        {subtopics.length === 0 ? (
                          <p className="px-5 py-3 text-xs text-gray-400">No subtopics yet.</p>
                        ) : (
                          subtopics.map((sub, si) => (
                            <button
                              key={sub.id}
                              onClick={() => goToSubtopic(sub.id)}
                              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-blue-50 transition-colors text-left group border-b border-gray-100 last:border-0"
                            >
                              <span className="w-5 h-5 rounded-full border-2 border-gray-300 group-hover:border-blue-400 flex items-center justify-center shrink-0 transition-colors">
                                {sub.is_complete && <CheckCircle size={12} className="text-emerald-500" />}
                              </span>
                              <span className="flex-1 text-sm text-gray-700 group-hover:text-blue-700 font-medium">
                                {sub.name}
                              </span>
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 transition-colors ${
                                activeMode === 'resources' ? 'bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white'
                                : activeMode === 'practice' ? 'bg-violet-100 text-violet-700 group-hover:bg-violet-600 group-hover:text-white'
                                : 'bg-amber-100 text-amber-700 group-hover:bg-amber-500 group-hover:text-white'
                              }`}>
                                {activeMode === 'resources' ? 'Study →' : activeMode === 'practice' ? 'Practise →' : 'Quiz →'}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick action — skip topic picking and go directly */}
        {topics.length > 0 && topics[0]?.subtopics?.length > 0 && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => goToSubtopic(topics[0].subtopics[0].id)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors ${modeConfig[activeMode].color}`}
            >
              Start with first subtopic →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
