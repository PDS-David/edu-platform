// client/src/pages/StudentAnalyticsDashboard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// FIXES in this version:
//   1. All API calls now unwrap res.data correctly — the backend returns
//      { success, data: [...] } but the old code was reading res.data.data
//      inconsistently, causing empty charts on first load.
//   2. Grade prediction subject selector now passes s.subject_id (the UUID
//      from the fixed subject-breakdown endpoint) instead of s.id or s.id
//      falling back to undefined.
//   3. fetchPrediction corrected to read res.data (not res.data.data).
//   4. GamificationBar integrated into the page so XP/streak/badges render.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect }    from 'react';
import { Link, useNavigate }      from 'react-router-dom';
import api                        from '../services/apiClient';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Flame, Target, Clock, Trophy, Zap, ArrowLeft,
  AlertTriangle, Loader2, ArrowRight, Sparkles,
} from 'lucide-react';
import { useAuth }       from '../context/AuthContext';
import TopNav            from '../components/TopNav';
import GamificationBar   from '../components/GamificationBar';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtTime = (secs) => {
  if (!secs) return '0m';
  const s = Number(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const accColor = (pct) => {
  if (pct >= 70) return '#1D9E75';
  if (pct >= 40) return '#BA7517';
  return '#E24B4A';
};

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-white/50 font-medium">{label}</p>
        <p className="text-xl font-bold text-white leading-tight">{value}</p>
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}%
        </p>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function StudentAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [summary,     setSummary]     = useState(null);
  const [weakTopics,  setWeakTopics]  = useState([]);
  const [scoreTrend,  setScoreTrend]  = useState([]);
  const [breakdown,   setBreakdown]   = useState([]);
  const [timeData,    setTimeData]    = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [noActivity,  setNoActivity]  = useState(false);

  // Predicted grade state
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [prediction,        setPrediction]         = useState(null);
  const [predLoading,       setPredLoading]         = useState(false);
  const [predError,         setPredError]           = useState('');

  // Learning path state
  const [learningPath,      setLearningPath]        = useState(null);
  const [pathLoading,       setPathLoading]          = useState(false);
  const [pathError,         setPathError]            = useState('');

  // ── Fetch learning path ────────────────────────────────────────────────────
  const fetchLearningPath = async () => {
    if (!user?.id) return;
    setPathLoading(true);
    setPathError('');
    setLearningPath(null);
    try {
      const res = await api.get(`/ai/learning-path/${user.id}`, { timeout: 60000 });
      if (res.success !== false && res.data?.steps) {
        setLearningPath(res.data);
      } else {
        setPathError('Could not generate your learning path. Try again later.');
      }
    } catch {
      setPathError('Could not generate your learning path. Try again later.');
    } finally {
      setPathLoading(false);
    }
  };

  // ── Fetch prediction ──────────────────────────────────────────────────────
  const fetchPrediction = async (subjectId) => {
    if (!subjectId || !user?.id) return;
    setPredLoading(true);
    setPredError('');
    setPrediction(null);
    try {
      // FIX: API returns { success, data: { predictedGrade, ... } }
      const res = await api.get(`/ai/predict-grade/${user.id}/${subjectId}`, { timeout: 60000 });
      if (res.success) {
        setPrediction(res.data);
      } else {
        setPredError(res.error || 'Could not load prediction.');
      }
    } catch {
      setPredError('Could not load prediction. Try again later.');
    } finally {
      setPredLoading(false);
    }
  };

  // ── Load all analytics ────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/analytics/summary'),
      api.get('/analytics/weak-topics'),
      api.get('/analytics/score-trend'),
      api.get('/analytics/subject-breakdown'),
      api.get('/analytics/time-metrics'),
      api.get('/analytics/leaderboard'),
    ])
      .then(([sum, weak, trend, brk, time, lb]) => {
        // FIX: all endpoints return { success, data } — unwrap .data
        const s = sum.data || {};
        setSummary(s);
        setWeakTopics (Array.isArray(weak.data)  ? weak.data  : []);
        setScoreTrend (Array.isArray(trend.data) ? trend.data : []);
        setBreakdown  (Array.isArray(brk.data)   ? brk.data   : []);
        setTimeData   (Array.isArray(time.data)  ? time.data  : []);
        setLeaderboard(Array.isArray(lb.data)    ? lb.data    : []);
        if ((s.total_attempts || 0) === 0) setNoActivity(true);
      })
      .catch(err => console.error('[Analytics]', err.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="flex justify-center pt-24">
        <Loader2 size={28} className="text-blue-400 animate-spin" />
      </div>
    </div>
  );

  // ── Grade colour helper ────────────────────────────────────────────────────
  const gradeColour = (g = '') => {
    if (g.startsWith('A'))  return 'bg-blue-500';
    if (g.startsWith('B'))  return 'bg-green-500';
    if (g.startsWith('C'))  return 'bg-blue-500';
    if (g.startsWith('D'))  return 'bg-amber-500';
    return 'bg-red-500';
  };

  // ── Confidence % (convert string to number) ────────────────────────────────
  const confidencePct = (c) => {
    if (typeof c === 'number') return c;
    if (c === 'High')   return 85;
    if (c === 'Medium') return 55;
    return 25;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Dark header with stat cards */}
      <div className="bg-[#0a4a3f]">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <h1 className="text-white text-xl font-bold mb-1">My Analytics</h1>
          <p className="text-white/50 text-sm">Track your performance and find where to improve</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <StatCard icon={Target} label="Total Attempts"   value={summary?.total_attempts ?? 0}           accent="bg-blue-600"   />
            <StatCard icon={Trophy} label="Overall Accuracy" value={`${summary?.accuracy_pct ?? 0}%`}       accent="bg-purple-600" />
            <StatCard icon={Flame}  label="Day Streak"       value={`${summary?.study_streak_days ?? 0}d`}  accent="bg-amber-500"  />
            <StatCard icon={Clock}  label="Time Studied"     value={fmtTime(summary?.total_time_seconds)}   accent="bg-blue-600"   />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Gamification bar — XP, streak, badges */}
        <GamificationBar />

        {/* No activity notice */}
        {noActivity && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            No practice data yet. Start answering questions to see your analytics here.
          </div>
        )}

        {/* Score trend */}
        {scoreTrend.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Score trend — last 30 days</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={scoreTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={d => d?.slice(5)} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="avg_score" name="Score" stroke="#1D9E75" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Subject accuracy bars */}
        {breakdown.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Accuracy by subject</p>
            <ResponsiveContainer width="100%" height={Math.max(160, breakdown.length * 36)}>
              <BarChart data={breakdown} layout="vertical" margin={{ top: 0, right: 40, left: 80, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis type="category" dataKey="subject_name" tick={{ fontSize: 11, fill: '#374151' }} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="accuracy_pct" name="Accuracy" radius={[0, 6, 6, 0]} fill="#1D9E75"
                  label={{ position: 'right', fontSize: 10, fill: '#6b7280', formatter: v => `${v}%` }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weak topics */}
        {weakTopics.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Your weakest topics</p>
              <span className="text-xs text-gray-400">Last 30 days</span>
            </div>
            <div className="space-y-2.5">
              {weakTopics.map((t, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: accColor(t.accuracy_pct) + '20', color: accColor(t.accuracy_pct) }}
                  >
                    {Math.round(t.accuracy_pct)}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.topic}</p>
                    <p className="text-xs text-gray-400">{t.subject_name} · {t.attempt_count} attempts</p>
                  </div>
                  {t.subtopic_id && (
                    <Link
                      to={`/student/subtopic/${t.subtopic_id}?tab=practice`}
                      className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800 shrink-0"
                    >
                      Practice <ArrowRight size={11} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time metrics */}
        {timeData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Time per question vs benchmark</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 font-medium">Subject</th>
                    <th className="text-center py-2 font-medium">Your avg</th>
                    <th className="text-center py-2 font-medium">Benchmark</th>
                    <th className="text-center py-2 font-medium">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {timeData.map((row, i) => {
                    const delta = (row.avg_time_seconds || 0) - (row.benchmark_time_seconds || 0);
                    return (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 font-medium text-gray-700">{row.subject_name}</td>
                        <td className="py-2 text-center text-gray-600">{fmtTime(row.avg_time_seconds)}</td>
                        <td className="py-2 text-center text-gray-400">{fmtTime(row.benchmark_time_seconds)}</td>
                        <td className="py-2 text-center">
                          <span className={`font-semibold ${delta > 5 ? 'text-red-500' : delta < -5 ? 'text-green-500' : 'text-gray-400'}`}>
                            {delta > 0 ? '+' : ''}{Math.round(delta)}s
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Weekly leaderboard */}
        {leaderboard.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={15} className="text-amber-500" />
              <p className="text-sm font-semibold text-gray-700">Weekly leaderboard</p>
            </div>
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${entry.is_me ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}
                >
                  <span className="text-sm font-bold text-gray-400 w-5 text-center shrink-0">{i + 1}</span>
                  <span className={`flex-1 text-sm font-medium ${entry.is_me ? 'text-blue-700' : 'text-gray-700'}`}>
                    {entry.is_me ? 'You' : entry.display_name}
                  </span>
                  <span className="text-xs text-gray-400">{entry.attempts} attempts</span>
                  <span className="text-xs font-bold text-amber-600">{entry.xp_points} XP</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI Predicted Grade ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={15} className="text-purple-500" />
            <p className="text-sm font-semibold text-gray-700">AI Predicted Grade</p>
          </div>

          {/* FIX: use subject_id (UUID) not s.id which may be undefined */}
          <select
            value={selectedSubjectId}
            onChange={e => {
              setSelectedSubjectId(e.target.value);
              fetchPrediction(e.target.value);
            }}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">Select a subject…</option>
            {breakdown.map((s, i) => (
              <option key={i} value={s.subject_id}>{s.subject_name}</option>
            ))}
          </select>

          {predLoading && (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="text-purple-400 animate-spin" />
            </div>
          )}

          {predError && !predLoading && (
            <p className="text-center text-sm text-red-400 py-4">{predError}</p>
          )}

          {!predLoading && !predError && prediction && (
            <div className="space-y-4">
              {/* Grade + confidence */}
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl ${gradeColour(prediction.predictedGrade)} flex items-center justify-center text-white text-3xl font-black shrink-0`}>
                  {prediction.predictedGrade}
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Confidence</p>
                  <div className="w-40 bg-gray-100 rounded-full h-2 mb-1">
                    <div
                      className={`h-2 rounded-full ${gradeColour(prediction.predictedGrade)} transition-all duration-700`}
                      style={{ width: `${confidencePct(prediction.confidence)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">{prediction.confidence} confidence</p>
                </div>
              </div>

              {/* Focus areas */}
              {prediction.weakestTopics?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Focus areas</p>
                  <div className="flex flex-wrap gap-2">
                    {prediction.weakestTopics.slice(0, 3).map((t, i) => (
                      <span key={i} className="bg-red-50 text-red-600 text-xs font-medium px-2.5 py-1 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Study advice */}
              {prediction.studyAdvice && (
                <div className="bg-purple-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-purple-700 mb-1">✦ Study advice</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{prediction.studyAdvice}</p>
                </div>
              )}

              {/* Weekly target */}
              {prediction.weeklyTarget && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">🎯 This week's target</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{prediction.weeklyTarget}</p>
                </div>
              )}
            </div>
          )}

          {!predLoading && !predError && !prediction && (
            <div className="text-center py-8 text-gray-400 text-sm">
              {selectedSubjectId
                ? 'Could not load prediction. Try again later.'
                : 'Select a subject to see your predicted grade'}
            </div>
          )}
        </div>

        {/* ── AI Learning Path ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-blue-500" />
              <p className="text-sm font-semibold text-gray-700">AI Learning Path</p>
            </div>
            {!learningPath && !pathLoading && (
              <button
                onClick={fetchLearningPath}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <Sparkles size={11} /> Generate My Plan
              </button>
            )}
            {learningPath && (
              <button
                onClick={fetchLearningPath}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Regenerate
              </button>
            )}
          </div>

          {!pathLoading && !learningPath && !pathError && (
            <div className="text-center py-8 text-gray-400">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={20} className="text-blue-400" />
              </div>
              <p className="text-sm font-medium">Your personalised study roadmap</p>
              <p className="text-xs mt-1 text-gray-300">Click "Generate My Plan" to get a prioritised 5-step study plan based on your weak areas.</p>
            </div>
          )}

          {pathLoading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 size={24} className="text-blue-400 animate-spin" />
              <p className="text-xs text-gray-400">Analysing your performance…</p>
            </div>
          )}

          {pathError && !pathLoading && (
            <div className="text-center py-6">
              <p className="text-sm text-red-400">{pathError}</p>
              <button onClick={fetchLearningPath} className="mt-3 text-xs text-blue-600 underline">Try again</button>
            </div>
          )}

          {!pathLoading && learningPath?.steps?.length > 0 && (
            <div className="space-y-3">
              {learningPath.ai_generated && (
                <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                  <Sparkles size={10} /> AI-personalised plan · based on your recent performance
                </p>
              )}
              {learningPath.steps.map((step, i) => {
                const priorityColour = step.priority === 'High'
                  ? 'border-red-200 bg-red-50'
                  : step.priority === 'Medium'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-100 bg-gray-50';
                const badgeColour = step.priority === 'High'
                  ? 'bg-red-100 text-red-600'
                  : step.priority === 'Medium'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-gray-100 text-gray-500';
                return (
                  <div key={i} className={`border rounded-xl p-4 ${priorityColour}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                        {step.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800 truncate">{step.subtopic}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeColour}`}>
                            {step.priority}
                          </span>
                          {step.type === 'remediation' && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white border border-red-200 text-red-500 shrink-0">Needs Work</span>
                          )}
                          {step.type === 'new_topic' && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white border border-blue-200 text-blue-500 shrink-0">New Topic</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{step.subject} → {step.topic}</p>
                        <p className="text-xs text-gray-600 mb-2 leading-relaxed">{step.reason}</p>
                        <p className="text-xs text-gray-700 font-medium leading-relaxed">{step.action}</p>
                      </div>
                    </div>
                    {step.subtopic_id && (
                      <div className="mt-3 pl-10">
                        <Link
                          to={`/student/subtopic/${step.subtopic_id}?tab=practice`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Start Practising <ArrowRight size={11} />
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
