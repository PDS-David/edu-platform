// client/src/pages/LandingPage.jsx
// Full marketing landing page — no auth required.
// 8 sections: Hero, Stats, Challenges, Features, Subjects, Pricing Preview, Comparison, Footer

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Lightbulb, BookOpen, TrendingUp, BarChart3, PenTool,
  FileText, Check, X, Menu, ChevronRight,
  Mail, Phone, MapPin, Twitter, Facebook, Linkedin, Instagram,
  Volume2, Layers, Flame, Crown,
} from 'lucide-react';
import branding from '../config/branding';
import PublicNav from '../components/PublicNav';
import { SOVEREIGN, CRIMSON } from './em/constants';

// ── Data ───────────────────────────────────────────────────────────────────────

// Fallback shown immediately and while the live-stats fetch is in flight or
// if it fails. The two genuinely numeric entries (Practice Questions,
// Subjects) are overwritten with real platform counts once
// GET /api/catalog/stats resolves (X5 fix — these used to be permanently
// hardcoded and never reflected real growth). The two qualitative entries
// are feature callouts, not counts, and intentionally stay static.
//
// Label note: kept "Practice Questions" / "Subjects" rather than
// "Students" — confirmed via git history this was the genuinely live label
// before this fix, and total enrolled students is a materially different,
// more exposure-sensitive number to put on a public page before the
// platform has meaningful real usage to show (a later commit attempted to
// switch this to "Students" without that being part of what X5 asked for;
// reverted).
const STATS_FALLBACK = [
  { key: 'questions', number: '—', label: 'Practice Questions' },
  { key: 'subjects',  number: '—', label: 'Subjects'            },
  { key: 'marking',   number: 'AI',      label: 'Powered Marking'     },
  { key: 'grading',   number: 'Instant', label: 'Grade Prediction'    },
];

const CHALLENGES = [
  { emoji: '', title: 'No Exam Feedback',         desc: 'Students submit answers with zero explanation of what went wrong or how to improve.' },
  { emoji: '', title: 'Limited Practice Questions', desc: 'Reliable, curriculum-aligned question banks are scarce and scattered across the web.' },
  { emoji: '', title: 'No Performance Tracking',   desc: 'Neither students nor teachers have clear visibility into strengths, weaknesses, or trends.' },
  { emoji: '', title: 'Private Tuition Costs',      desc: 'Quality private tutoring can cost the equivalent of hundreds of dollars per month — out of reach for most families.' },
];

const FEATURES = [
  { icon: Lightbulb, colour: 'bg-amber-50 text-amber-500',   title: 'AI Hints',             desc: 'Get intelligent, step-by-step clues when stuck — without giving away the full answer.' },
  { icon: BookOpen,  colour: 'bg-blue-50 text-blue-500',      title: 'Instant Explanations', desc: 'Every question comes with a detailed marking scheme and AI-generated explanation after submission.' },
  { icon: TrendingUp,colour: 'bg-green-50 text-green-500',    title: 'Predicted Performance',      desc: 'Our model analyses your quiz history and predicts your likely exam grade in real time.' },
  { icon: BarChart3, colour: 'bg-indigo-50 text-indigo-500',  title: 'Cohort Analytics',     desc: 'Teachers see class-wide performance heatmaps, at-risk students, and AI intervention recommendations.' },
  { icon: PenTool,   colour: 'bg-purple-50 text-purple-500',  title: 'Quiz Builder',         desc: 'Build custom topic or mock exams from 200,000+ past-paper questions and assign to your class.' },
  { icon: FileText,  colour: 'bg-rose-50 text-rose-500',      title: 'Revision Notes',       desc: 'Curated, examiner-aligned notes for every subtopic — readable in the app or downloadable as PDF.' },
];

const SUBJECTS = [
  { emoji: '', name: 'Mathematics',         tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'Physics',             tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'Chemistry',           tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'Biology',             tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'English Language',    tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'Economics',           tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'Computer Science',    tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'Business Studies',    tag: 'IGCSE · GCSE · IB · SAT' },
  { emoji: '', name: 'Further Mathematics', tag: 'A-Level · IGCSE · IB'      },
  { emoji: '', name: 'Geography',           tag: 'IGCSE · GCSE · IB · SAT' },
];

const COMPARISON = [
  { feature: 'Curriculum-aligned questions', eac: true,  free: 'partial', tutor: 'partial' },
  { feature: 'AI hints & explanations',       eac: true,  free: false,     tutor: false      },
  { feature: 'Predicted grade',               eac: true,  free: false,     tutor: false      },
  { feature: 'Progress tracking',             eac: true,  free: false,     tutor: 'partial'  },
  { feature: 'Teacher cohort analytics',      eac: true,  free: false,     tutor: false      },
  { feature: 'Available 24/7',                eac: true,  free: true,      tutor: false      },
];

const EM_HIGHLIGHTS = [
  { icon: Volume2, title: 'Real Spoken Pronunciation',   desc: 'Hear every word spoken aloud clearly, then practise saying it back.' },
  { icon: Layers,  title: '6 Vocabulary Categories',     desc: 'From Everyday English to Idioms, Formal English, Slang, Pronunciation traps, and Spelling patterns.' },
  { icon: Flame,   title: 'Streaks & Progress Tracking', desc: 'Level up from Beginner to Advanced as your accuracy and practice streak grow.' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const CellIcon = ({ val }) => {
  if (val === true)      return <Check size={18} className="text-green-500 mx-auto" strokeWidth={2.5} />;
  if (val === false)     return <X     size={16} className="text-gray-300 mx-auto" />;
  return <span className="text-amber-400 text-xs font-semibold mx-auto block text-center">Partial</span>;
};

// ══════════════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState(STATS_FALLBACK);

  // X5 fix: replace the two genuinely-numeric placeholder entries with real
  // counts once available. Intentionally fails silently — a landing page's
  // stats strip is decorative, not critical; if this fetch fails for any
  // reason the fallback values above remain on screen, which is correct
  // behaviour, not a bug to surface to the visitor.
  useEffect(() => {
    api.get('/catalog/stats')
      .then((res) => {
        const data = res?.data || res;
        if (!data) return;
        setStats((prev) => prev.map((s) => {
          if (s.key === 'questions' && data.total_questions != null) {
            return { ...s, number: `${Number(data.total_questions).toLocaleString()}+` };
          }
          if (s.key === 'subjects' && data.total_subjects != null) {
            return { ...s, number: String(data.total_subjects) };
          }
          return s;
        }));
      })
      .catch(() => {}); // keep fallback on any failure
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <PublicNav
        right={
          <>
            {/* Desktop nav links */}
            <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-gray-600">
              {/* Just "Login" — there is one login now (getPostAuthRedirect
                  decides where an authenticated account goes, including a
                  chooser if it has both products). Previously this nav
                  named both AISchoolonair and English Masterclass directly,
                  and "Start Free" was a dropdown asking a visitor to pick a
                  product before they'd even logged in — exposing both
                  products to every visitor regardless of which one (if
                  either) they actually have reason to use. */}
              <Link to="/login" className="hover:text-blue-600 transition-colors">
                Login
              </Link>
              <Link to="/register"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors text-sm">
                Start Free
              </Link>
            </nav>
            {/* Mobile hamburger */}
            <button onClick={() => setMenuOpen(o => !o)} className="md:hidden p-2 text-gray-500 hover:text-gray-700">
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </>
        }
      >
        {/* Mobile menu — rendered inside the header via children */}
      </PublicNav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-b border-gray-100 px-4 py-4 space-y-3 sticky top-14 z-40">
          <Link to="/login" onClick={() => setMenuOpen(false)} className="block py-1 text-sm font-medium text-gray-700">
            Login
          </Link>
          <Link to="/register" onClick={() => setMenuOpen(false)}
            className="block text-center bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm">
            Start Free
          </Link>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          1. HERO
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#1e3a8a] pt-16 pb-20 px-4 overflow-hidden">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left */}
          <div className="text-white space-y-6">
            <span className="inline-block bg-white/15 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-wide uppercase">
               AI-Powered Smart Learning
            </span>
            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold leading-tight">
              Master your studies with AI powered learning
            </h1>
            <p className="text-blue-200 text-base sm:text-lg leading-relaxed max-w-lg">
              50,000+ curriculum-aligned questions, instant AI feedback, predicted performance insights, and progress tracking — designed to help students succeed worldwide.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/register"
                className="flex items-center justify-center gap-2 bg-white text-[#1e3a8a] font-bold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors shadow-lg text-sm">
                Start Free Today <ChevronRight size={16} />
              </Link>
              <a href="#features"
                className="flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors text-sm">
                See Features
              </a>
            </div>
            <p className="text-blue-300 text-xs">No credit card required · 5 free questions every day</p>
          </div>

          {/* Right — mock dashboard card */}
          <div className="flex justify-center lg:justify-end">
            <div className="bg-white rounded-2xl shadow-2xl w-72 p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-medium">Student Dashboard</p>
                  <p className="font-bold text-gray-900 text-sm">Mathematics</p>
                </div>
                <span className="bg-green-100 text-green-700 text-[11px] font-bold px-2 py-1 rounded-full">On Track </span>
              </div>

              {/* Fake donut chart */}
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  {/* Donut via SVG conic trick */}
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#6366f1" strokeWidth="4"
                      strokeDasharray="72 28" strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-extrabold text-gray-900">72%</span>
                    <span className="text-[9px] text-gray-400">Done</span>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  {[['Quizzes', '14/20', 'bg-indigo-500'], ['Videos', '8/12', 'bg-blue-500'], ['Notes', '6/6', 'bg-green-500']].map(([l, v, c]) => (
                    <div key={l}>
                      <div className="flex justify-between text-[11px] text-gray-500 mb-0.5"><span>{l}</span><span className="font-semibold text-gray-700">{v}</span></div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${c} rounded-full`} style={{ width: l === 'Quizzes' ? '70%' : l === 'Videos' ? '67%' : '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Predicted grade pill */}
              <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-2.5">
                <span className="text-xs font-medium text-indigo-700">Predicted Performance</span>
                <span className="text-base font-extrabold text-indigo-600">B+</span>
              </div>

              {/* Fake stat row */}
              <div className="grid grid-cols-2 gap-2">
                {[[' Score', '84%'], [' Streak', '7 days']].map(([l, v]) => (
                  <div key={l} className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                    <p className="text-[10px] text-gray-400">{l}</p>
                    <p className="text-sm font-bold text-gray-800">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          2. STATS BAR
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#1e3a8a] py-10 border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map(({ key, number, label }) => (
            <div key={key} className="space-y-1">
              <p className="text-3xl sm:text-4xl font-extrabold text-blue-300">{number}</p>
              <p className="text-sm text-white/60 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          3. CHALLENGES
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-900 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 text-xs font-bold uppercase tracking-widest text-center mb-2">The Problem</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10">
            Why Students Struggle to Reach Their Potential
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CHALLENGES.map(({ emoji, title, desc }) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 hover:bg-white/10 transition-colors">
                <div className="text-3xl">{emoji}</div>
                <h3 className="text-white font-bold text-sm leading-snug">{title}</h3>
                <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          4. FEATURES
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="features" className="bg-gray-50 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-600 text-xs font-bold uppercase tracking-widest text-center mb-2">Features</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-10">
            Everything You Need to Excel
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, colour, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colour}`}>
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-blue-600 text-xs font-bold uppercase tracking-widest text-center mb-2">How It Works</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-12">
            From signup to exam-ready in 3 steps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Register free',      desc: 'Create an account, choose your curriculum and subjects. Get 5 practice questions every day at no cost.',      icon: '' },
              { step: '02', title: 'Practice daily',     desc: 'Answer curriculum-aligned MCQs. Get instant AI explanations and marking-scheme feedback on every answer.',    icon: '' },
              { step: '03', title: 'Track & improve',    desc: 'See your weak topics, score trends, and predicted grade. Upgrade for unlimited practice and mock exams.',     icon: '' },
            ].map(({ step, title, desc, icon }) => (
              <div key={step} className="flex flex-col items-center text-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-3xl">
                    {icon}
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#1e3a8a] text-white text-[10px] font-black flex items-center justify-center">
                    {step}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed max-w-xs">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-10">
            <Link to="/register"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3.5 rounded-xl transition-colors shadow-md text-sm">
              Get Started Free <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          5. SUBJECT GRID
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="subjects" className="bg-gray-50 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-600 text-xs font-bold uppercase tracking-widest text-center mb-2">Subjects</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-10">
            Subjects Across Multiple Curricula
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {SUBJECTS.map(({ emoji, name, tag }) => (
              <Link key={name} to="/register"
                className="group flex flex-col items-center gap-2 bg-white hover:bg-blue-50 border border-gray-100 hover:border-blue-200
                  rounded-2xl px-3 py-4 text-center transition-all hover:shadow-sm">
                <span className="text-3xl group-hover:scale-110 transition-transform">{emoji}</span>
                <p className="text-gray-900 font-semibold text-xs leading-snug">{name}</p>
                <p className="text-gray-400 text-[10px] leading-tight">{tag}</p>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/register" className="inline-flex items-center gap-1.5 text-blue-600 font-semibold text-sm hover:underline">
              Start practising now <ChevronRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          5b. ENGLISH MASTERCLASS PROMO
      ══════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-16 px-4"
        style={{ background: `linear-gradient(135deg, ${SOVEREIGN[900]} 0%, ${SOVEREIGN[800]} 100%)` }}
      >
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">

          {/* Left — pitch */}
          <div className="text-white space-y-5">
            <span
              className="inline-flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-wide uppercase"
              style={{ background: CRIMSON[500] }}
            >
              <Crown size={12} /> New · English Fluency Training
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight">
              Master Languages with Language Masterclass
            </h2>
            <p className="text-sm sm:text-base leading-relaxed max-w-lg" style={{ color: SOVEREIGN[200] }}>
              A standalone vocabulary and pronunciation trainer built for non-native English
              learners — real spoken audio, AI-generated explanations, and progress tracking,
              separate from your exam practice.
            </p>

            <div className="grid sm:grid-cols-1 gap-3 pt-1">
              {EM_HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${SOVEREIGN[500]}33` }}
                  >
                    <Icon size={16} style={{ color: SOVEREIGN[300] }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">{title}</p>
                    <p className="text-xs" style={{ color: SOVEREIGN[200] }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link to="/em/signup"
              className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-colors shadow-lg text-sm"
              style={{ background: CRIMSON[500], color: '#ffffff' }}
            >
              Explore Language Masterclass <ChevronRight size={16} />
            </Link>
            <p className="text-xs" style={{ color: SOVEREIGN[300] }}>
              Its own account, its own registration — no AISchoolonair account needed.
            </p>
          </div>

          {/* Right — mock word-practice card */}
          <div className="flex justify-center lg:justify-end">
            <div className="bg-white rounded-2xl shadow-2xl w-72 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Everyday English</span>
                <span
                  className="text-[11px] font-bold px-2 py-1 rounded-full text-white"
                  style={{ background: CRIMSON[500] }}
                >
                  🔊 Audio
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: SOVEREIGN[50] }}>
                <div>
                  <p className="font-bold text-gray-900 text-lg">fortnight</p>
                  <p className="text-xs text-gray-400">/ˈfɔːtnaɪt/</p>
                </div>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: SOVEREIGN[700] }}
                >
                  <Volume2 size={16} className="text-white" />
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                A period of two weeks — <span className="italic">"I shall return in a fortnight."</span>
              </p>

              <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: `${CRIMSON[500]}12` }}>
                <span className="text-xs font-medium" style={{ color: CRIMSON[600] }}>Practice Streak</span>
                <span className="text-base font-extrabold" style={{ color: CRIMSON[600] }}>🔥 7 days</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          6. PRICING TEASER (MVP — pricing not yet live)
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-blue-600 text-xs font-bold uppercase tracking-widest mb-2">Access</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4">
            Free During Launch
          </h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            AISchoolonair is currently free for all students during our launch period.
            Create an account today and start practising — no payment required.
          </p>
          <Link to="/register"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm shadow-md">
            Start Free Today <ChevronRight size={15} />
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TESTIMONIALS      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-600 text-xs font-bold uppercase tracking-widest text-center mb-2">Student Stories</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-10">
            What students are saying
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { name: 'Adaeze O.', school: 'International Secondary School', quote: 'I was scoring 40% in Chemistry. After 3 weeks on AISchoolonair my mock score jumped to 74%. The AI explanations make concepts click in a way textbooks never did.' },
              { name: 'Emeka T.', school: 'Cambridge International School', quote: 'The daily streak feature keeps me consistent. I\'ve completed 5 questions every day for 6 weeks. My exams are in 2 months and I feel ready for the first time.' },
              { name: 'Fatima A.', school: 'Global Academy', quote: 'Finding quality past papers used to be difficult. AISchoolonair has everything in one place with instant marking. My teacher even uses it to set class assignments.' },
            ].map(({ name, school, quote }) => (
              <div key={name} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 shadow-sm">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-amber-400 text-xs"></span>
                  ))}
                </div>
                <p className="text-gray-700 text-xs leading-relaxed italic">"{quote}"</p>
                <div>
                  <p className="text-gray-900 font-semibold text-xs">{name}</p>
                  <p className="text-gray-400 text-[10px]">{school}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          7. COMPARISON TABLE
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-blue-600 text-xs font-bold uppercase tracking-widest text-center mb-2">Why AISchoolonair</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-10">
            How We Compare
          </h2>

          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-4 text-xs font-semibold text-gray-500 w-1/2">Feature</th>
                  <th className="px-4 py-4 text-center">
                    <span className="inline-block bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">AISchoolonair</span>
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500">Free Websites</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500">Private Tutor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {COMPARISON.map(({ feature, eac, free, tutor }) => (
                  <tr key={feature} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-gray-700 text-xs font-medium">{feature}</td>
                    <td className="px-4 py-3.5 text-center bg-blue-50/40"><CellIcon val={eac} /></td>
                    <td className="px-4 py-3.5 text-center"><CellIcon val={free} /></td>
                    <td className="px-4 py-3.5 text-center"><CellIcon val={tutor} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-center mt-8">
            <Link to="/register"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3.5 rounded-xl transition-colors shadow-lg text-sm">
              Start Free Today <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          8. FOOTER
      ══════════════════════════════════════════════════════════════════════ */}
      <footer className="bg-gray-900 text-gray-400 pt-12 pb-6 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">

          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <img src="/logo.svg" alt="AISchoolonair" className="w-6 h-6" />
              <span className="font-bold text-white text-base">AISchoolonair</span>
              <span className="w-px h-5 bg-white/20 shrink-0" />
              <img src="/eac_logo.png" alt="EAC" className="h-6 w-auto object-contain brightness-200" style={{maxWidth:'52px'}} />
              <span className="hidden sm:block w-px h-5 bg-white/20 shrink-0" />
              <img src="/lessonteacher_logo.jpg" alt="LessonTeacher" className="hidden sm:block h-5 w-auto object-contain brightness-200" style={{maxWidth:'70px'}} />
            </div>
            <p className="text-xs leading-relaxed">{branding.tagline}</p>
            <div className="flex gap-3 pt-1">
              {[
                { href: branding.social.twitter,   Icon: Twitter   },
                { href: branding.social.facebook,  Icon: Facebook  },
                { href: branding.social.linkedin,  Icon: Linkedin  },
                { href: branding.social.instagram, Icon: Instagram },
              ].filter(({ href }) => href).map(({ href, Icon }) => (
                <a key={href} href={href} target="_blank" rel="noreferrer"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-blue-600 flex items-center justify-center transition-colors">
                  <Icon size={14} className="text-white" />
                </a>
              ))}
            </div>
          </div>

          {/* Platform links */}
          <div>
            <p className="text-white text-xs font-bold uppercase tracking-wider mb-3">Platform</p>
            <ul className="space-y-2">
              {[['Language Masterclass', '/english-masterclass'], ['Subjects', '/subjects'], ['Register', '/register'], ['Login', '/login']].map(([l, h]) => (
                <li key={l}><Link to={h} className="text-xs hover:text-white transition-colors">{l}</Link></li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-white text-xs font-bold uppercase tracking-wider mb-3">Legal</p>
            <ul className="space-y-2">
              {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']].map(([l, h]) => (
                <li key={l}><Link to={h} className="text-xs hover:text-white transition-colors">{l}</Link></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white text-xs font-bold uppercase tracking-wider mb-3">Contact</p>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2 text-xs">
                <Mail size={12} className="text-blue-400 shrink-0" />
                <a href={`mailto:${branding.contact.email}`} className="hover:text-white transition-colors">{branding.contact.email}</a>
              </li>
              {branding.contact.phones.slice(0, 2).map(p => (
                <li key={p} className="flex items-center gap-2 text-xs">
                  <Phone size={12} className="text-blue-400 shrink-0" />
                  <a href={`tel:${p.replace(/\s/g,'')}`} className="hover:text-white transition-colors">{p}</a>
                </li>
              ))}
              <li className="flex items-center gap-2 text-xs">
                <MapPin size={12} className="text-blue-400 shrink-0" />
                <span>{branding.contact.address}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} {branding.platformName}. All rights reserved. · Powered by {branding.poweredByShort}
        </div>
      </footer>

    </div>
  );
}
