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
import api from '../services/apiClient';

const GOALS = [
  { value: 5,   label: '5 questions',   note: 'Free plan',   color: 'border-gray-200' },
  { value: 20,  label: '20 questions',  note: 'Light study', color: 'border-blue-300' },
  { value: 50,  label: '50 questions',  note: 'Recommended', color: 'border-blue-500', featured: true },
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
        let subs = [];

        // Priority 1: use pending_exam_board_ids stored during registration.
        // These are the exam board IDs the student explicitly chose on sign-up.
        const pendingIds = user?.pending_exam_board_ids || [];

        if (pendingIds.length > 0) {
          setDetectedBoards(pendingIds);
          const results = await Promise.all(
            pendingIds.map(id =>
              api.get('/subjects', { params: { exam_board_id: id } })
                .then(r => extractList(r))
                .catch(() => [])
            )
          );
          subs = results.flat();
        }

        // Priority 2: fuzzy-match curriculum string (legacy / fallback)
        if (subs.length === 0) {
          const curriculum = user?.curriculum || user?.exam_board || '';
          if (curriculum) {
            const boardsRes = await api.get('/exam-boards').catch(() => ({ data: [] }));
            const allBoards = extractList(boardsRes);
            const matched   = allBoards.find(b =>
              b.code?.toLowerCase()  === curriculum.toLowerCase() ||
              b.name?.toLowerCase().includes(curriculum.toLowerCase()) ||
              curriculum.toLowerCase().includes(b.code?.toLowerCase())
            );
            if (matched) {
              setDetectedBoards([matched.id]);
              const r = await api.get('/subjects', { params: { exam_board_id: matched.id } })
                .catch(() => ({ data: [] }));
              subs = extractList(r);
            }
          }
        }

        // Priority 3: fall back to all subjects (deduplicated by name via server)
        if (subs.length === 0) {
          const allRes = await api.get('/subjects?for_test_builder=true').catch(() => ({ data: [] }));
          subs = extractList(allRes);
        }

        // Deduplicate by subject NAME so the same subject that exists across
        // multiple exam boards only shows once in the picker.
        const byName = new Map();
        subs.forEach(s => { if (!byName.has(s.name)) byName.set(s.name, s); });
        setAllSubs([...byName.values()]);
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
  const [saveError, setSaveError] = useState('');

  const finish = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch('/users/preferences', {
        exam_boards:          detectedBoards,
        subject_ids:          subjects,
        daily_goal:           goal,
        preferred_study_days: JSON.stringify(studyDays),
        preferred_study_time: studyTime,
      });
      // Update the in-memory user object immediately so PrivateRoute's
      // onboarding gate clears right away — without this, the redirect to
      // /student/dashboard below would immediately bounce back to
      // /onboarding, since `user.onboarding_complete` would still be
      // whatever it was when the page first loaded (false).
      updateUser({ onboarding_complete: true });
      navigate('/student/dashboard');
    } catch (err) {
      // The preferences save (and the onboarding_complete flag it sets)
      // failed server-side. Do NOT navigate away — PrivateRoute would just
      // redirect back here anyway since the server still has
      // onboarding_complete=false, and silently sending the student to a
      // dashboard with no subjects, no goal, and no schedule saved is the
      // exact failure mode this fix exists to prevent. Show a retry option
      // instead.
      setSaveError(
        err?.message || 'Could not save your preferences. Please check your connection and try again.'
      );
    } finally {
      setSaving(false);
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
                s === step ? 'w-8 bg-blue-400' :
                s < step   ? 'w-4 bg-blue-600' :
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
              <p className="text-xs text-blue-600 font-medium mb-4">{subjects.length} selected</p>

              {loadingS ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="text-blue-400 animate-spin" />
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
                          sel    ? 'border-blue-500 bg-blue-50' :
                          locked ? 'border-gray-100 opacity-40 cursor-not-allowed' :
                                   'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <span className="text-lg">{s.icon_emoji || ''}</span>
                        <p className={`text-xs font-semibold ${sel ? 'text-blue-700' : 'text-gray-700'}`}>
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
                      goal === g.value ? `${g.color} bg-blue-50` : `${g.color} hover:bg-gray-50`
                    } ${g.featured ? 'ring-1 ring-blue-400' : ''}`}
                  >
                    {g.featured && (
                      <span className="absolute -top-2 left-4 text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-800">{g.label}/day</p>
                      <p className="text-xs text-gray-400">{g.note}</p>
                    </div>
                    {goal === g.value && <Check size={16} className="text-blue-500 shrink-0" />}
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
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-blue-300'
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
                      studyTime === t.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                    } ${t.featured ? 'ring-1 ring-blue-400' : ''}`}
                  >
                    <span className="text-xl">{t.emoji}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-800">{t.label}</p>
                      <p className="text-xs text-gray-400">{t.note}</p>
                    </div>
                    {studyTime === t.value && <Check size={16} className="text-blue-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Navigation ───────────────────────────────────────────────── */}
          {saveError && (
            <p className="text-xs text-red-500 text-center mt-3 -mb-1">
              {saveError}
            </p>
          )}
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
                className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
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
