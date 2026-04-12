// client/src/pages/OnboardingPage.jsx
// Route: /onboarding  (redirect here after registration – students only)
//
// CHANGE v2.0 – Removed exam board selection step.
//   Students already choose their curriculum during registration.
//   Onboarding now starts directly at subject selection (3-step flow):
//     Step 1 → Select subjects
//     Step 2 → Daily goal
//     Step 3 → Study schedule
//
//   On mount the component auto-detects the student's curriculum from their
//   user profile and fetches matching subjects. If no curriculum is found it
//   falls back to loading ALL subjects so the student is never blocked.

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
  { value: 'morning',   label: 'Morning',   note: '6am – 10am',  emoji: '' },
  { value: 'afternoon', label: 'Afternoon', note: '12pm – 4pm',  emoji: '' },
  { value: 'evening',   label: 'Evening',   note: '6pm – 10pm',  emoji: '', featured: true },
];

const extractList = (r) => {
  if (Array.isArray(r))       return r;
  if (Array.isArray(r?.data)) return r.data;
  return [];
};

export default function OnboardingPage() {
  const { user, updateUser } = useAuth();
  const navigate             = useNavigate();

  // 3-step flow: 1=subjects, 2=goal, 3=schedule
  const [step,      setStep]      = useState(1);

  // Subjects
  const [allSubs,   setAllSubs]   = useState([]);
  const [subjects,  setSubjects]  = useState([]);   // selected subject IDs
  const [loadingS,  setLoadingS]  = useState(true);

  // The board codes we detected from the user's registration curriculum
  const [detectedBoards, setDetectedBoards] = useState([]);

  // Goal & schedule
  const [goal,      setGoal]      = useState(20);
  const [studyDays, setStudyDays] = useState([]);
  const [studyTime, setStudyTime] = useState('evening');
  const [saving,    setSaving]    = useState(false);

  // ── On mount: detect curriculum from user profile and load subjects ────────
  useEffect(() => {
    const loadSubjects = async () => {
      setLoadingS(true);
      try {
        // Try to match the user's curriculum to an exam board code
        const curriculum = user?.curriculum || user?.exam_board || '';
        let boardCodes   = [];

        if (curriculum) {
          // Fetch all boards and find one whose name or code fuzzy-matches
          const boardsRes = await api.get('/exam-boards').catch(() => ({ data: [] }));
          const allBoards = extractList(boardsRes);
          const matched   = allBoards.find(b =>
            b.code?.toLowerCase()  === curriculum.toLowerCase() ||
            b.name?.toLowerCase().includes(curriculum.toLowerCase()) ||
            curriculum.toLowerCase().includes(b.code?.toLowerCase())
          );
          if (matched) boardCodes = [matched.code];
        }

        setDetectedBoards(boardCodes);

        // Fetch subjects — filtered by board if we matched one, otherwise all
        let subs = [];
        if (boardCodes.length > 0) {
          const results = await Promise.all(
            boardCodes.map(code =>
              api.get('/subjects', { params: { exam_board_code: code } })
                .then(r => extractList(r))
                .catch(() => [])
            )
          );
          subs = results.flat();
        }

        // If board-filtered fetch returned nothing, fall back to all subjects
        if (subs.length === 0) {
          const allRes = await api.get('/subjects').catch(() => ({ data: [] }));
          subs = extractList(allRes);
        }

        // Deduplicate
        const unique = [...new Map(subs.map(s => [s.id, s])).values()];
        setAllSubs(unique);
      } catch {
        setAllSubs([]);
      } finally {
        setLoadingS(false);
      }
    };

    loadSubjects();
  }, []); // eslint-disable-line

  const toggleSubject = (id) => {
    if (subjects.includes(id)) {
      setSubjects(prev => prev.filter(s => s !== id));
    } else {
      if (subjects.length >= 10) return; // max 10 subjects
      setSubjects(prev => [...prev, id]);
    }
  };

  // ── Save preferences and redirect to student dashboard ────────────────────
  const finish = async () => {
    setSaving(true);
    try {
      await api.patch('/users/preferences', {
        exam_boards: detectedBoards,
        subject_ids: subjects,
        daily_goal:  goal,
        study_days:  studyDays,
        study_time:  studyTime,
      });
    } catch {
      // fail-open — preferences are non-critical, don't block the student
    } finally {
      setSaving(false);
      navigate('/student/dashboard');
    }
  };

  const canNext =
    step === 1 ? subjects.length > 0 :
    true;

  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        {/* 3-step progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
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

          {/* ── Step 1: Select subjects ───────────────────────────────────── */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Select your subjects</h2>
              <p className="text-sm text-gray-500 mb-1">Pick your subjects — 14-day free trial, full access</p>
              <p className="text-xs text-teal-600 font-medium mb-4">{subjects.length} selected</p>

              {loadingS ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="text-teal-400 animate-spin" />
                </div>
              ) : allSubs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No subjects found. Please contact support.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                  {allSubs.map(s => {
                    const sel    = subjects.includes(s.id);
                    const locked = !sel && subjects.length >= 10;
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
                        <span className="text-lg">{s.icon_emoji || ''}</span>
                        <p className={`text-xs font-semibold ${sel ? 'text-teal-700' : 'text-gray-700'}`}>
                          {s.name}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {subjects.length >= 10 && (
                <p className="text-xs text-amber-600 mt-2">Maximum 10 subjects selected</p>
              )}
            </>
          )}

          {/* ── Step 2: Daily goal ────────────────────────────────────────── */}
          {step === 2 && (
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

          {/* ── Step 3: Study schedule ────────────────────────────────────── */}
          {step === 3 && (
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

          {/* ── Navigation ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setStep(s => s - 1)}
              className={`flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors ${step === 1 ? 'invisible' : ''}`}
            >
              <ChevronLeft size={14} /> Back
            </button>

            {step < 3 ? (
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
                  : <>Let's go! </>
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
