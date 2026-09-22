// client/src/pages/OrphanedQuestionsPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel: questions with no subtopic_id — these were silently excluded
// from every subject's practice/quiz pool (GET /questions/random scopes by
// board/subject via question -> subtopic -> topic -> subject, so an orphaned
// question just never reaches any student, with no error anywhere).
//
// GET /api/admin/questions/orphaned already existed on the backend, fully
// built and correct, along with PUT /api/admin/questions/:id/assign-subtopic
// — but no admin page ever called either one, so the only way to recover
// this content was a direct DB query. This page is that missing UI.
//
// No automated inference of the right subtopic is attempted here — confirmed
// via direct DB query (see the backend route's own comment) that the
// submitter data can't safely narrow it down: a large share have no
// submitted_by at all, another large share belong to the generic Platform
// Admin account, and every teacher who submitted the rest is assigned to
// multiple subjects. An admin has to look at the question text and pick.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import { useCatalog } from '../hooks/useCatalog';
import {
  ArrowLeft, Loader, Loader2, AlertCircle, CheckCircle,
  ChevronLeft, ChevronRight, User, Calendar, RefreshCw, Inbox,
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function OrphanedQuestionsPage() {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [total,      setTotal]    = useState(0);
  const [offset,     setOffset]   = useState(0);
  const [loading,    setLoading]  = useState(true);
  const [error,      setError]    = useState(null);

  const fetchOrphaned = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/admin/questions/orphaned', { params: { limit: PAGE_SIZE, offset } })
      .then(res => {
        setQuestions(res?.data || []);
        setTotal(res?.total || 0);
      })
      .catch(err => setError(err?.response?.data?.error || err?.message || 'Could not load orphaned questions.'))
      .finally(() => setLoading(false));
  }, [offset]);

  useEffect(() => { fetchOrphaned(); }, [fetchOrphaned]);

  // ── Assign-subtopic modal state ───────────────────────────────────────────
  const [assigning, setAssigning] = useState(null); // the question row being assigned, or null

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
      <button
        onClick={() => navigate('/admin/dashboard?panel=content')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Content Management
      </button>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-gray-900">Orphaned Questions</h1>
        <button
          onClick={fetchOrphaned}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Questions with no subtopic — invisible to every student until assigned one. {total > 0 && `${total} total.`}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && !error && questions.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">No orphaned questions</p>
          <p className="text-xs text-gray-400 mt-1">Every approved/active question has a subtopic assigned.</p>
        </div>
      )}

      <div className="space-y-3">
        {questions.map(q => (
          <div key={q.id} className="bg-white border border-gray-100 rounded-2xl p-4">
            <p className="text-sm text-gray-800 mb-2">{q.question_text}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mb-3">
              {q.first_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {q.first_name} {q.last_name}
                  {q.submitted_by_email ? ` (${q.submitted_by_email})` : ''}
                </span>
              )}
              {q.created_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(q.created_at).toLocaleDateString()}
                </span>
              )}
              {q.difficulty && <span className="capitalize">{q.difficulty}</span>}
            </div>
            <button
              onClick={() => setAssigning(q)}
              className="text-xs font-semibold text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-400 px-3 py-1.5 rounded-lg"
            >
              Assign to subtopic
            </button>
          </div>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-xs text-gray-400">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(o => o + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || loading}
            className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {assigning && (
        <AssignSubtopicModal
          question={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null);
            // Remove it from the current page locally rather than a full
            // refetch — it's no longer orphaned, so it wouldn't be returned
            // by this endpoint again anyway.
            setQuestions(prev => prev.filter(q => q.id !== assigning.id));
            setTotal(t => Math.max(0, t - 1));
          }}
        />
      )}
    </div>
  );
}

// ── Assign-subtopic modal ─────────────────────────────────────────────────────
// Exam type -> subject -> topic -> subtopic cascade, same staged pattern
// QuestionReview.jsx already uses for its own exam-type/subject/topic picker
// (/teacher/topics?subject_id= and /teacher/subtopics?topic_id= both already
// permit the admin role — see teacherOrAdmin middleware — no separate
// /admin/* variants needed for either).
function AssignSubtopicModal({ question, onClose, onAssigned }) {
  const { examTypes, loadingTypes, fetchSubjectsForType } = useCatalog();

  const [selectedExamType, setSelectedExamType] = useState(null);
  const [selectedSubject,  setSelectedSubject]  = useState(null);
  const [selectedTopic,    setSelectedTopic]    = useState(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);

  const [subjects,  setSubjects]  = useState([]);
  const [topics,    setTopics]    = useState([]);
  const [subtopics, setSubtopics] = useState([]);

  const [loadingSubjects,  setLoadingSubjects]  = useState(false);
  const [loadingTopics,    setLoadingTopics]    = useState(false);
  const [loadingSubtopics, setLoadingSubtopics] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const handlePickExamType = async (et) => {
    setSelectedExamType(et);
    setSelectedSubject(null); setSelectedTopic(null); setSelectedSubtopic(null);
    setSubjects([]); setTopics([]); setSubtopics([]);
    setLoadingSubjects(true);
    try {
      setSubjects(await fetchSubjectsForType(et.id) || []);
    } catch {
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handlePickSubject = async (sub) => {
    setSelectedSubject(sub);
    setSelectedTopic(null); setSelectedSubtopic(null);
    setTopics([]); setSubtopics([]);
    setLoadingTopics(true);
    try {
      const res = await api.get(`/teacher/topics?subject_id=${sub.id}`);
      setTopics(res?.data || []);
    } catch {
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  };

  const handlePickTopic = async (topic) => {
    setSelectedTopic(topic);
    setSelectedSubtopic(null);
    setSubtopics([]);
    setLoadingSubtopics(true);
    try {
      const res = await api.get(`/teacher/subtopics?topic_id=${topic.id}`);
      setSubtopics(res?.data || []);
    } catch {
      setSubtopics([]);
    } finally {
      setLoadingSubtopics(false);
    }
  };

  const submitAssignment = async () => {
    if (!selectedSubtopic) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.put(`/admin/questions/${question.id}/assign-subtopic`, {
        subtopic_id: selectedSubtopic.id,
      });
      onAssigned();
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err?.message || 'Could not assign subtopic.');
    } finally {
      setSubmitting(false);
    }
  };

  const PickerRow = ({ label, items, selected, onPick, loading, empty }) => (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => onPick(item)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                selected?.id === item.id
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-bold text-gray-900 mb-1">Assign to Subtopic</h3>
        <div className="bg-gray-50 rounded-xl p-3 mb-4">
          <p className="text-sm text-gray-700 line-clamp-3">{question.question_text}</p>
        </div>

        <PickerRow
          label="Exam type"
          items={loadingTypes ? [] : examTypes}
          selected={selectedExamType}
          onPick={handlePickExamType}
          loading={loadingTypes}
          empty="No exam types found."
        />

        {selectedExamType && (
          <PickerRow
            label="Subject"
            items={subjects}
            selected={selectedSubject}
            onPick={handlePickSubject}
            loading={loadingSubjects}
            empty="No subjects under this exam type."
          />
        )}

        {selectedSubject && (
          <PickerRow
            label="Topic"
            items={topics}
            selected={selectedTopic}
            onPick={handlePickTopic}
            loading={loadingTopics}
            empty="No topics under this subject."
          />
        )}

        {selectedTopic && (
          <PickerRow
            label="Subtopic"
            items={subtopics}
            selected={selectedSubtopic}
            onPick={setSelectedSubtopic}
            loading={loadingSubtopics}
            empty="No subtopics under this topic."
          />
        )}

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{submitError}</span>
          </div>
        )}

        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 border-2 border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={submitAssignment}
            disabled={submitting || !selectedSubtopic}
            className="flex-1 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}
