// client/src/pages/OnboardingPage.jsx
// Route: /onboarding  (redirect here after registration – students only)
//
// CHANGE v3.0 – Exam type is now the FIRST onboarding step, not something
// silently inferred from registration.
//   4-step flow:
//     Step 1 → Choose exam type
//     Step 2 → Select subjects
//              For exam types where every "subject" is really a compulsory
//              section of one fixed test (IELTS, TOEFL, SAT — see
//              REQUIRES_ALL_SUBJECTS below), there is nothing to pick: this
//              step instead shows a read-only confirmation of exactly what
//              the student will be studying, before the dashboard ever loads.
//     Step 3 → Daily goal
//     Step 4 → Study schedule
//
//   Registration still records a curriculum choice (pending_exam_board_ids),
//   so it's used to pre-select a sensible default on Step 1 — but the
//   student's real, final choice (and the subjects it produces) is made and
//   shown here, inside onboarding, not assumed from a form filled in earlier.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../hooks/useCatalog';
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

// S4: per-exam-type subject limits enforced at selection time.
// JAMB/UTME → 4, WAEC/NECO → 9, JUPEB → 4, others → 10 (generous fallback)
const ONBOARDING_LIMITS = { JAMB: 4, UTME: 4, WAEC: 9, NECO: 9, JUPEB: 4 };

// Exam types where the "subjects" under them are really the fixed, compulsory
// sections of a single test — e.g. IELTS = Listening/Reading/Writing/Speaking,
// TOEFL = Reading/Listening/Speaking/Writing, SAT = Reading&Writing/Math.
// There is no picking involved: every section is required, so onboarding
// skips the picker and simply confirms what the student will be studying.
// Unlike JAMB/WAEC/JUPEB above, adding a board here means "show all, pick none".
const REQUIRES_ALL_SUBJECTS = ['IELTS', 'TOEFL', 'SAT'];

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const { user, updateUser } = useAuth();
  const navigate             = useNavigate();
  const { examTypes, loadingTypes, fetchSubjectsForType } = useCatalog();

  // 4-step flow: 1=exam type, 2=subjects, 3=goal, 4=schedule
  const [step, setStep] = useState(1);

  // Step 1: exam type
  const [selectedBoard, setSelectedBoard]           = useState(null); // full board object
  const [loadingSubjectsFor, setLoadingSubjectsFor]  = useState(false);
  const [loadError, setLoadError]                   = useState('');

  // Step 2: subjects
  const [allSubs,  setAllSubs]  = useState([]);
  const [subjects, setSubjects] = useState([]); // selected subject IDs

  // Goal & schedule
  const [goal,      setGoal]      = useState(20);
  const [studyDays, setStudyDays] = useState([]);
  const [studyTime, setStudyTime] = useState('evening');
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── Pre-select a default exam type from registration, if one was chosen ──
  // Convenience only — the student still confirms (or changes) it on Step 1.
  useEffect(() => {
    if (selectedBoard || loadingTypes || examTypes.length === 0) return;
    const pendingIds = user?.pending_exam_board_ids || [];
    if (pendingIds.length > 0) {
      const match = examTypes.find(b => String(b.id) === String(pendingIds[0]));
      if (match) setSelectedBoard(match);
    }
  }, [loadingTypes, examTypes]); // eslint-disable-line

  const requiresAllSubjects = useMemo(
    () => !!selectedBoard && REQUIRES_ALL_SUBJECTS.includes(String(selectedBoard.code).toUpperCase()),
    [selectedBoard]
  );

  // Only actually show the "you'll be taking all of these" confirmation once
  // we've confirmed there ARE subjects to show — an exam type flagged above
  // with no subjects seeded yet falls back to the normal picker (which shows
  // its own "no subjects found" message) instead of confirming an empty list.
  const showConfirmation = requiresAllSubjects && allSubs.length > 0;

  const subjectLimit = useMemo(() => {
    if (!selectedBoard) return 10;
    if (requiresAllSubjects) return allSubs.length || 10;
    return ONBOARDING_LIMITS[String(selectedBoard.code).toUpperCase()] ?? 10;
  }, [selectedBoard, requiresAllSubjects, allSubs.length]);

  // ── Advance from Step 1 → Step 2: fetch subjects for the chosen exam type ──
  const goToSubjects = async () => {
    if (!selectedBoard) return;
    setLoadingSubjectsFor(true);
    setLoadError('');
    try {
      const subs = await fetchSubjectsForType(selectedBoard.id);
      setAllSubs(subs);

      if (subs.length > 0 && REQUIRES_ALL_SUBJECTS.includes(String(selectedBoard.code).toUpperCase())) {
        // Every subject is compulsory for this exam type — pre-select all of
        // them; Step 2 below just confirms this to the student.
        setSubjects(subs.map(s => s.id));
      } else {
        setSubjects([]);
      }
      setStep(2);
    } catch {
      setLoadError('Could not load subjects for that exam type. Please try again.');
    } finally {
      setLoadingSubjectsFor(false);
    }
  };

  const toggleSubject = (id) => {
    if (showConfirmation) return; // nothing to toggle — every subject is required
    if (subjects.includes(id)) {
      setSubjects(prev => prev.filter(s => s !== id));
    } else {
      if (subjects.length >= subjectLimit) return;
      setSubjects(prev => [...prev, id]);
    }
  };

  // ── Save preferences and redirect to student dashboard ────────────────────
  const finish = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch('/users/preferences', {
        exam_boards:          selectedBoard ? [selectedBoard.id] : [],
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
    step === 1 ? !!selectedBoard :
    step === 2 ? subjects.length > 0 :
    true;

  const handleNext = () => {
    if (step === 1) { goToSubjects(); return; }
    setStep(s => s + 1);
  };

  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        {/* 4-step progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
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

          {/* ── Step 1: Choose exam type ─────────────────────────────────── */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">What are you preparing for?</h2>
              <p className="text-sm text-gray-500 mb-4">
                This decides which subjects you'll see next.
              </p>

              {loadingTypes ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="text-blue-400 animate-spin" />
                </div>
              ) : examTypes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No exam types found. Please contact support.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto">
                  {examTypes.map(b => {
                    const sel = selectedBoard?.id === b.id;
                    const isAllRequired = REQUIRES_ALL_SUBJECTS.includes(String(b.code).toUpperCase());
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBoard(b)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          sel ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <span className="text-lg">{b.icon_emoji || ''}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${sel ? 'text-blue-700' : 'text-gray-700'}`}>
                            {b.name}
                          </p>
                          {b.subject_count > 0 && (
                            <p className="text-xs text-gray-400">
                              {isAllRequired
                                ? `${b.subject_count} compulsory section${b.subject_count === 1 ? '' : 's'}`
                                : `${b.subject_count} subjects available`}
                            </p>
                          )}
                        </div>
                        {sel && <Check size={16} className="text-blue-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {loadError && (
                <p className="text-xs text-red-500 mt-3">{loadError}</p>
              )}
            </>
          )}

          {/* ── Step 2: Subjects (picker, or confirmation for fixed exams) ── */}
          {step === 2 && showConfirmation && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Here's what you'll be studying</h2>
              <p className="text-sm text-gray-500 mb-4">
                {selectedBoard?.name} is a fixed set of sections — you'll be taking all {allSubs.length} of them.
              </p>
              <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto">
                {allSubs.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-xl border-2 border-blue-500 bg-blue-50"
                  >
                    <span className="text-lg">{s.icon_emoji || ''}</span>
                    <p className="text-sm font-semibold text-blue-700 flex-1">{s.name}</p>
                    <Check size={16} className="text-blue-500 shrink-0" />
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 2 && !showConfirmation && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Select your subjects</h2>
              <p className="text-sm text-gray-500 mb-1">Pick your subjects — 14-day free trial, full access</p>
              <p className="text-xs text-blue-600 font-medium mb-4">{subjects.length} selected</p>

              {allSubs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No subjects found for this exam type. Please contact support.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                  {allSubs.map(s => {
                    const sel    = subjects.includes(s.id);
                    const locked = !sel && subjects.length >= subjectLimit;
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

              {subjects.length >= subjectLimit && (
                <p className="text-xs text-amber-600 mt-2">Maximum {subjectLimit} subjects selected for your exam type</p>
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

            {step < TOTAL_STEPS ? (
              <button
                onClick={handleNext}
                disabled={!canNext || (step === 1 && loadingSubjectsFor)}
                className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                {step === 1 && loadingSubjectsFor
                  ? <><Loader2 size={13} className="animate-spin" /> Loading…</>
                  : <>Next <ChevronRight size={14} /></>
                }
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
