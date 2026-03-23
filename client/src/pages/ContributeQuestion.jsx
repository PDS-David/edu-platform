// client/src/pages/ContributeQuestion.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Community question contribution form
// POST /api/questions/submit → success state "Under review"
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Send, CheckCircle, PlusCircle, Trash2, Lightbulb,
  ChevronDown, Loader, BookOpen, ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';



const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) => CURRENT_YEAR - i);

// ─────────────────────────────────────────────────────────────────────────────

export default function ContributeQuestion() {
  const navigate = useNavigate();

  // Form state
  const [examBoards,   setExamBoards]   = useState([]);
  const [subjects,     setSubjects]     = useState([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);

  const [form, setForm] = useState({
    exam_board_id: '',
    subject_id:    '',
    year:          '',
    topic:         '',
    difficulty:    'medium',
    question_text: '',
    explanation:   '',
  });

  const [options, setOptions] = useState([
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ]);

  const [hints, setHints] = useState(['', '', '']);
  const [errors, setErrors] = useState({});

  // Load exam boards
  useEffect(() => {
    api.get('/exam-boards')
      .then(r => setExamBoards(r.data || []))
      .catch(() => setExamBoards([]))
      .finally(() => setBoardsLoading(false));
  }, []);

  // Load subjects when board changes
  useEffect(() => {
    if (!form.exam_board_id) { setSubjects([]); return; }
    const board = examBoards.find(b => b.id === parseInt(form.exam_board_id))?.code;
    if (!board) return;
    api.get(`/subjects?board=${board}`)
      .then(r => setSubjects(r.data || []))
      .catch(() => setSubjects([]));
  }, [form.exam_board_id, examBoards]);

  // Field change
  const handleField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: '' }));
  };

  // Option text change
  const handleOptionText = (i, val) => {
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, text: val } : o));
  };

  // Set correct option (only one correct for MCQ)
  const handleCorrect = (i) => {
    setOptions(prev => prev.map((o, idx) => ({ ...o, is_correct: idx === i })));
    setErrors(e => ({ ...e, options: '' }));
  };

  // Add/remove options (min 2, max 6)
  const addOption = () => {
    if (options.length >= 6) return;
    setOptions(prev => [...prev, { text: '', is_correct: false }]);
  };
  const removeOption = (i) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  };

  // Hint change
  const handleHint = (i, val) => {
    setHints(prev => prev.map((h, idx) => idx === i ? val : h));
  };

  // Validate
  const validate = () => {
    const e = {};
    if (!form.exam_board_id) e.exam_board_id = 'Please select an exam type';
    if (!form.question_text.trim()) e.question_text = 'Question text is required';
    if (form.question_text.trim().length < 10) e.question_text = 'Question is too short (min 10 chars)';
    const filled = options.filter(o => o.text.trim());
    if (filled.length < 2) e.options = 'At least 2 options must have text';
    if (!options.some(o => o.is_correct)) e.options = 'Please mark the correct answer';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Submit
  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const payload = {
      exam_board_id: parseInt(form.exam_board_id, 10),
      subject_id:    form.subject_id ? parseInt(form.subject_id, 10) : null,
      year:          form.year       ? parseInt(form.year, 10)        : null,
      topic:         form.topic      || null,
      difficulty:    form.difficulty,
      question_text: form.question_text.trim(),
      explanation:   form.explanation.trim() || null,
      options:       options.filter(o => o.text.trim()).map(o => ({ text: o.text.trim(), is_correct: o.is_correct })),
      hints:         hints.filter(h => h.trim()),
    };

    try {
      const res = await api.post('/questions/submit', payload);
      if (res.success) {
        setSubmitted(true);
      } else {
        alert(res.error || 'Submission failed');
      }
    } catch (err) {
      alert(err?.error || 'Failed to submit question. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success State ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-10 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Under Review</h2>
          <p className="text-gray-500 mb-2">
            Your question has been submitted and is awaiting admin review.
          </p>
          <p className="text-sm text-gray-400 mb-8">
            Once approved, it will appear in the practice pool for all students.
            Thank you for contributing to EAC!
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setSubmitted(false);
                setForm({ exam_board_id: '', subject_id: '', year: '', topic: '', difficulty: 'medium', question_text: '', explanation: '' });
                setOptions([{ text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }]);
                setHints(['', '', '']);
              }}
              className="flex-1 border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-semibold py-3 rounded-xl transition-colors"
            >
              Submit Another
            </button>
            <button
              onClick={() => navigate('/student/dashboard')}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';
  const inputClass = (err) =>
    `w-full border rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 bg-gray-50 ${
      err ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-indigo-200'
    }`;

  const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pt-2">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" /> Contribute a Question
            </h1>
            <p className="text-sm text-gray-500">Help build the question bank for all students</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-6">

          {/* Exam Type + Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Exam Type <span className="text-red-500">*</span>
              </label>
              {boardsLoading ? (
                <div className="flex items-center gap-2 text-gray-400 py-3 text-sm">
                  <Loader className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <select
                  value={form.exam_board_id}
                  onChange={e => handleField('exam_board_id', e.target.value)}
                  className={inputClass(errors.exam_board_id)}
                >
                  <option value="">Select…</option>
                  {examBoards.map(b => (
                    <option key={b.id} value={b.id}>{b.icon_emoji} {b.name}</option>
                  ))}
                </select>
              )}
              {errors.exam_board_id && <p className="text-red-500 text-xs mt-1">{errors.exam_board_id}</p>}
            </div>

            <div>
              <label className={labelClass}>Subject</label>
              <select
                value={form.subject_id}
                onChange={e => handleField('subject_id', e.target.value)}
                disabled={!form.exam_board_id || subjects.length === 0}
                className={`${inputClass()} disabled:opacity-50`}
              >
                <option value="">Any subject</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.icon_emoji} {s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Year + Topic + Difficulty */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Year</label>
              <select
                value={form.year}
                onChange={e => handleField('year', e.target.value)}
                className={inputClass()}
              >
                <option value="">Unknown</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Topic</label>
              <input
                type="text"
                value={form.topic}
                onChange={e => handleField('topic', e.target.value)}
                placeholder="e.g. Algebra"
                className={inputClass()}
              />
            </div>
            <div>
              <label className={labelClass}>Difficulty</label>
              <select
                value={form.difficulty}
                onChange={e => handleField('difficulty', e.target.value)}
                className={inputClass()}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Question Text */}
          <div>
            <label className={labelClass}>
              Question Text <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.question_text}
              onChange={e => handleField('question_text', e.target.value)}
              rows={4}
              placeholder="Type your question here…"
              className={inputClass(errors.question_text)}
            />
            {errors.question_text && <p className="text-red-500 text-xs mt-1">{errors.question_text}</p>}
          </div>

          {/* Answer Options */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className={`${labelClass} mb-0`}>
                Answer Options <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-gray-400">Click the circle to mark the correct answer</span>
            </div>
            {errors.options && <p className="text-red-500 text-xs mb-2">{errors.options}</p>}

            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* Correct radio */}
                  <button
                    onClick={() => handleCorrect(i)}
                    title="Mark as correct"
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      opt.is_correct
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {opt.is_correct && <span className="text-xs font-bold">✓</span>}
                  </button>

                  {/* Label */}
                  <span className="w-6 h-6 bg-gray-100 rounded text-xs font-bold text-gray-600 flex items-center justify-center flex-shrink-0">
                    {OPTION_LABELS[i]}
                  </span>

                  {/* Text input */}
                  <input
                    type="text"
                    value={opt.text}
                    onChange={e => handleOptionText(i, e.target.value)}
                    placeholder={`Option ${OPTION_LABELS[i]}`}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />

                  {/* Remove */}
                  {options.length > 2 && (
                    <button onClick={() => removeOption(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button
                onClick={addOption}
                className="mt-2 flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700 font-medium"
              >
                <PlusCircle className="w-4 h-4" /> Add option
              </button>
            )}
          </div>

          {/* Explanation */}
          <div>
            <label className={labelClass}>
              Explanation <span className="text-gray-400">(optional but recommended)</span>
            </label>
            <textarea
              value={form.explanation}
              onChange={e => handleField('explanation', e.target.value)}
              rows={3}
              placeholder="Explain why the correct answer is correct…"
              className={inputClass()}
            />
          </div>

          {/* Hints */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <label className={`${labelClass} mb-0`}>
                Progressive Hints <span className="text-gray-400">(optional, max 3)</span>
              </label>
            </div>
            <div className="space-y-2">
              {hints.map((h, i) => (
                <input
                  key={i}
                  type="text"
                  value={h}
                  onChange={e => handleHint(i, e.target.value)}
                  placeholder={`Hint ${i + 1}${i === 0 ? ' (vaguest)' : i === 2 ? ' (most direct)' : ''}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {submitting
              ? <><Loader className="w-5 h-5 animate-spin" /> Submitting…</>
              : <><Send className="w-5 h-5" /> Submit for Review</>
            }
          </button>

          <p className="text-center text-xs text-gray-400">
            All submissions are reviewed by our admin team before going live.
          </p>
        </div>
      </div>
    </div>
  );
}
