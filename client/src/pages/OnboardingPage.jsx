// client/src/pages/OnboardingPage.jsx
// Route: /onboarding  (redirect here after registration – students only)
// 4-step wizard: exam board → subjects → daily goal → study schedule
//
// FIX v1.1: Replaced raw axios calls with the api instance from services/api.js
//   - Removed: import axios, const API, const authHeader
//   - Added:   import api
//   - All requests now use automatic JWT injection and consistent error handling
//
// FIX v1.2 – Onboarding subjects list was always empty
// BUG 1 (backend): subjects controller ignored exam_board_code param.
//   Fixed in server/controllers/subjects.js – see that file's changelog.
// BUG 2 (frontend data unwrapping): api.js response interceptor returns
//   response.data directly, so `r` inside .then() is already the backend's
//   JSON body: { success, count, data: [...] }.
//   Previous code did `r.data || []` which correctly got the array – BUT
//   only when the board filter worked. With the backend fix in place,
//   this now resolves correctly.
//   For safety the unwrap is now explicit: `r?.data ?? []` with a fallback
//   to treat `r` itself as an array (handles any future interceptor change).
//
// Supported exam boards loaded dynamically from /api/exam-boards (DB-driven),
// so the wizard works for ALL boards: JAMB, WAEC, NECO, Cambridge, AQA,
// Edexcel, IELTS, TOEFL, SAT, Junior WAEC, and any future additions.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const GOALS = [
  { value: 5,   label: '5 questions',   note: 'Free plan',   color: 'border-gray-200' },
  { value: 20,  label: '20 questions',  note: 'Light study', color: 'border-teal-300' },
  { value: 50,  label: '50 questions',  note: 'Recommended', color: 'border-teal-500', featured: true },
  { value: 100, label: '100 questions', note: 'Intensive',   color: 'border-purple-400' },
];

const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIMES = [
  { value: 'morning',   label: 'Morning',   note: '6am – 10am',  emoji: '🌅' },
  { value: 'afternoon', label: 'Afternoon', note: '12pm – 4pm',  emoji: '☀️' },
  { value: 'evening',   label: 'Evening',   note: '6pm – 10pm',  emoji: '🌙', featured: true },
];

// Helper: safely extract the data array from any api response shape
// The api.js interceptor returns response.data, so `r` from api.get() is the
// backend JSON body: { success, count, data: [...] }.
// This helper handles both that shape and a bare array (defensive fallback).
const extractList = (r) => {
  if (Array.isArray(r))        return r;          // bare array (shouldn't happen)
  if (Array.isArray(r?.data))  return r.data;     // { success, count, data: [...] }
  return [];
};

export default function OnboardingPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [step,       setStep]       = useState(1);

  // Step 1 – exam board codes (e.g. 'JAMB', 'WAEC', 'Cambridge A Level')
  const [boards,     setBoards]     = useState([]);
  // All boards loaded from DB so every exam type is supported
  const [allBoards,  setAllBoards]  = useState([]);
  const [boardsLoading, setBoardsLoading] = useState(true);

  // Step 2 – subjects
  const [subjects,   setSubjects]   = useState([]);
  const [allSubs,    setAllSubs]    = useState([]);
  const [loadingS,   setLoadingS]   = useState(false);

  // Step 3 – daily goal
  const [goal,       setGoal]       = useState(20);

  // Step 4 – schedule
  const [studyDays,  setStudyDays]  = useState([]);
  const [studyTime,  setStudyTime]  = useState('evening');
  const [saving,     setSaving]     = useState(false);

  // ── Load all exam boards from DB on mount ──────────────────────────────────
  useEffect(() => {
    api.get('/exam-boards')
      .then(r => setAllBoards(extractList(r)))
      .catch(() => setAllBoards([]))
      .finally(() => setBoardsLoading(false));
  }, []);

  // ── Load subjects whenever board selection changes ─────────────────────────
  // FIX: Send exam_board_code (the board's code string, e.g. "JAMB") – the
  // backend subjects controller now supports this param directly via a JOIN
  // on exam_boards.code. Previously only exam_board_id (UUID) was accepted,
  // so subjects were never returned during onboarding.
  useEffect(() => {
    if (boards.length === 0) { setAllSubs([]); return; }
    setLoadingS(true);
    Promise.all(
      boards.map(code =>
        api.get('/subjects', { params: { exam_board_code: code } })
          .then(r => extractList(r))
          .catch(() => [])
      )
    )
      .then(results => {
        const flat   = results.flat();
        const unique = [...new Map(flat.map(s => [s.id, s])).values()];
        setAllSubs(unique);
      })
      .finally(() => setLoadingS(false));
  }, [boards.join(',')]); // eslint-disable-line

  const toggleBoard = (code) =>
    setBoards(prev =>
      prev.includes(code) ? prev.filter(b => b !== code) : [...prev, code]
    );

  const toggleSubject = (id) => {
    if (subjects.includes(id)) {
      setSubjects(prev => prev.filter(s => s !== id));
    } else {
      if (subjects.length >= 3) return; // free plan limit
      setSubjects(prev => [...prev, id]);
    }
  };

  // ── Save preferences and redirect to dashboard ────────────────────────────
  const finish = async () => {
    setSaving(true);
    try {
      await api.patch('/users/preferences', {
        exam_boards: boards,
        subject_ids: subjects,
        daily_goal:  goal,
        study_days:  studyDays,
        study_time:  studyTime,
      });
      navigate('/student/dashboard');
    } catch {
      navigate('/student/dashboard'); // fail-open – don't block the student
    } finally {
      setSaving(false);
    }
  };

  const canNext =
    step === 1 ? boards.length > 0 :
    step === 2 ? subjects.length > 0 :
    true;

  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Step progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? 'w-8 bg-teal-400' :
                s < step   ? 'w-4 bg-teal-600' :
                             'w-4 bg-white/20'
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-2xl">

          {/* ── Step 1: Choose exam board ─────────────────────────────────── */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Choose your exam</h2>
              <p className="text-sm text-gray-500 mb-5">
                Select all that apply – you can change this later
              </p>
              {boardsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="text-teal-400 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {allBoards.map(b => {
                    const sel = boards.includes(b.code);
                    return (
                      <button
                        key={b.id}
                        onClick={() => toggleBoard(b.code)}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                          sel ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'
                        }`}
                      >
                        <span className="text-2xl">{b.icon_emoji || '📋'}</span>
                        <div className="flex-1">
                          <p className={`font-semibold text-sm ${sel ? 'text-teal-700' : 'text-gray-800'}`}>
                            {b.name}
                          </p>
                          {b.description && (
                            <p className="text-xs text-gray-400">{b.description}</p>
                          )}
                        </div>
                        {sel && <Check size={16} className="text-teal-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Select subjects ───────────────────────────────────── */}
          {step === 2 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Select your subjects</h2>
              <p className="text-sm text-gray-500 mb-1">Pick up to 3 subjects (free plan)</p>
              <p className="text-xs text-teal-600 font-medium mb-4">{subjects.length}/3 selected</p>
              {loadingS ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="text-teal-400 animate-spin" />
                </div>
              ) : allSubs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No subjects found for the selected exam board(s).
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                  {allSubs.map(s => {
                    const sel    = subjects.includes(s.id);
                    const locked = !sel && subjects.length >= 3;
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSubject(s.id)}
                        disabled={locked}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                          sel    ? 'border-teal-500 bg-teal-50' :
                          locked ? 'border-gray-100 opacity-40 cursor-not-allowed' :
                                   'border-gray-200 hover:border-teal-300'
                        }`}
                      >
                        <span className="text-lg">{s.icon_emoji || '📚'}</span>
                        <p className={`text-xs font-semibold ${sel ? 'text-teal-700' : 'text-gray-700'}`}>
                          {s.name}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              {subjects.length >= 3 && (
                <p className="text-xs text-amber-600 mt-2">Upgrade to unlock more subjects</p>
              )}
            </>
          )}

          {/* ── Step 3: Daily goal ────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Set your study goal</h2>
              <p className="text-sm text-gray-500 mb-5">
                How many questions do you want to practice daily?
              </p>
              <div className="space-y-3">
                {GOALS.map(g => (
                  <button
                    key={g.value}
                    onClick={() => setGoal(g.value)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left relative ${
                      goal === g.value ? `${g.color} bg-teal-50` : `${g.color} hover:bg-gray-50`
                    } ${g.featured ? 'ring-1 ring-teal-400' : ''}`}
                  >
                    {g.featured && (
                      <span className="absolute -top-2 left-4 text-[10px] font-bold bg-teal-500 text-white px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-800">{g.label}/day</p>
                      <p className="text-xs text-gray-400">{g.note}</p>
                    </div>
                    {goal === g.value && <Check size={16} className="text-teal-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Step 4: Study schedule ────────────────────────────────────── */}
          {step === 4 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Set your study schedule</h2>
              <p className="text-sm text-gray-500 mb-5">
                When do you usually study? We'll send reminders to keep you on track.
              </p>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Study days</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {DAYS.map(day => {
                  const sel = studyDays.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() =>
                        setStudyDays(prev =>
                          sel ? prev.filter(d => d !== day) : [...prev, day]
                        )
                      }
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                        sel
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 text-gray-600 hover:border-teal-300'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Preferred time</p>
              <div className="space-y-2">
                {TIMES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setStudyTime(t.value)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left relative ${
                      studyTime === t.value ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'
                    } ${t.featured ? 'ring-1 ring-teal-400' : ''}`}
                  >
                    <span className="text-xl">{t.emoji}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-800">{t.label}</p>
                      <p className="text-xs text-gray-400">{t.note}</p>
                    </div>
                    {studyTime === t.value && <Check size={16} className="text-teal-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setStep(s => s - 1)}
              className={`flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors ${step === 1 ? 'invisible' : ''}`}
            >
              <ChevronLeft size={14} /> Back
            </button>

            {step < 4 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext}
                className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                {saving
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : <>Let's go! 🚀</>
                }
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-4">
          You can change these settings anytime from your profile
        </p>
      </div>
    </div>
  );
}
