// client/src/pages/OnboardingPage.jsx
// Route: /onboarding  (redirect here after registration — students only)
//
// SELF-SERVICE LOCKDOWN: this used to be a 4-step flow where Step 1/2 let a
// student pick their own exam type and subjects, saved via PATCH
// /users/preferences. That endpoint had no guard against being called again
// after onboarding (this route is deliberately exempt from the
// onboarding-redirect check, since it IS the onboarding page), so a student
// could revisit /onboarding at any time and silently re-enroll themselves
// into any exam board or subject — bypassing the self-service lockdown
// applied everywhere else (POST /subjects, DELETE /subjects/:subjectId,
// POST /exam-types/:examTypeId/join all 403 a student in studentRoutes.js).
//
// Exam type / subject selection is removed from onboarding entirely to
// close that gap. Onboarding is now 2 steps — daily goal, then study
// schedule — and a school_admin or App Admin assigns the student's exam
// type and subjects afterward via POST
// /api/schools/students/:studentId/assign-exam-type (AssignExamTypeModal).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, ChevronRight, ChevronLeft, GraduationCap } from 'lucide-react';
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

const TOTAL_STEPS = 2;

export default function OnboardingPage() {
  const { updateUser } = useAuth();
  const navigate        = useNavigate();

  // 2-step flow: 1=goal, 2=schedule
  const [step, setStep] = useState(1);

  const [goal,      setGoal]      = useState(20);
  const [studyDays, setStudyDays] = useState([]);
  const [studyTime, setStudyTime] = useState('evening');
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── Save preferences and redirect to student dashboard ────────────────────
  const finish = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.patch('/users/preferences', {
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
      setSaveError(
        err?.message || 'Could not save your preferences. Please check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => setStep(s => s + 1);

  return (
    <div className="min-h-screen bg-[#0a4a3f] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        {/* 2-step progress dots */}
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

          {/* Exam type / subjects are assigned by your school or app admin —
              not chosen here. Shown once, above Step 1, so a new student
              isn't left wondering why onboarding never asks. */}
          <div className="flex items-start gap-2.5 mb-5 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <GraduationCap size={16} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 leading-relaxed">
              Your exam type and subjects will be assigned by your school or app administrator.
            </p>
          </div>

          {/* ── Step 1: Daily goal ────────────────────────────────────────── */}
          {step === 1 && (
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

          {/* ── Step 2: Study schedule ────────────────────────────────────── */}
          {step === 2 && (
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
                className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
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
