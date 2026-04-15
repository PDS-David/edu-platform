// client/src/pages/StudentDashboard.jsx
// AI Buddy-style student dashboard:
// - Top nav (TopNav component)
// - "Hi, [Name] " header
// - Curriculum dropdown (only boards student selected)
// - Resources tab + My Performance tab
// - Shows only student's enrolled subjects + class-assigned subjects
// - "Add More Subjects" button to expand subject selection
//
// FIX v2.0:
//   - Board dropdown now shows ONLY the student's registered exam boards
//     (from student_exam_types), not all boards in the DB.
//   - Subject grid shows ONLY subjects the student selected during onboarding
//     or that were assigned to their class — via GET /api/students/my-subjects.
//   - Added "Add More Subjects" modal that lists all subjects for the student's
//     board(s) and lets them enrol in new ones via POST /api/students/subjects.
//   - Class-assigned subjects are shown with a badge indicating which class.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ChevronLeft, ChevronRight,
  Loader2, ArrowRight, TrendingUp, TrendingDown,
  Users, X, Plus, BookOpen,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import GamificationBar from '../components/GamificationBar';
import api from '../services/api';

// ─── Subject icon map ─────────────────────────────────────────────────────────
const SUBJECT_ICONS = {
  'Biology':          { icon: '', bg: '#DCFCE7', color: '#16A34A' },
  'Chemistry':        { icon: '',  bg: '#FEF9C3', color: '#CA8A04' },
  'Physics':          { icon: '',  bg: '#DBEAFE', color: '#2563EB' },
  'Mathematics':      { icon: '',  bg: '#EDE9FE', color: '#7C3AED' },
  'English Language': { icon: '',  bg: '#FCE7F3', color: '#DB2777' },
  'English':          { icon: '',  bg: '#FCE7F3', color: '#DB2777' },
  'Economics':        { icon: '',  bg: '#FFEDD5', color: '#EA580C' },
  'Business Studies': { icon: '',  bg: '#FEF3C7', color: '#D97706' },
  'Computer Science': { icon: '',  bg: '#CFFAFE', color: '#0891B2' },
  'Geography':        { icon: '',  bg: '#D1FAE5', color: '#059669' },
  'History':          { icon: '',  bg: '#FEE2E2', color: '#DC2626' },
  'Government':       { icon: '',  bg: '#E0E7FF', color: '#4338CA' },
  'Literature':       { icon: '',  bg: '#FDF2F8', color: '#9333EA' },
  'Accounting':       { icon: '',  bg: '#ECFDF5', color: '#10B981' },
  'Agriculture':      { icon: '',  bg: '#FEF9C3', color: '#65A30D' },
  'French':           { icon: '',  bg: '#EFF6FF', color: '#3B82F6' },
  'default':          { icon: '',  bg: '#EFF6FF', color: '#14B8A6' },
};

const getSubjectIcon = (name) => {
  if (!name) return SUBJECT_ICONS.default;
  const key = Object.keys(SUBJECT_ICONS).find(k =>
    name.toLowerCase().includes(k.toLowerCase())
  );
  return SUBJECT_ICONS[key] || SUBJECT_ICONS.default;
};

const PALETTES = [
  { bg: '#EFF6FF', color: '#3B82F6' },
  { bg: '#F0FDF4', color: '#22C55E' },
  { bg: '#FFF7ED', color: '#F97316' },
  { bg: '#FAF5FF', color: '#A855F7' },
  { bg: '#FDF2F8', color: '#EC4899' },
  { bg: '#F0FDFA', color: '#14B8A6' },
  { bg: '#FEF2F2', color: '#EF4444' },
  { bg: '#EEF2FF', color: '#6366F1' },
];

// ─── SVG Donut Chart ──────────────────────────────────────────────────────────
function DonutChart({ pct = 0 }) {
  const r    = 52;
  const circ = 2 * Math.PI * r;
  const fill = circ * (pct / 100);
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#E5E7EB" strokeWidth="12" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="#14B8A6" strokeWidth="12"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-teal-600">{pct}%</span>
        <span className="text-[10px] text-gray-400">completed</span>
      </div>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ studyDates = [] }) {
  const now        = new Date();
  const year       = now.getFullYear();
  const month      = now.getMonth();
  const today      = now.getDate();
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const cells  = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-purple-700">{MONTHS[month]} {year}</span>
        <div className="flex gap-1">
          <button className="text-purple-400 hover:text-purple-600"><ChevronLeft size={12} /></button>
          <button className="text-purple-400 hover:text-purple-600"><ChevronRight size={12} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAYS.map(d => <div key={d} className="text-[9px] text-purple-400 text-center font-medium">{d[0]}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => (
          <div key={i} className={`text-[10px] text-center w-5 h-5 rounded-full flex items-center justify-center mx-auto
            ${d === today ? 'bg-teal-500 text-white font-bold' : ''}
            ${d && studyDates.includes(d) && d !== today ? 'bg-teal-100 text-teal-600' : ''}
            ${d && d !== today && !studyDates.includes(d) ? 'text-purple-700' : ''}
            ${!d ? '' : 'cursor-pointer hover:bg-purple-100'}`}>
            {d || ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Performance Table ────────────────────────────────────────────────────────
function PerfTable({ rows, emptyMsg }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-gray-400 py-4 text-center">{emptyMsg}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th className="text-left py-2 font-medium">Sub-topic</th>
            <th className="text-center py-2 font-medium">Completion</th>
            <th className="text-center py-2 font-medium">Score (Avg)</th>
            <th className="text-center py-2 font-medium">No. Of Attempt</th>
            <th className="text-center py-2 font-medium">Last Attempt</th>
            <th className="text-center py-2 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 font-medium text-gray-700">{row.name}</td>
              <td className="py-2 text-center text-gray-500">{row.completion || '—'}</td>
              <td className="py-2 text-center font-semibold text-gray-700">{row.score_avg ? `${Math.round(row.score_avg)}%` : '—'}</td>
              <td className="py-2 text-center text-gray-500">{row.attempts || 0}</td>
              <td className="py-2 text-center text-gray-400">
                {row.last_attempt ? new Date(row.last_attempt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
              </td>
              <td className="py-2 text-center">
                {row.trend === 'up'   && <TrendingUp   size={14} className="text-green-500 mx-auto" />}
                {row.trend === 'down' && <TrendingDown size={14} className="text-red-400  mx-auto" />}
                {!row.trend           && <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ── Board state — only boards the student is enrolled in ──────────────────
  const [boards,          setBoards]          = useState([]);
  const [selectedBoard,   setSelectedBoard]   = useState(null);
  const [boardDropOpen,   setBoardDropOpen]   = useState(false);

  // ── Subject state — student's own + class-assigned subjects ───────────────
  const [mySubjects,      setMySubjects]      = useState([]);   // full unfiltered list
  const [subjects,        setSubjects]        = useState([]);   // filtered by selectedBoard
  const [loading,         setLoading]         = useState(true);

  // ── "Add More Subjects" modal ─────────────────────────────────────────────
  const [addModal,        setAddModal]        = useState(false);
  const [availableSubs,   setAvailableSubs]   = useState([]);
  const [addLoading,      setAddLoading]      = useState(false);
  const [addingSub,       setAddingSub]       = useState(null); // id being added

  const [whatNext,        setWhatNext]        = useState(null);
  const [activeTab,       setActiveTab]       = useState('resources');

  const [allSubjects,     setAllSubjects]     = useState([]);
  const [selectedPerfSub, setSelectedPerfSub] = useState(null);
  const [perfDropOpen,    setPerfDropOpen]    = useState(false);
  const [summaryData,     setSummaryData]     = useState(null);
  const [calMode,         setCalMode]         = useState('Day');
  const [strengthRows,    setStrengthRows]    = useState([]);
  const [weaknessRows,    setWeaknessRows]    = useState([]);
  const [perfLoading,     setPerfLoading]     = useState(false);
  const [studyDates,      setStudyDates]      = useState([]);

  const [joinModal,  setJoinModal]  = useState(false);
  const [joinCode,   setJoinCode]   = useState('');
  const [joining,    setJoining]    = useState(false);
  const [joinMsg,    setJoinMsg]    = useState(null);

  const firstName = user?.firstName || user?.first_name || 'Student';

  // ── Join class handler ─────────────────────────────────────────────────────
  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      const res = await api.post('/students/join-class', {
        join_code: joinCode.trim().toUpperCase(),
      });
      setJoinMsg({ type: 'success', text: `Joined "${res.class_name || res.data?.class_name}"!` });
      setJoinCode('');
      // Reload subjects to pick up class-assigned ones
      loadMySubjects();
      setTimeout(() => { setJoinModal(false); setJoinMsg(null); }, 2000);
    } catch (err) {
      setJoinMsg({ type: 'error', text: err.error || 'Invalid code. Try again.' });
    } finally {
      setJoining(false);
    }
  };

  // ── Load student's own boards (from student_exam_types) ───────────────────
  useEffect(() => {
    api.get('/students/my-boards')
      .then(r => {
        const list = r.data || [];
        setBoards(list);
        if (list.length > 0) setSelectedBoard(list[0]);
      })
      .catch(() => {
        // Fallback: load all boards if endpoint fails (e.g. no rows yet)
        api.get('/exam-boards')
          .then(r => {
            const list = r.data || [];
            setBoards(list);
            if (list.length > 0) setSelectedBoard(list[0]);
          })
          .catch(() => {});
      });
  }, []);

  // ── Load student's subjects (own + class-assigned) ────────────────────────
  const loadMySubjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r    = await api.get('/students/my-subjects');
      const list = (r.data || []).map((s, i) => ({
        ...s,
        palette: PALETTES[i % PALETTES.length],
      }));
      setMySubjects(list);

      // Fetch progress for each subject
      const progressResults = await Promise.allSettled(
        list.map(s =>
          api.get('/subtopics/progress-summary', {
            params: { student_id: user.id, subject_id: s.id },
          })
        )
      );
      const withProgress = list.map((s, i) => ({
        ...s,
        completion_pct: progressResults[i].status === 'fulfilled'
          ? (progressResults[i].value.data?.completion_pct || 0) : 0,
        subtopic_count: progressResults[i].status === 'fulfilled'
          ? (progressResults[i].value.data?.total_subtopics || s.subtopic_count || 0)
          : (s.subtopic_count || 0),
        topics_completed: progressResults[i].status === 'fulfilled'
          ? (progressResults[i].value.data?.completed_subtopics || 0) : 0,
      }));
      setMySubjects(withProgress);
      setAllSubjects(withProgress);
      if (withProgress.length > 0 && !selectedPerfSub) setSelectedPerfSub(withProgress[0]);
    } catch {
      // If my-subjects fails (no student_subjects rows yet), fall back to board-filtered subjects
    } finally {
      setLoading(false);
    }
  }, [user]); // eslint-disable-line

  useEffect(() => { loadMySubjects(); }, [loadMySubjects]);

  // ── Filter visible subjects by selectedBoard ──────────────────────────────
  useEffect(() => {
    if (!selectedBoard) {
      setSubjects(mySubjects);
      return;
    }
    // Show subjects whose exam_board_id matches selectedBoard,
    // OR subjects from class (class_name present) regardless of board
    const filtered = mySubjects.filter(s =>
      s.exam_board_id === selectedBoard.id ||
      String(s.exam_board_id) === String(selectedBoard.id) ||
      s.source === 'class'
    );
    // If nothing matches (e.g. board has no saved subjects yet), show all
    setSubjects(filtered.length > 0 ? filtered : mySubjects);
    setAllSubjects(filtered.length > 0 ? filtered : mySubjects);
    if (filtered.length > 0 && !selectedPerfSub) setSelectedPerfSub(filtered[0]);
  }, [selectedBoard, mySubjects]); // eslint-disable-line

  // ── Load "What's Next" ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    api.get('/subtopics/next', { params: { student_id: user.id } })
      .then(r => { if (r.success && r.data) setWhatNext(r.data); })
      .catch(() => {});
  }, [user]);

  // ── Load performance summary + study calendar ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    api.get(`/analytics/student/${user.id}/summary`)
      .then(r => { if (r.success) setSummaryData(r.data); })
      .catch(() => {});

    api.get('/analytics/daily-study')
      .then(r => {
        if (r.success && r.data) {
          const now = new Date();
          const days = (r.data || [])
            .filter(d => {
              const date = new Date(d.study_date || d);
              return date.getMonth() === now.getMonth() &&
                     date.getFullYear() === now.getFullYear();
            })
            .map(d => new Date(d.study_date || d).getDate());
          setStudyDates(days);
        }
      })
      .catch(() => {});
  }, [user]);

  // ── Load topic performance when subject selected ───────────────────────────
  useEffect(() => {
    if (!selectedPerfSub || !user) return;
    setPerfLoading(true);
    api.get(`/analytics/student/${user.id}/topics`, {
      params: { subject_id: selectedPerfSub.id },
    })
      .then(r => {
        if (r.success) {
          const topics = r.data || [];
          const strength = topics
            .filter(t => t.accuracy_pct >= 70)
            .sort((a, b) => b.accuracy_pct - a.accuracy_pct)
            .map(t => ({
              name:         t.topic,
              score_avg:    t.accuracy_pct,
              attempts:     t.attempt_count,
              last_attempt: null,
              trend:        t.accuracy_pct >= 75 ? 'up' : null,
            }));
          const weakness = topics
            .filter(t => t.accuracy_pct < 50)
            .sort((a, b) => a.accuracy_pct - b.accuracy_pct)
            .map(t => ({
              name:         t.topic,
              score_avg:    t.accuracy_pct,
              attempts:     t.attempt_count,
              last_attempt: null,
              trend:        t.accuracy_pct < 30 ? 'down' : null,
            }));
          setStrengthRows(strength);
          setWeaknessRows(weakness);
        }
      })
      .catch(() => {})
      .finally(() => setPerfLoading(false));
  }, [selectedPerfSub, user]);

  // ── Open "Add More Subjects" — load available subjects for student's boards ─
  const openAddModal = async () => {
    setAddModal(true);
    setAddLoading(true);
    try {
      // Load all subjects for the student's board(s)
      const boardIds = boards.map(b => b.id);
      let all = [];
      if (boardIds.length > 0) {
        const results = await Promise.all(
          boardIds.map(id =>
            api.get('/subjects', { params: { exam_board_id: id } })
              .then(r => r.data || [])
              .catch(() => [])
          )
        );
        all = results.flat();
      } else {
        const r = await api.get('/subjects');
        all = r.data || [];
      }
      // Deduplicate by name, exclude already enrolled
      const enrolledIds = new Set(mySubjects.map(s => s.id));
      const byName = new Map();
      all.forEach(s => { if (!byName.has(s.name)) byName.set(s.name, s); });
      setAvailableSubs([...byName.values()].filter(s => !enrolledIds.has(s.id)));
    } catch {
      setAvailableSubs([]);
    } finally {
      setAddLoading(false);
    }
  };

  // ── Add a subject ─────────────────────────────────────────────────────────
  const handleAddSubject = async (subject) => {
    setAddingSub(subject.id);
    try {
      await api.post('/students/subjects', { subject_id: subject.id });
      // Remove from available list, reload my subjects
      setAvailableSubs(prev => prev.filter(s => s.id !== subject.id));
      await loadMySubjects();
    } catch {
      // fail silently — user can retry
    } finally {
      setAddingSub(null);
    }
  };

  const totalSubtopics = selectedPerfSub?.subtopic_count || 50;
  const completedSubs  = summaryData?.quizzes_completed  || 0;
  const perfPct        = totalSubtopics > 0 ? Math.min(Math.round((completedSubs / totalSubtopics) * 100), 100) : 0;
  const perfMins       = summaryData?.time_spent_minutes || 0;
  const perfSecs       = summaryData?.time_spent_seconds || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <TopNav />

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Hi, {firstName} </h1>
            <p className="text-sm text-gray-400 mt-0.5">Welcome back! Let's make progress together today. </p>
          </div>

          {/* Curriculum dropdown — shows only boards the student is enrolled in */}
          <div className="relative shrink-0">
            <button
              onClick={() => setBoardDropOpen(o => !o)}
              className="flex items-center gap-2 bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              {selectedBoard?.icon_emoji || ''} {selectedBoard?.name || 'My Curriculum'}
              <ChevronDown size={13} />
            </button>
            {boardDropOpen && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-40 min-w-[220px] max-h-64 overflow-y-auto">
                {boards.length === 0 ? (
                  <p className="text-xs text-gray-400 px-4 py-3">No exam types enrolled yet.</p>
                ) : (
                  boards.map(b => (
                    <button
                      key={b.id}
                      onClick={() => { setSelectedBoard(b); setBoardDropOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${selectedBoard?.id === b.id ? 'font-semibold text-teal-600' : 'text-gray-700'}`}
                    >
                      <span>{b.icon_emoji || ''}</span> {b.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-5">
          {['resources', 'my_performance'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-teal-500 text-teal-600 font-semibold'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'resources' ? 'Resources' : 'My Performance'}
            </button>
          ))}
        </div>

        {/* ══ RESOURCES TAB ══ */}
        {activeTab === 'resources' && (
          <>
            {/* Continue Learning */}
            <section className="mb-5">
              <h2 className="text-sm font-bold text-gray-900 mb-0.5">Continue Learning</h2>
              <p className="text-xs text-gray-400 mb-3">Pick up where you left off</p>
              {whatNext ? (
                <>
                  <p className="text-[11px] text-gray-400 mb-1 underline font-medium">What's Next</p>
                  <p className="text-[11px] text-gray-400 mb-2">
                    {whatNext.subject_name} › {whatNext.topic_name} › {whatNext.subtopic_name}
                  </p>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: PALETTES[0].bg }}>
                      {getSubjectIcon(whatNext.subject_name).icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{whatNext.subtopic_name}</p>
                      <p className="text-xs text-gray-400">Completed: {whatNext.completion_pct}%</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                        <span>Resources · {whatNext.resources_completed ? '1' : '0'}</span>
                        <span>·</span>
                        <span>Practice Questions · {whatNext.practice_completed ? '1' : '0'}</span>
                        <span>·</span>
                        <span>Quiz · {whatNext.quiz_completed ? '1' : '0'}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/student/subtopic/${whatNext.subtopic_id}`)}
                      className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
                    >
                      <ArrowRight size={13} /> Continue
                    </button>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center shadow-sm">
                  <div className="text-3xl mb-2"></div>
                  <p className="text-sm text-gray-500">No subjects available yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Select a curriculum above to get started.</p>
                </div>
              )}
            </section>

            {/* All Subjects */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">My Subjects</h2>
                  <p className="text-xs text-gray-400">
                    {selectedBoard?.name || 'Your curriculum'} &nbsp;·&nbsp; Track your progress across subjects
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={openAddModal}
                    className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={11} /> Add Subjects
                  </button>
                  <button
                    onClick={() => navigate('/student/mark-image')}
                    className="flex items-center gap-1.5 bg-gray-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors relative"
                  >
                    Upload Answer
                    <span className="absolute -top-1.5 -right-1.5 bg-teal-500 text-white text-[8px] font-bold px-1 rounded-full">New</span>
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                </div>
              ) : subjects.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm">
                  <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-500">No subjects yet</p>
                  <p className="text-xs text-gray-400 mt-1 mb-4">Add subjects to start learning</p>
                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    <Plus size={13} /> Add Your First Subject
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {subjects.map((subject, idx) => {
                    const subIcon = getSubjectIcon(subject.name);
                    return (
                      <button
                        key={subject.id || idx}
                        onClick={() => navigate(`/student/subject/${subject.id}`)}
                        className="bg-white border border-gray-100 rounded-2xl p-3 text-left hover:shadow-md hover:border-teal-100 transition-all relative"
                      >
                        {subject.source === 'class' && (
                          <span className="absolute top-2 right-2 text-[8px] bg-purple-100 text-purple-600 font-bold px-1.5 py-0.5 rounded-full">
                            Class
                          </span>
                        )}
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-2"
                          style={{ backgroundColor: subIcon.bg }}>
                          {subIcon.icon}
                        </div>
                        <p className="text-xs font-bold text-gray-800 leading-tight truncate">{subject.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                          {subject.exam_board_code || subject.code || ''} · {subject.exam_board_name || 'Standard'}
                        </p>
                        {subject.source === 'class' && subject.class_name && (
                          <p className="text-[9px] text-purple-500 mt-0.5 truncate">{subject.class_name}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          {subject.topics_completed || 0}/{subject.subtopic_count || 0} Subtopics
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-gray-400">Progress</span>
                          <span className="text-[10px] font-semibold text-gray-600">
                            {subject.completion_pct || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                          <div className="h-1 rounded-full transition-all"
                            style={{ width: `${subject.completion_pct || 0}%`, backgroundColor: subIcon.color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Gamification */}
            <section className="mt-4">
              <GamificationBar />
            </section>

            {/* Join a Class */}
            <section className="mt-3">
              <button
                onClick={() => setJoinModal(true)}
                className="w-full border border-dashed border-gray-300 hover:border-teal-400 rounded-2xl p-4 text-sm text-gray-400 hover:text-teal-600 transition-colors flex items-center justify-center gap-2"
              >
                <Users size={15} /> Join a Teacher's Class
              </button>
            </section>

            {/* ── Join Class Modal ──────────────────────────────────────── */}
            {joinModal && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900">Join a Class</h3>
                    <button onClick={() => { setJoinModal(false); setJoinCode(''); setJoinMsg(null); }}>
                      <X size={18} className="text-gray-400" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">Ask your teacher for the class join code.</p>
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC123"
                    maxLength={10}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-300 mb-3"
                    onKeyDown={e => e.key === 'Enter' && handleJoinClass()}
                  />
                  {joinMsg && (
                    <p className={`text-xs text-center mb-3 font-medium ${joinMsg.type === 'success' ? 'text-teal-600' : 'text-red-500'}`}>
                      {joinMsg.text}
                    </p>
                  )}
                  <button
                    onClick={handleJoinClass}
                    disabled={joining || !joinCode.trim()}
                    className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    {joining ? 'Joining…' : 'Join Class'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Add More Subjects Modal ───────────────────────────────── */}
            {addModal && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900">Add More Subjects</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {selectedBoard?.name || 'Your curriculum'} subjects
                      </p>
                    </div>
                    <button onClick={() => setAddModal(false)}>
                      <X size={18} className="text-gray-400" />
                    </button>
                  </div>

                  {addLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                    </div>
                  ) : availableSubs.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-500">You're enrolled in all available subjects!</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto flex-1 -mx-1 px-1">
                      <div className="grid grid-cols-2 gap-2">
                        {availableSubs.map(s => {
                          const subIcon = getSubjectIcon(s.name);
                          const isAdding = addingSub === s.id;
                          return (
                            <button
                              key={s.id}
                              onClick={() => handleAddSubject(s)}
                              disabled={isAdding}
                              className="flex items-center gap-2 p-3 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 text-left transition-all disabled:opacity-60"
                            >
                              <span className="text-lg" style={{ backgroundColor: subIcon.bg, borderRadius: 8, padding: 4 }}>
                                {subIcon.icon}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{s.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">{s.exam_board_code || ''}</p>
                              </div>
                              {isAdding
                                ? <Loader2 size={13} className="text-teal-500 animate-spin shrink-0" />
                                : <Plus size={13} className="text-teal-500 shrink-0" />
                              }
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ MY PERFORMANCE TAB ══ */}
        {activeTab === 'my_performance' && (
          <>
            {/* Subject selector */}
            <div className="relative mb-5 inline-block">
              <button
                onClick={() => setPerfDropOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-teal-600 transition-colors"
              >
                <span className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: PALETTES[0].color }} />
                {selectedPerfSub?.name || 'Select Subject'}
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {perfDropOpen && (
                <div className="absolute left-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-40 min-w-[200px] max-h-60 overflow-y-auto">
                  {allSubjects.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedPerfSub(s); setPerfDropOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${selectedPerfSub?.id === s.id ? 'font-semibold text-teal-600' : 'text-gray-700'}`}
                    >
                      <span>{s.icon_emoji || ''}</span> {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {perfLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
              </div>
            ) : (
              <>
                {/* Donut + Calendar */}
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center gap-2">
                    <DonutChart pct={perfPct} />
                    <p className="text-xs text-gray-400 text-center">{completedSubs} subtopics completed</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 shadow-sm">
                    <div className="flex gap-1 mb-3">
                      {['Day', 'Week', 'Month'].map(m => (
                        <button key={m} onClick={() => setCalMode(m)}
                          className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${calMode === m ? 'bg-teal-500 text-white' : 'text-gray-500 hover:bg-purple-100'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <MiniCalendar studyDates={studyDates} />
                    <div className="mt-3 pt-3 border-t border-purple-100">
                      <p className="text-[10px] text-purple-400 font-medium uppercase tracking-wide mb-1">Time Spent</p>
                      <p className="text-xl font-bold text-teal-600">{perfMins} min</p>
                      <p className="text-sm font-semibold text-teal-400">{perfSecs} sec</p>
                    </div>
                  </div>
                </div>

                {/* Area of Strength */}
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-3 h-3 rounded-sm bg-green-500 shrink-0" />
                    <h3 className="text-sm font-bold text-gray-800">Area of Strength</h3>
                    <span className="ml-auto text-[10px] text-gray-400">(Based on quizzes)</span>
                    <span className="text-2xl"></span>
                  </div>
                  <PerfTable
                    rows={strengthRows}
                    emptyMsg="We don't have enough data to show this yet. Keep learning and practising quizzes."
                  />
                </div>

                {/* Area of Weakness */}
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-3 h-3 rounded-sm bg-red-400 shrink-0" />
                    <h3 className="text-sm font-bold text-gray-800">Area of Weakness</h3>
                    <span className="ml-auto text-[10px] text-gray-400">(Based on quizzes)</span>
                    <span className="text-2xl"></span>
                  </div>
                  <PerfTable
                    rows={weaknessRows}
                    emptyMsg="We don't have enough data to show this yet. Keep learning and practising quizzes."
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
