// client/src/pages/QuestionReview.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel: pending question submissions → approve or reject with feedback
// GET  /api/questions/pending
// PUT  /api/questions/:id/review
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../hooks/useCatalog';
import {
  CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight,
  User, Calendar, BookOpen, Tag, Loader, RefreshCw, AlertCircle,
  ArrowLeft,
} from 'lucide-react';


const PAGE_SIZE = 10;

const DIFFICULTY_COLORS = {
  easy:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard:   'bg-red-100 text-red-700',
};

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ─────────────────────────────────────────────────────────────────────────────

export default function QuestionReview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard';
  // TEACH-REVIEW-1: this page was already role-aware for navigation
  // (dashboardPath above) but its two API calls were hardcoded to
  // /admin/questions regardless -- a teacher opening this page would have
  // hit adminOnly-gated routes and gotten a 403 on both. Teachers now have
  // their own scoped mirrors (teacherRoutes.js GET /questions/pending and
  // PUT /questions/:id/review, restricted to their assigned subjects via
  // teacher_subjects) -- this just picks the right base path, the rest of
  // the component's logic is identical for both roles.
  const apiBase = user?.role === 'admin' ? '/admin' : '/teacher';
  const [questions, setQuestions] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [offset,    setOffset]    = useState(0);
  // BUG FIX: initialized to true previously (correct when the page always
  // fetched immediately on mount). Now that fetchPending returns early
  // until all three stages are picked, an initial `true` here would show
  // "Loading…" in the header indefinitely during the picker stages, since
  // nothing would ever flip it to false until a real fetch actually starts.
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  // FEATURE: staged exam-type -> subject -> topic picker, replacing an
  // immediate unfiltered pending-question list. Explicit request: "a user
  // should pick an exam type, then a subject, then a topic, only then does
  // it display questions relevant to the user's choice" — the point is
  // reducing intimidation, so nothing below is fetched or shown until all
  // three are picked, one decision revealed at a time rather than several
  // dropdowns shown together over an already-visible list.
  const { examTypes, loadingTypes, fetchSubjectsForType } = useCatalog();
  const [selectedExamType, setSelectedExamType] = useState(null); // {id, name}
  const [selectedSubject,  setSelectedSubject]  = useState(null); // {id, name}
  const [selectedTopic,    setSelectedTopic]    = useState(null); // {id, name}
  const [subjects,      setSubjects]      = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [topics,         setTopics]         = useState([]);
  const [loadingTopics,  setLoadingTopics]  = useState(false);

  // Explicit request: "the teacher only has access to the questions related
  // to the subject(s) and exam type(s) under his supervised care... admin
  // [can access] all exam types". useCatalog()'s examTypes is the full,
  // global, unrestricted catalog — fine as-is for admin, but a teacher
  // picking Step 1 would otherwise see every exam type on the platform and
  // only discover it's irrelevant after Step 2 comes back empty. Deriving
  // the teacher's own set from GET /teacher/my-subjects (already returns
  // exam_board_code per assigned subject) rather than adding a new backend
  // endpoint — this is a client-side filter of data the catalog hook
  // already fetches, matched by code since my-subjects doesn't expose the
  // numeric exam_board_id.
  const [teacherExamCodes, setTeacherExamCodes] = useState(null); // null = not loaded yet, Set once loaded
  // GAP FIX: teacherExamCodes alone only scoped Step 1 (exam type). Step 2
  // (subject) called fetchSubjectsForType(et.id) identically for both
  // roles — the platform-wide, unrestricted "every subject under this exam
  // type" list, regardless of which of those subjects the teacher is
  // actually assigned to. A teacher whose one assigned WAEC subject is
  // Chemistry would still see every other WAEC subject (Biology, Physics,
  // Maths, ...) at Step 2. Same GET /teacher/my-subjects response already
  // has each subject's id — just wasn't being kept, only the exam codes
  // were extracted from it.
  const [teacherSubjectIds, setTeacherSubjectIds] = useState(null);
  useEffect(() => {
    if (user?.role !== 'teacher') return;
    api.get('/teacher/my-subjects')
      .then(res => {
        const rows = res?.data || [];
        setTeacherExamCodes(new Set(rows.map(s => s.exam_board_code).filter(Boolean)));
        setTeacherSubjectIds(new Set(rows.map(s => s.id)));
      })
      .catch(() => { setTeacherExamCodes(new Set()); setTeacherSubjectIds(new Set()); });
  }, [user?.role]);

  const visibleExamTypes = user?.role === 'teacher'
    ? examTypes.filter(et => teacherExamCodes?.has(et.code))
    : examTypes;

  const handlePickExamType = async (et) => {
    setSelectedExamType(et);
    setSelectedSubject(null);
    setSelectedTopic(null);
    setSubjects([]);
    setTopics([]);
    setLoadingSubjects(true);
    try {
      const subs = await fetchSubjectsForType(et.id);
      // GAP FIX: fetchSubjectsForType is the same unrestricted, platform-
      // wide list for every role — narrow it to the teacher's own
      // assigned subjects here, the same way visibleExamTypes already
      // narrows Step 1. teacherSubjectIds is populated by the same
      // GET /teacher/my-subjects call that already builds teacherExamCodes
      // above.
      const scoped = user?.role === 'teacher'
        ? (subs || []).filter(s => teacherSubjectIds?.has(s.id))
        : (subs || []);
      setSubjects(scoped);
    } catch {
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handlePickSubject = async (sub) => {
    setSelectedSubject(sub);
    setSelectedTopic(null);
    setTopics([]);
    setLoadingTopics(true);
    try {
      // /teacher/topics already permits the admin role too (see
      // AdminDashboard.jsx's own topic-management panel, which uses this
      // same endpoint regardless of role) — no need for a separate
      // /admin/topics variant.
      const res = await api.get(`/teacher/topics?subject_id=${sub.id}`);
      setTopics(res?.data || []);
    } catch {
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  };

  const handlePickTopic = (topic) => setSelectedTopic(topic);

  const resetToExamTypeStage = () => {
    setSelectedExamType(null);
    setSelectedSubject(null);
    setSelectedTopic(null);
    setSubjects([]);
    setTopics([]);
    setQuestions([]);
  };
  const resetToSubjectStage = () => {
    setSelectedSubject(null);
    setSelectedTopic(null);
    setTopics([]);
    setQuestions([]);
  };
  const resetToTopicStage = () => {
    setSelectedTopic(null);
    setQuestions([]);
  };

  // Review modal state
  const [reviewing, setReviewing] = useState(null); // question object
  const [action,    setAction]    = useState('');   // 'approve' | 'reject'
  const [feedback,  setFeedback]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPending = useCallback(async (off = 0) => {
    if (!selectedExamType || !selectedSubject || !selectedTopic) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE, offset: off,
        exam_type_id: selectedExamType.id,
        subject_id:   selectedSubject.id,
        topic_id:     selectedTopic.id,
      });
      const data = await api.get(`${apiBase}/questions/pending?${params.toString()}`);
      setQuestions(data.data || []);
      setTotal(data.total || 0);
      setOffset(off);
    } catch (err) {
      setError(err?.message || 'Failed to load pending questions');
    } finally {
      setLoading(false);
    }
  }, [apiBase, selectedExamType, selectedSubject, selectedTopic]);

  // Only fetch once all three stages are picked — deliberately not fetch-
  // then-hide, since briefly showing an unfiltered list before narrowing it
  // is exactly the intimidating experience this feature removes.
  useEffect(() => {
    if (selectedExamType && selectedSubject && selectedTopic) fetchPending(0);
  }, [fetchPending, selectedExamType, selectedSubject, selectedTopic]);

  // ── Review submit ──────────────────────────────────────────────────────────

  const submitReview = async () => {
    if (!reviewing || !action) return;
    setSubmitting(true);
    try {
      const data = await api.put(
        `${apiBase}/questions/${reviewing.id}/review`,
        { action, feedback: feedback.trim() || undefined }
      );
      if (data.success) {
        setReviewing(null);
        setAction('');
        setFeedback('');
        // Remove from list immediately for instant feedback
        setQuestions(prev => prev.filter(q => q.id !== reviewing.id));
        setTotal(t => t - 1);
      }
    } catch (err) {
      alert(err?.response?.data?.error || 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Pagination ─────────────────────────────────────────────────────────────

  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // ── Empty state ────────────────────────────────────────────────────────────
  // BUG FIX: this condition never checked whether a topic had actually been
  // selected. questions starts as [] and offset starts as 0 — both true on
  // the very first render, before the picker below has even been shown, so
  // this fired immediately every single time and permanently hid the entire
  // exam-type -> subject -> topic picker (dead code from that point on,
  // despite being correctly built) behind an "All caught up!" screen. Now
  // only shows once a topic is actually selected and a fetch has genuinely
  // come back empty.
  if (!loading && !error && questions.length === 0 && offset === 0 && selectedExamType && selectedSubject && selectedTopic) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">All caught up!</h2>
            <p className="text-gray-500 mb-6">No pending questions for {selectedTopic?.name || 'this topic'}.</p>
            <div className="flex items-center justify-center gap-4">
              <button onClick={() => navigate(dashboardPath)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 font-medium">
                <ArrowLeft className="w-4 h-4" /> Dashboard
              </button>
              <button onClick={() => setSelectedTopic(null)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 font-medium">
                <ChevronLeft className="w-4 h-4" /> Change topic
              </button>
              <button onClick={() => fetchPending(0)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(dashboardPath)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl px-3 py-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-6 h-6 text-orange-500" /> Question Review Queue
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {loading
                  ? 'Loading…'
                  : (selectedExamType && selectedSubject && selectedTopic)
                    ? `${total} pending submission${total !== 1 ? 's' : ''}`
                    : 'Pick an exam type, subject, and topic to see questions'}
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchPending(offset)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-white transition-colors text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Staged exam-type -> subject -> topic picker. Nothing below this
            fetches or renders until all three are picked — reduces
            intimidation by surfacing one small decision at a time instead
            of a big list or several dropdowns shown together up front. */}
        {!(selectedExamType && selectedSubject && selectedTopic) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            {/* Breadcrumb of already-made picks, each clickable to jump back */}
            {(selectedExamType || selectedSubject) && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
                <button onClick={resetToExamTypeStage} className="hover:text-violet-600 font-medium underline">Exam Type</button>
                {selectedExamType && (<><span>›</span><span className="font-semibold text-gray-700">{selectedExamType.name}</span></>)}
                {selectedSubject && (<><span>›</span><button onClick={resetToSubjectStage} className="hover:text-violet-600 font-medium underline">{selectedSubject.name}</button></>)}
              </div>
            )}

            {!selectedExamType && (
              <>
                <p className="text-sm font-semibold text-gray-700 mb-3">Step 1 of 3 — Choose an exam type</p>
                {loadingTypes || (user?.role === 'teacher' && teacherExamCodes === null) ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>
                ) : visibleExamTypes.filter(et => et.is_active !== false).length === 0 ? (
                  <p className="text-sm text-gray-400">
                    {user?.role === 'teacher'
                      ? 'No subjects assigned to you yet — contact your admin.'
                      : 'No exam types found.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {visibleExamTypes.filter(et => et.is_active !== false).map(et => (
                      <button key={et.id} onClick={() => handlePickExamType(et)}
                        className="text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-violet-400 hover:bg-violet-50 transition-colors text-sm font-medium text-gray-800">
                        {et.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectedExamType && !selectedSubject && (
              <>
                <p className="text-sm font-semibold text-gray-700 mb-3">Step 2 of 3 — Choose a subject</p>
                {loadingSubjects ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>
                ) : subjects.length === 0 ? (
                  <p className="text-sm text-gray-400">No subjects found under this exam type.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {subjects.map(s => (
                      <button key={s.id} onClick={() => handlePickSubject(s)}
                        className="text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-violet-400 hover:bg-violet-50 transition-colors text-sm font-medium text-gray-800">
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectedExamType && selectedSubject && !selectedTopic && (
              <>
                <p className="text-sm font-semibold text-gray-700 mb-3">Step 3 of 3 — Choose a topic</p>
                {loadingTopics ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>
                ) : topics.length === 0 ? (
                  <p className="text-sm text-gray-400">No topics found under this subject.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {topics.map(t => (
                      <button key={t.id} onClick={() => handlePickTopic(t)}
                        className="text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-violet-400 hover:bg-violet-50 transition-colors text-sm font-medium text-gray-800">
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {selectedExamType && selectedSubject && selectedTopic && (<>
        {/* Breadcrumb once questions are showing, so the admin can still jump back */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
          <button onClick={resetToExamTypeStage} className="hover:text-violet-600 font-medium underline">{selectedExamType.name}</button>
          <span>›</span>
          <button onClick={resetToSubjectStage} className="hover:text-violet-600 font-medium underline">{selectedSubject.name}</button>
          <span>›</span>
          <button onClick={resetToTopicStage} className="hover:text-violet-600 font-medium underline">{selectedTopic.name}</button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={() => fetchPending(0)} className="ml-auto text-xs font-medium underline">Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map(j => <div key={j} className="h-10 bg-gray-100 rounded-lg" />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Question cards */}
        {!loading && questions.length > 0 && (
          <div className="space-y-4">
            {questions.map(q => {
              // FEATURE: question_type support (see adminRoutes.js's
              // POST /generate-questions for the full rationale). This
              // review queue's own isBroken/options-required check is
              // only meaningful for mcq-shaped questions — a
              // short_answer/structured question has no options array by
              // design (options: NULL, see the INSERT in
              // adminRoutes.js), so applying the same "needs 2+ options
              // with one correct" rule to them would permanently block
              // approval of every question of those types, regardless of
              // how good the AI-generated content actually was. q.type
              // may be absent on older rows inserted before this field
              // was added to the SELECT — treat missing/undefined the
              // same as 'mcq' for backward compatibility.
              const isFreeText = q.type === 'short_answer' || q.type === 'structured';

              const validOptions = (q.options || []).filter(opt => {
                const text = typeof opt === 'string' ? opt : opt?.option_text;
                return text && String(text).trim();
              });
              // BUG FIX: hardened the legacy-string-option fallback comparison
              // to match the normalizer used everywhere else this question's
              // options get compared (PracticeMode.jsx, QuizPage.jsx,
              // SubtopicPage.jsx, questionsRoutes.js) — curly quotes / non-
              // breaking spaces could otherwise make a genuinely-correct
              // legacy option fail to register as correct here too.
              const normalizeForCompare = (s) =>
                String(s ?? '')
                  .replace(/[\u2018\u2019\u201B]/g, "'")
                  .replace(/[\u201C\u201D\u201F]/g, '"')
                  .replace(/[\u00A0\u2007\u202F]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toLowerCase();
              const hasCorrect = validOptions.some(opt =>
                typeof opt === 'object' ? !!opt.is_correct
                  : normalizeForCompare(opt) === normalizeForCompare(q.correct_answer)
              );
              // For short_answer/structured, the only thing that makes a
              // question "broken" is a missing model/expected answer —
              // options never apply. For mcq, unchanged: needs 2+ usable
              // options with one flagged correct.
              const isBroken = isFreeText
                ? !String(q.correct_answer || '').trim()
                : (validOptions.length < 2 || !hasCorrect);

              return (
              <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Card header */}
                <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">
                    {q.exam_board_code} — {q.exam_board_name}
                  </span>
                  {q.topic && (
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {q.topic}
                    </span>
                  )}
                  {q.year && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {q.year}
                    </span>
                  )}
                  {q.difficulty && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${DIFFICULTY_COLORS[q.difficulty] || 'bg-gray-100 text-gray-600'}`}>
                      {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                    </span>
                  )}
                  {isFreeText && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                      {q.type === 'structured' ? 'Structured' : 'Short Answer'}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {q.first_name} {q.last_name}
                    {q.submitted_by_email && <span className="text-gray-300">· {q.submitted_by_email}</span>}
                  </span>
                </div>

                {/* Question text */}
                <div className="px-6 py-4">
                  <p className="text-gray-900 font-medium leading-relaxed">{q.question_text}</p>
                </div>

                {/* Options — only meaningful for mcq; short_answer/structured
                    have no options by design (see isFreeText above), so this
                    whole section is skipped for them rather than falling
                    through to render an accidentally-empty grid. Their
                    expected/model answer is shown in the "Correct Answer"
                    box below instead, same as it already is for mcq. */}
                {isFreeText ? null : isBroken ? (
                  <div className="px-6 pb-4">
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">
                        {validOptions.length < 2
                          ? `This question only has ${validOptions.length} usable option(s) and cannot be answered. Approval is disabled — reject it instead.`
                          : 'No option is marked as the correct answer. Approval is disabled — reject it instead.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="px-6 pb-4 grid grid-cols-2 gap-2">
                    {validOptions.map((opt, i) => {
                      // Handle both object {option_text, is_correct} and legacy string formats
                      const optText    = typeof opt === 'string' ? opt : (opt.option_text || '');
                      const isCorrect  = typeof opt === 'object'
                        ? !!opt.is_correct
                        : normalizeForCompare(optText) === normalizeForCompare(q.correct_answer);
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 p-3 rounded-xl border ${
                            isCorrect ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          <span className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                            isCorrect ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {OPTION_LABELS[i]}
                          </span>
                          <span className="text-sm text-gray-800 truncate">{optText}</span>
                          {isCorrect && <CheckCircle className="w-4 h-4 text-green-500 ml-auto flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Correct answer + explanation — visible to admin only, never shown to students */}
                {(q.correct_answer || q.explanation) && (
                  <div className="px-6 pb-4 space-y-2">
                    {q.correct_answer && (
                      <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-green-700 mb-0.5">
                            {q.type === 'structured' ? 'Model Answer' : 'Correct Answer'}
                          </p>
                          <p className="text-sm text-green-900">{q.correct_answer}</p>
                        </div>
                      </div>
                    )}
                    {q.explanation && (
                      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                        <BookOpen className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-blue-700 mb-0.5">Explanation</p>
                          <p className="text-sm text-blue-900">{q.explanation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-6 pb-5 flex gap-3">
                  <button
                    onClick={() => { setReviewing(q); setAction('approve'); setFeedback(''); }}
                    disabled={isBroken}
                    title={isBroken ? 'Cannot approve — this question has no usable answer options.' : undefined}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => { setReviewing(q); setAction('reject'); setFeedback(''); }}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => fetchPending(offset - PAGE_SIZE)}
              disabled={offset === 0}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => fetchPending(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        </>)}
      </div>

      {/* ── Review Confirm Modal ─────────────────────────────────────────────── */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              {action === 'approve'
                ? <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
                : <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600" /></div>
              }
              <div>
                <h3 className="font-bold text-gray-900">
                  {action === 'approve' ? 'Approve Question' : 'Reject Question'}
                </h3>
                <p className="text-xs text-gray-500">Question #{reviewing.id}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-sm text-gray-700 line-clamp-3">{reviewing.question_text}</p>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Feedback to submitter <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={3}
                placeholder={action === 'reject' ? 'Reason for rejection…' : 'Any notes for the contributor…'}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setReviewing(null); setAction(''); setFeedback(''); }}
                disabled={submitting}
                className="flex-1 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={submitting}
                className={`flex-1 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm ${
                  action === 'approve'
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : 'bg-red-500 hover:bg-red-600'
                } disabled:opacity-50`}
              >
                {submitting ? <Loader className="w-4 h-4 animate-spin" /> : null}
                Confirm {action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
