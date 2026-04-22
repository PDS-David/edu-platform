// client/src/pages/SubjectPage.jsx
// AI Buddy subject detail page — exact replica
// URL: /student/subject/:subjectId
// Shows: breadcrumb, subject title, Resources/Practice Questions/Quiz buttons,
//        "Your Progress" dropdown, "Discover by Topic" accordion

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import { ChevronDown, ChevronUp, ArrowRight, Loader2, Trophy, BookOpen } from 'lucide-react';
import TopNav from '../components/TopNav';



// ─── Topics & Sub-topics Modal ─────────────────────────────────────────────────
function TopicsModal({ open, onClose, mode, topics, onSelectSubtopic }) {
  const [expandedTopic, setExpandedTopic] = useState(null);

  const modeSubtitle = {
    resources: 'Choose the subject area and dive into the specific topic you want to explore for resources',
    practice:  'Choose the subject area and dive into the specific topic you want to explore for practice questions',
    quiz:      'Choose the subject area and dive into the specific topic you want to explore for quizzes',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col z-10">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg font-light"
          >
            ×
          </button>
          <h2 className="text-lg font-bold text-gray-900 text-center">Topics &amp; Sub-topics</h2>
          <p className="text-xs text-gray-500 text-center mt-1">{modeSubtitle[mode]}</p>
        </div>

        {/* Accordion */}
        <div className="overflow-y-auto flex-1">
          {topics.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <BookOpen size={20} className="text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">No topics yet for this subject</p>
              <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
                Your teacher hasn't added topics for this subject yet. Check back soon, or ask your teacher to add content via the Topics &amp; Content panel.
              </p>
            </div>
          ) : (
            topics.map(topic => (
              <div key={topic.id} className="border-b border-gray-100 last:border-0">
                {/* Topic row */}
                <button
                  onClick={() => setExpandedTopic(expandedTopic === topic.id ? null : topic.id)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{topic.name || topic.title}</span>
                  {expandedTopic === topic.id
                    ? <ChevronUp size={16} className="text-gray-400 shrink-0" />
                    : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                </button>

                {/* Subtopics */}
                {expandedTopic === topic.id && (
                  <div className="bg-gray-50 px-6 pb-3">
                    <button
                      onClick={() => {
                        if (topic.subtopics && topic.subtopics.length > 0) {
                          onSelectSubtopic(topic.subtopics[0].id, mode);
                        }
                      }}
                      className="text-xs text-blue-600 font-medium mb-3 hover:underline"
                    >
                      View all ({topic.subtopics?.length || 0})
                    </button>
                    {topic.subtopics && topic.subtopics.length > 0 ? (
                      topic.subtopics.map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => onSelectSubtopic(sub.id, mode)}
                          className="w-full flex items-center gap-3 py-2.5 hover:bg-white rounded-lg px-2 transition-colors group"
                        >
                          {/* Completion circle */}
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            sub.completed
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300'
                          }`}>
                            {sub.completed && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm flex-1 text-left ${sub.completed ? 'text-gray-400' : 'text-gray-700'}`}>
                            {sub.name}
                          </span>
                          <ArrowRight size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 py-2">No subtopics available yet.</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SubjectPage() {
  const { subjectId } = useParams();
  const { user }      = useAuth();
  const navigate      = useNavigate();

  const [subject,       setSubject]       = useState(null);
  const [topics,        setTopics]        = useState([]);
  const [progress,      setProgress]      = useState(null);
  const [progressOpen,  setProgressOpen]  = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [modalMode,     setModalMode]     = useState(null); // 'resources'|'practice'|'quiz'|null
  const [pageAccordion, setPageAccordion] = useState(null); // expanded topic id on page
  const [isEnrolled,    setIsEnrolled]    = useState(false);
  const [enrolling,     setEnrolling]     = useState(false);

  // ── Load subject + topics ──────────────────────────────────────────────────
  useEffect(() => {
    if (!subjectId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [subRes, topicRes] = await Promise.all([
          api.get(`/subjects/${subjectId}`),
          api.get('/topics', { params: { subject_id: subjectId } }),
        ]);

        const subjectData = subRes.data || subRes;
        setSubject(subjectData);

        const topicList = topicRes.data?.topics || topicRes.data || [];
        setTopics(topicList);

      } catch (err) {
        console.error('SubjectPage load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [subjectId]);

  // ── Load progress summary ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !subjectId) return;
    const load = async () => {
      try {
        const res = await api.get('/subtopics/progress-summary', {
          params: { student_id: user.id, subject_id: subjectId },
        });
        if (res.success) setProgress(res.data);
      } catch {
        // No progress yet
      }
    };
    load();
  }, [user, subjectId]);

  // ── Check enrollment status — auto-enroll silently on first visit ─────────
  useEffect(() => {
    if (!user || !subjectId || user.role !== 'student') return;
    api.get('/students/my-subjects')
      .then(r => {
        const enrolled = (r.data || []).some(s => String(s.id) === String(subjectId));
        setIsEnrolled(enrolled);
        // Auto-enroll silently — no barrier, student just sees content
        if (!enrolled) {
          api.post('/students/subjects', { subject_id: subjectId })
            .then(() => setIsEnrolled(true))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [user, subjectId]);

  // ── Manual enroll/unenroll (still available via button) ───────────────────
  const handleEnroll = async () => {
    if (!user) { navigate('/login'); return; }
    setEnrolling(true);
    try {
      if (isEnrolled) {
        await api.delete(`/students/subjects/${subjectId}`);
        setIsEnrolled(false);
      } else {
        await api.post('/students/subjects', { subject_id: subjectId });
        setIsEnrolled(true);
      }
    } catch (err) {
      console.error('Enroll error:', err);
    } finally {
      setEnrolling(false);
    }
  };

  // ── Navigate to subtopic with tab ──────────────────────────────────────────
  const handleSelectSubtopic = (subtopicId, mode) => {
    setModalMode(null);
    const tabMap = { resources: 'resources', practice: 'practice', quiz: 'quiz' };
    navigate(`/student/subtopic/${subtopicId}?tab=${tabMap[mode] || 'resources'}`);
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <TopNav />
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    </div>
  );

  const curriculumName = subject?.exam_board_name || subject?.level || '';
  const subjectName    = subject?.name || 'Subject';
  const subjectCode    = subject?.subject_code || subject?.code || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <TopNav />

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-4 flex-wrap">
          <Link to="/student/dashboard" className="hover:text-blue-600 transition-colors">Home</Link>
          <span>›</span>
          <Link to="/student/dashboard" className="hover:text-blue-600 transition-colors">{curriculumName}</Link>
          <span>›</span>
          <span className="text-blue-600 font-medium">{subjectName}</span>
        </nav>

        {/* ── Your Progress dropdown + Enroll button ── */}
        <div className="flex justify-end items-center gap-3 mb-4">
          {/* Enroll / Unenroll */}
          {user?.role === 'student' && (
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                isEnrolled
                  ? 'border border-blue-300 text-blue-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {enrolling ? (
                <Loader2 size={13} className="animate-spin" />
              ) : isEnrolled ? (
                '✓ Enrolled'
              ) : (
                '+ Enroll in this subject'
              )}
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setProgressOpen(o => !o)}
              className="flex items-center gap-2 border border-blue-300 text-blue-600 text-sm font-semibold px-4 py-2 rounded-full hover:bg-blue-50 transition-colors"
            >
              <Trophy size={15} />
              Your Progress
              <ChevronDown size={13} className={`transition-transform ${progressOpen ? 'rotate-180' : ''}`} />
            </button>
            {progressOpen && progress && (
              <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 p-4 min-w-[240px] z-30">
                <p className="text-base font-bold text-blue-600">
                  {progress.completed_subtopics} of {progress.total_subtopics} Complete
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {progress.completed_subtopics} sub-topics completed from {curriculumName} {subjectName}
                </p>
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progress.completion_pct}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Subject title + description ── */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {curriculumName} {subjectName} Revision
          </h1>
          <p className="text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Our {curriculumName} {subjectName} course {subjectCode ? `(${subjectCode})` : ''} is tailored to meet the latest {curriculumName} standards.
            Our comprehensive module includes video lessons, interactive quizzes, worked examples, and downloadable worksheets.
            You'll also find exam-style questions, past paper solutions, and personalised AI feedback to track your progress.
          </p>
        </div>

        {/* ── Three action buttons ── */}
        <div className="flex items-center justify-center gap-3 mb-8 flex-wrap">
          {/* Resources */}
          <button
            onClick={() => setModalMode('resources')}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors"
          >
            <span className="text-base"></span> Resources
            <ArrowRight size={14} className="text-gray-400" />
          </button>

          {/* Practice Questions — AI badge */}
          <button
            onClick={() => setModalMode('practice')}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors relative"
          >
            <span className="text-base"></span> Practice Questions
            <span className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">AI </span>
            <ArrowRight size={14} className="text-gray-400" />
          </button>

          {/* Quiz — AI badge */}
          <button
            onClick={() => setModalMode('quiz')}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors relative"
          >
            <span className="text-base"></span> Quiz
            <span className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">AI </span>
            <ArrowRight size={14} className="text-gray-400" />
          </button>
        </div>

        {/* ── Discover by Topic ── */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 h-px bg-gray-200" />
            <h2 className="text-base font-bold text-gray-700 whitespace-nowrap">Discover by Topic</h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <p className="text-xs text-gray-400 text-center mb-4">
            Choose what you want to study and unlock related online lessons
          </p>

          {topics.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <BookOpen size={28} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-semibold text-gray-600 mb-1">No topics yet</p>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">Topics for this subject haven't been added yet. Your teacher can add them via the Topics &amp; Content panel.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {topics.map((topic, idx) => (
                <div key={topic.id} className={idx < topics.length - 1 ? 'border-b border-gray-100' : ''}>
                  {/* Topic row */}
                  <button
                    onClick={() => setPageAccordion(pageAccordion === topic.id ? null : topic.id)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full w-7 h-7 flex items-center justify-center shrink-0">
                      {topic.completion_pct || 0}%
                    </span>
                    <span className="text-sm font-medium text-gray-800 flex-1">{topic.name || topic.title}</span>
                    {pageAccordion === topic.id
                      ? <ChevronUp size={15} className="text-gray-400 shrink-0" />
                      : <ChevronDown size={15} className="text-gray-400 shrink-0" />}
                  </button>

                  {/* Subtopics expand */}
                  {pageAccordion === topic.id && (
                    <div className="bg-gray-50 px-5 pb-3">
                      {topic.subtopics && topic.subtopics.length > 0 ? (
                        topic.subtopics.map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => navigate(`/student/subtopic/${sub.id}`)}
                            className="w-full flex items-center gap-3 py-2.5 hover:bg-white rounded-lg px-2 transition-colors group"
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              sub.completed ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                            }`}>
                              {sub.completed && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <span className="text-sm text-gray-700 flex-1 text-left">{sub.name}</span>
                            <ArrowRight size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 py-3">No subtopics available yet.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Topics Modal ── */}
      <TopicsModal
        open={!!modalMode}
        onClose={() => setModalMode(null)}
        mode={modalMode}
        topics={topics}
        onSelectSubtopic={handleSelectSubtopic}
      />
    </div>
  );
}
