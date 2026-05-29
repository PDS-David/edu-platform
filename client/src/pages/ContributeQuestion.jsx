// client/src/pages/ContributeQuestion.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Community question contribution form
// POST /api/questions/submit → success state "Under review"
//
// v1.2 ADDITIONS:
//   - question_type: 'mcq' | 'essay'  selector
//   - Essay mode: replaces options with a model_answer textarea + mark_scheme
//   - source field (optional) for attribution
//   - Link to view pending questions after submission
//
// v1.3 FIX (BUG 3):
//   - Added useAuth import to read user.role
//   - "View My Pending Questions" link only shown to teachers/admins
//   - "My Pending" header link only shown to teachers/admins
//   - "Back to Dashboard" navigates to role-appropriate dashboard
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import api from '../services/apiClient';
import {
  Send, CheckCircle, PlusCircle, Trash2, Lightbulb,
  Loader, BookOpen, ArrowLeft, FileText, Eye,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CURRENT_YEAR  = new Date().getFullYear();
const YEARS         = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) => CURRENT_YEAR - i);
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ─────────────────────────────────────────────────────────────────────────────
export default function ContributeQuestion() {
  const navigate    = useNavigate();
  // BUG 3 FIX: read user.role to conditionally show teacher-only links
  const { user }    = useAuth();
  const isTeacher   = ['teacher', 'admin'].includes(user?.role);

  const [examBoards,    setExamBoards]    = useState([]);
  const [subjects,      setSubjects]      = useState([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [submittedId,   setSubmittedId]   = useState(null);

  const [form, setForm] = useState({
    exam_board_id:  '',
    subject_id:     '',
    year:           '',
    topic:          '',
    difficulty:     'medium',
    question_type:  'mcq',
    question_text:  '',
    explanation:    '',
    model_answer:   '',
    mark_scheme:    '',
    source:         '',
  });

  const [options, setOptions] = useState([
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ]);

  const [hints,  setHints]  = useState(['', '', '']);
  const [errors, setErrors] = useState({});

  const isEssay = form.question_type === 'essay';

  // Load exam boards
  useEffect(() => {
    api.get('/exam-boards')
      .then(r => setExamBoards(Array.isArray(r) ? r : (r.data || [])))
      .catch(() => setExamBoards([]))
      .finally(() => setBoardsLoading(false));
  }, []);

  // Load subjects when board changes
  useEffect(() => {
    if (!form.exam_board_id) { setSubjects([]); return; }
    const board = examBoards.find(b => b.id === parseInt(form.exam_board_id))?.code;
    if (!board) return;
    api.get(`/subjects?board=${board}`)
      .then(r => setSubjects(Array.isArray(r) ? r : (r.data || [])))
      .catch(() => setSubjects([]));
  }, [form.exam_board_id, examBoards]);

  const handleField   = (key, val) => { setForm(f => ({ ...f, [key]: val })); setErrors(e => ({ ...e, [key]: '' })); };
  const handleOptText = (i, val)   => setOptions(p => p.map((o, idx) => idx === i ? { ...o, text: val } : o));
  const handleCorrect = (i)        => { setOptions(p => p.map((o, idx) => ({ ...o, is_correct: idx === i }))); setErrors(e => ({ ...e, options: '' })); };
  const addOption     = ()         => { if (options.length < 6) setOptions(p => [...p, { text: '', is_correct: false }]); };
  const removeOption  = (i)        => { if (options.length > 2) setOptions(p => p.filter((_, idx) => idx !== i)); };
  const handleHint    = (i, val)   => setHints(p => p.map((h, idx) => idx === i ? val : h));

  const validate = () => {
    const e = {};
    if (!form.exam_board_id)        e.exam_board_id = 'Please select an exam type';
    if (!form.question_text.trim()) e.question_text = 'Question text is required';
    if (form.question_text.trim().length < 10) e.question_text = 'Question is too short (min 10 chars)';
    if (isEssay) {
      if (!form.model_answer.trim()) e.model_answer = 'A model answer is required for essay questions';
    } else {
      const filled = options.filter(o => o.text.trim());
      if (filled.length < 2)              e.options = 'At least 2 options must have text';
      if (!options.some(o => o.is_correct)) e.options = 'Please mark the correct answer';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const payload = {
      exam_board_id: parseInt(form.exam_board_id, 10),
      subject_id:    form.subject_id ? parseInt(form.subject_id, 10) : null,
      year:          form.year       ? parseInt(form.year, 10)        : null,
      topic:         form.topic      || null,
      difficulty:    form.difficulty,
      question_type: form.question_type,
      question_text: form.question_text.trim(),
      explanation:   form.explanation.trim() || null,
      source:        form.source.trim()      || null,
      hints:         hints.filter(h => h.trim()),
      options: isEssay
        ? []
        : options.filter(o => o.text.trim()).map(o => ({ text: o.text.trim(), is_correct: o.is_correct })),
      model_answer: isEssay ? form.model_answer.trim() : null,
      mark_scheme:  isEssay ? form.mark_scheme.trim()  : null,
    };
    try {
      const res = await api.post('/questions/submit', payload);
      if (res.success) {
        setSubmittedId(res.data?.id || null);
        setSubmitted(true);
      } else {
        alert(res.error || 'Submission failed');
      }
    } catch (err) {
      alert(err?.message || 'Failed to submit question. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success State ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-10 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Under Review</h2>
          <p className="text-gray-500 mb-2">
            Your {isEssay ? 'essay' : 'MCQ'} question has been submitted and is awaiting admin review.
          </p>
          <p className="text-sm text-gray-400 mb-8">
            Once approved, it will appear in the question bank.
            Thank you for contributing to EAC!
          </p>
          <div className="flex flex-col gap-3">
            {/* BUG 3 FIX: only show this link to teachers/admins — students get 403 on this route */}
            {isTeacher && (
              <Link
                to="/teacher/pending-questions"
                className="flex items-center justify-center gap-2 border-2 border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold py-3 rounded-xl transition-colors"
              >
                <Eye className="w-4 h-4" /> View My Pending Questions
              </Link>
            )}
            <button
              onClick={() => {
                setSubmitted(false);
                setForm({ exam_board_id: '', subject_id: '', year: '', topic: '', difficulty: 'medium', question_type: 'mcq', question_text: '', explanation: '', model_answer: '', mark_scheme: '', source: '' });
                setOptions([{ text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }]);
                setHints(['', '', '']);
              }}
              className="border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-semibold py-3 rounded-xl transition-colors"
            >
              Submit Another Question
            </button>
            {/* BUG 3 FIX: navigate to role-appropriate dashboard instead of navigate(-1) */}
            <button
              onClick={() => isTeacher ? navigate('/teacher/dashboard') : navigate('/student/dashboard')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';
  const inputClass = (err) =>
    `w-full border rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 bg-gray-50 ${
      err ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-indigo-200'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pt-2">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" /> Contribute a Question
            </h1>
            <p className="text-sm text-gray-500">Help build the question bank for all students</p>
          </div>
          {/* BUG 3 FIX: only show pending link to teachers/admins */}
          {isTeacher && (
            <Link
              to="/teacher/pending-questions"
              className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors font-semibold"
            >
              <Eye className="w-3.5 h-3.5" /> My Pending
            </Link>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-6">

          {/* ── Question Type selector ── */}
          <div>
            <label className={labelClass}>Question Type <span className="text-red-500">*</span></label>
            <div className="flex gap-3">
              {[
                { value: 'mcq',   label: 'Multiple Choice (MCQ)',  desc: 'Student selects one correct option' },
                { value: 'essay', label: 'Essay / Free Text',      desc: 'Student writes a structured answer' },
              ].map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleField('question_type', t.value)}
                  className={`flex-1 border-2 rounded-xl p-3 text-left transition-all ${
                    form.question_type === t.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-200'
                  }`}
                >
                  <p className={`text-sm font-semibold ${form.question_type === t.value ? 'text-indigo-700' : 'text-gray-700'}`}>
                    {t.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Exam Type + Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Exam Type <span className="text-red-500">*</span></label>
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
                    <option key={b.id} value={b.id}>{b.icon_emoji || ''} {b.name}</option>
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
                  <option key={s.id} value={s.id}>{s.icon_emoji || ''} {s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Year + Topic + Difficulty */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Year</label>
              <select value={form.year} onChange={e => handleField('year', e.target.value)} className={inputClass()}>
                <option value="">Unknown</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Topic</label>
              <input type="text" value={form.topic} onChange={e => handleField('topic', e.target.value)}
                placeholder="e.g. Algebra" className={inputClass()} />
            </div>
            <div>
              <label className={labelClass}>Difficulty</label>
              <select value={form.difficulty} onChange={e => handleField('difficulty', e.target.value)} className={inputClass()}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Question Text */}
          <div>
            <label className={labelClass}>Question Text <span className="text-red-500">*</span></label>
            <textarea
              value={form.question_text}
              onChange={e => handleField('question_text', e.target.value)}
              rows={4}
              placeholder={isEssay
                ? 'Type your essay question here… e.g. "Discuss the role of the mitochondria in cellular respiration. (10 marks)"'
                : 'Type your MCQ question here…'
              }
              className={inputClass(errors.question_text)}
            />
            {errors.question_text && <p className="text-red-500 text-xs mt-1">{errors.question_text}</p>}
          </div>

          {/* ── MCQ OPTIONS ── */}
          {!isEssay && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className={`${labelClass} mb-0`}>
                  Answer Options <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-gray-400">Click the circle to mark correct</span>
              </div>
              {errors.options && <p className="text-red-500 text-xs mb-2">{errors.options}</p>}
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      onClick={() => handleCorrect(i)} title="Mark as correct"
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        opt.is_correct ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {opt.is_correct && <span className="text-xs font-bold"></span>}
                    </button>
                    <span className="w-6 h-6 bg-gray-100 rounded text-xs font-bold text-gray-600 flex items-center justify-center flex-shrink-0">
                      {OPTION_LABELS[i]}
                    </span>
                    <input
                      type="text" value={opt.text} onChange={e => handleOptText(i, e.target.value)}
                      placeholder={`Option ${OPTION_LABELS[i]}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    {options.length > 2 && (
                      <button onClick={() => removeOption(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {options.length < 6 && (
                <button onClick={addOption} className="mt-2 flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700 font-medium">
                  <PlusCircle className="w-4 h-4" /> Add option
                </button>
              )}
            </div>
          )}

          {/* ── ESSAY FIELDS ── */}
          {isEssay && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <strong>Essay questions</strong> are marked by the AI using your model answer and mark scheme.
                Students submit a written response which is then scored automatically.
              </div>
              <div>
                <label className={labelClass}>
                  Model Answer <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.model_answer}
                  onChange={e => handleField('model_answer', e.target.value)}
                  rows={5}
                  placeholder="Write a full model answer that would earn full marks…"
                  className={inputClass(errors.model_answer)}
                />
                {errors.model_answer && <p className="text-red-500 text-xs mt-1">{errors.model_answer}</p>}
              </div>
              <div>
                <label className={labelClass}>
                  Mark Scheme / Key Points
                  <span className="font-normal text-gray-400 ml-1">(optional — bullet points the AI checks for)</span>
                </label>
                <textarea
                  value={form.mark_scheme}
                  onChange={e => handleField('mark_scheme', e.target.value)}
                  rows={4}
                  placeholder="• Point 1 (2 marks)&#10;• Point 2 (3 marks)&#10;• Point 3 (2 marks)"
                  className={inputClass()}
                />
              </div>
            </div>
          )}

          {/* Explanation (MCQ) */}
          {!isEssay && (
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
          )}

          {/* Hints */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <label className={`${labelClass} mb-0`}>
                Progressive Hints <span className="text-gray-400">(optional, shown to struggling students)</span>
              </label>
            </div>
            <div className="space-y-2">
              {hints.map((h, i) => (
                <input
                  key={i} type="text" value={h} onChange={e => handleHint(i, e.target.value)}
                  placeholder={`Hint ${i + 1}${i === 0 ? ' (vaguest)' : i === 2 ? ' (most direct)' : ''}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              ))}
            </div>
          </div>

          {/* Source */}
          <div>
            <label className={labelClass}>
              Source / Authority
              <span className="font-normal text-gray-400 ml-1">(optional — e.g. "WAEC Past Questions 2019" or "EAC Original")</span>
            </label>
            <input
              type="text"
              value={form.source}
              onChange={e => handleField('source', e.target.value)}
              placeholder="e.g. JAMB Past Questions 2022, WAEC 2018, EAC AI-Generated"
              className={inputClass()}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit} disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {submitting
              ? <><Loader className="w-5 h-5 animate-spin" /> Submitting…</>
              : <><Send className="w-5 h-5" /> Submit for Review</>
            }
          </button>

          <p className="text-center text-xs text-gray-400">
            All submissions are reviewed before going live. Essay questions are AI-marked automatically once approved.
          </p>
        </div>
      </div>
    </div>
  );
}
