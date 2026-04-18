import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, AlertCircle, Plus, Trash2, ChevronDown } from "lucide-react";
import api from "../services/apiClient";

const DIFFICULTIES = ["easy", "medium", "hard"];

const emptyOption = () => ({ text: "", is_correct: false });

export default function TeacherAddQuestionPage() {
  const navigate = useNavigate();

  // Form state
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions]           = useState([emptyOption(), emptyOption(), emptyOption(), emptyOption()]);
  const [difficulty, setDifficulty]     = useState("medium");
  const [explanation, setExplanation]   = useState("");

  // Subject → Topic → Subtopic cascade
  const [subjects,   setSubjects]   = useState([]);
  const [topics,     setTopics]     = useState([]);
  const [subtopics,  setSubtopics]  = useState([]);
  const [subjectId,  setSubjectId]  = useState("");
  const [topicId,    setTopicId]    = useState("");
  const [subtopicId, setSubtopicId] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [error,      setError]      = useState("");

  // Load subjects on mount
  useEffect(() => {
    api.get("/teacher/my-subjects")
      .then(r => setSubjects(r.data || []))
      .catch(() => setSubjects([]));
  }, []);

  // Load topics when subject changes
  useEffect(() => {
    setTopics([]); setTopicId(""); setSubtopics([]); setSubtopicId("");
    if (!subjectId) return;
    api.get(`/teacher/topics?subject_id=${subjectId}`)
      .then(r => setTopics(r.data || []))
      .catch(() => setTopics([]));
  }, [subjectId]);

  // Load subtopics when topic changes
  useEffect(() => {
    setSubtopics([]); setSubtopicId("");
    if (!topicId) return;
    api.get(`/teacher/subtopics?topic_id=${topicId}`)
      .then(r => setSubtopics(r.data || []))
      .catch(() => setSubtopics([]));
  }, [topicId]);

  // Option handlers
  const updateOption = useCallback((i, field, value) => {
    setOptions(prev => prev.map((o, idx) =>
      idx === i ? { ...o, [field]: value } : o
    ));
  }, []);

  const markCorrect = useCallback((i) => {
    setOptions(prev => prev.map((o, idx) => ({ ...o, is_correct: idx === i })));
  }, []);

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions(prev => [...prev, emptyOption()]);
  };

  const removeOption = (i) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!questionText.trim()) return setError("Question text is required.");
    const filledOptions = options.filter(o => o.text.trim());
    if (filledOptions.length < 2) return setError("At least 2 options must have text.");
    if (!filledOptions.some(o => o.is_correct)) return setError("Mark one option as correct.");

    const payload = {
      question_text: questionText.trim(),
      difficulty,
      explanation: explanation.trim() || undefined,
      subtopic_id: subtopicId || undefined,
      options: filledOptions.map(o => ({
        option_text: o.text.trim(),
        is_correct:  o.is_correct,
      })),
    };

    setSubmitting(true);
    try {
      await api.post("/teacher/questions", payload);
      setSuccess(true);
      // Reset form
      setQuestionText(""); setOptions([emptyOption(), emptyOption(), emptyOption(), emptyOption()]);
      setDifficulty("medium"); setExplanation("");
      setSubjectId(""); setTopicId(""); setSubtopicId("");
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err.message || "Failed to submit question.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-800">Add Question</h1>
        </div>

        {/* Success banner */}
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-4">
            <CheckCircle size={18} />
            <span className="text-sm font-medium">Question added successfully!</span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Question text */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Question Text <span className="text-red-500">*</span>
            </label>
            <textarea
              value={questionText}
              onChange={e => setQuestionText(e.target.value)}
              rows={3}
              placeholder="Enter your question here..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Options */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">
                Answer Options <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-gray-400">Click a circle to mark correct</span>
            </div>

            <div className="space-y-3">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* Correct radio */}
                  <button
                    type="button"
                    onClick={() => markCorrect(i)}
                    className={`shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${
                      opt.is_correct
                        ? "border-green-500 bg-green-500"
                        : "border-gray-300 hover:border-green-400"
                    }`}
                    title="Mark as correct"
                  >
                    {opt.is_correct && (
                      <span className="flex items-center justify-center w-full h-full">
                        <span className="w-2 h-2 bg-white rounded-full block" />
                      </span>
                    )}
                  </button>

                  {/* Option text */}
                  <input
                    type="text"
                    value={opt.text}
                    onChange={e => updateOption(i, "text", e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                      opt.is_correct ? "border-green-300 bg-green-50" : "border-gray-200"
                    }`}
                  />

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="shrink-0 text-gray-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button
                type="button"
                onClick={addOption}
                className="mt-3 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
              >
                <Plus size={15} /> Add option
              </button>
            )}
          </div>

          {/* Difficulty */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Difficulty</label>
            <div className="flex gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    difficulty === d
                      ? d === "easy"   ? "bg-green-100 border-green-400 text-green-700"
                      : d === "medium" ? "bg-amber-100 border-amber-400 text-amber-700"
                      :                  "bg-red-100 border-red-400 text-red-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Subject / Topic / Subtopic (optional) */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Link to Topic <span className="text-gray-400 font-normal">(optional)</span>
            </label>

            <div className="space-y-3">
              {/* Subject */}
              <div className="relative">
                <select
                  value={subjectId}
                  onChange={e => setSubjectId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-300 pr-8"
                >
                  <option value="">— Select subject —</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* Topic */}
              {subjectId && (
                <div className="relative">
                  <select
                    value={topicId}
                    onChange={e => setTopicId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-300 pr-8"
                  >
                    <option value="">— Select topic —</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}

              {/* Subtopic */}
              {topicId && (
                <div className="relative">
                  <select
                    value={subtopicId}
                    onChange={e => setSubtopicId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-300 pr-8"
                  >
                    <option value="">— Select subtopic —</option>
                    {subtopics.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Explanation <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              rows={3}
              placeholder="Explain why the correct answer is right..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
          >
            {submitting ? "Saving…" : "Add Question"}
          </button>

        </form>
      </div>
    </div>
  );
}
