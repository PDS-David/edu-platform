// client/src/pages/StudentDashboard.jsx
// FIXED + OPTIMIZED VERSION

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  'Chemistry':        { icon: '', bg: '#FEF9C3', color: '#CA8A04' },
  'Physics':          { icon: '', bg: '#DBEAFE', color: '#2563EB' },
  'Mathematics':      { icon: '', bg: '#EDE9FE', color: '#7C3AED' },
  'English Language': { icon: '', bg: '#FCE7F3', color: '#DB2777' },
  'English':          { icon: '', bg: '#FCE7F3', color: '#DB2777' },
  'Economics':        { icon: '', bg: '#FFEDD5', color: '#EA580C' },
  'default':          { icon: '', bg: '#EFF6FF', color: '#14B8A6' },
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
];

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);

  const [mySubjects, setMySubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedPerfSub, setSelectedPerfSub] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const [whatNext, setWhatNext] = useState(null);
  const [error, setError] = useState(null);

  const firstName = user?.firstName || 'Student';

  // ── Load Boards ────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/students/my-boards')
      .then(r => {
        const list = r.data || [];
        setBoards(list);
        if (list.length > 0) setSelectedBoard(list[0]);
      })
      .catch(err => {
        console.error('Boards load failed:', err);
      });
  }, []);

  // ── Load Subjects (FIXED + BULK PROGRESS) ───────────────────────────────────
  const loadMySubjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.get('/students/my-subjects');
      const list = res.data || [];

      // ✅ BULK PROGRESS (no more N+1)
      const progressRes = await api.get('/subtopics/progress-summary/bulk', {
        params: { student_id: user.id }
      });

      const progressMap = progressRes.data || {};

      const withProgress = list.map((s, i) => ({
        ...s,
        palette: PALETTES[i % PALETTES.length],
        completion_pct: progressMap[s.id]?.completion_pct || 0,
        subtopic_count: progressMap[s.id]?.total_subtopics || 0,
        topics_completed: progressMap[s.id]?.completed_subtopics || 0,
      }));

      setMySubjects(withProgress);

    } catch (err) {
      console.error('Subjects load failed:', err);
      setError('Failed to load subjects');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadMySubjects(); }, [loadMySubjects]);

  // ── Derived filtered subjects (NO DUPLICATION) ─────────────────────────────
  const filteredSubjects = useMemo(() => {
    if (!selectedBoard) return mySubjects;

    return mySubjects.filter(s =>
      s.exam_board_id === selectedBoard.id || s.source === 'class'
    );
  }, [selectedBoard, mySubjects]);

  // ── Sync selectedPerfSub (FIXED BUG) ───────────────────────────────────────
  useEffect(() => {
    if (filteredSubjects.length > 0) {
      setSelectedPerfSub(filteredSubjects[0]);
    }
  }, [filteredSubjects]);

  // ── Load "What's Next" ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    api.get('/subtopics/next', {
      params: { student_id: user.id }
    })
      .then(r => setWhatNext(r.data))
      .catch(err => console.error('Next failed:', err));
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-2xl mx-auto p-4">

        <h1 className="text-xl font-bold mb-4">
          Hi, {firstName}
        </h1>

        {/* ERROR */}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-3 text-sm">
            {error}
          </div>
        )}

        {/* CONTINUE LEARNING */}
        <div className="bg-white p-4 rounded-xl mb-4">
          <h2 className="font-semibold mb-2">Continue Learning</h2>

          {whatNext ? (
            <button
              onClick={() => navigate(`/student/subtopic/${whatNext.subtopic_id}`)}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Continue
            </button>
          ) : (
            <p className="text-sm text-gray-400">
              No recent activity yet. Start learning.
            </p>
          )}
        </div>

        {/* SUBJECTS */}
        <div className="bg-white p-4 rounded-xl">
          <h2 className="font-semibold mb-3">My Subjects</h2>

          {loading ? (
            <Loader2 className="animate-spin" />
          ) : filteredSubjects.length === 0 ? (
            <p className="text-sm text-gray-400">
              No subjects yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredSubjects.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/student/subject/${s.id}`)}
                  className="border p-3 rounded-xl"
                >
                  <p className="font-semibold text-sm">{s.name}</p>
                  <p className="text-xs text-gray-400">
                    {s.completion_pct}%
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
