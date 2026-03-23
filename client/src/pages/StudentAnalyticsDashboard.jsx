// client/src/pages/StudentAnalyticsDashboard.jsx
// Deep rebuild — matches AiBuddy analytics depth.
// Sections: stat cards, score trend, subject breakdown,
// weak topics, time metrics, leaderboard.

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Flame, Target, Clock, Trophy, Zap, ArrowLeft,
  AlertTriangle, Loader2, ArrowRight, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TopNav from '../components/TopNav';



const fmtTime = (secs) => {
  if (!secs) return '0m';
  const s = Number(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

export default function StudentAnalyticsDashboard() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const [summary,     setSummary]     = useState(null);
  const [weakTopics,  setWeakTopics]  = useState([]);
  const [scoreTrend,  setScoreTrend]  = useState([]);
  const [breakdown,   setBreakdown]   = useState([]);
  const [timeData,    setTimeData]    = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [noActivity,  setNoActivity]  = useState(false);

  // Predicted grade state
  const [selectedSubjectForGrade, setSelectedSubjectForGrade] = useState('');
  const [prediction,  setPrediction]  = useState(null);
  const [predLoading, setPredLoading] = useState(false);

  const fetchPrediction = async (subjectId) => {
    if (!subjectId || !user?.id) return;
    setPredLoading(true);
    try {
      const res = await api.get(`/ai/predict-grade/${user.id}/${subjectId}`);
      const data = res;
      if (data.success) setPrediction(data.data || data);
      else setPrediction(null);
    } catch { setPrediction(null); }
    finally { setPredLoading(false); }
  };

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
        const s = sum.data || {};
        setSummary(s);
        setWeakTopics (weak.data  || []);
        setScoreTrend (trend.data || []);
        setBreakdown  (brk.data   || []);
        setTimeData   (time.data  || []);
        setLeaderboard(lb.data    || []);
        if ((s.total_attempts || 0) === 0) setNoActivity(true);
      })
      .catch(err => console.error('[Analytics]', err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-gray-50"><TopNav />
      <div className="flex justify-center pt-24"><Loader2 size={28} className="text-teal-400 animate-spin" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Dark teal header with stat cards */}
      <div className="bg-[#0a4a3f]">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-4 transition-colors">
            <ArrowLeft size={15} /> Back
          </button>
          <h1 className="text-white text-xl font-bold mb-1">My Analytics</h1>
          <p className="text-white/50 text-sm">Track your performance and find where to improve</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <StatCard icon={Target} label="Total Attempts"   value={summary?.total_attempts ?? 0}            accent="bg-teal-600" />
            <StatCard icon={Trophy} label="Overall Accuracy" value={`${summary?.accuracy_pct ?? 0}%`}        accent="bg-purple-600" />
            <StatCard icon={Flame}  label="Day Streak"       value={`${summary?.study_streak_days ?? 0}d`}   accent="bg-amber-500" />
            <StatCard icon={Clock}  label="Time Studied"     value={fmtTime(summary?.total_time_seconds)}    accent="bg-blue-600" />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

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
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: accColor(t.accuracy_pct) + '20', color: accColor(t.accuracy_pct) }}>
                    {Math.round(t.accuracy_pct)}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.topic}</p>
                    <p className="text-xs text-gray-400">{t.subject_name} · {t.attempt_count} attempts</p>
                  </div>
                  {t.subtopic_id && (
                    <Link to={`/student/subtopic/${t.subtopic_id}?tab=practice`}
                      className="flex items-center gap-1 text-xs text-teal-600 font-semibold hover:text-teal-800 shrink-0">
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
          <div className="bg-white rounded-2xl border border-gray-100 p-5 pb-8">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={15} className="text-amber-500" />
              <p className="text-sm font-semibold text-gray-700">Weekly leaderboard</p>
            </div>
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div key={i}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${entry.is_me ? 'bg-teal-50 border border-teal-100' : 'bg-gray-50'}`}>
                  <span className="text-sm font-bold text-gray-400 w-5 text-center shrink-0">{i + 1}</span>
                  <span className={`flex-1 text-sm font-medium ${entry.is_me ? 'text-teal-700' : 'text-gray-700'}`}>
                    {entry.is_me ? 'You' : entry.display_name}
                  </span>
                  <span className="text-xs text-gray-400">{entry.attempts} attempts</span>
                  <span className="text-xs font-bold text-amber-600">{entry.xp_points} XP</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Predicted Grade Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={15} className="text-purple-500" />
            <p className="text-sm font-semibold text-gray-700">AI Predicted Grade</p>
          </div>

          {/* Subject selector */}
          <select
            value={selectedSubjectForGrade}
            onChange={e => {
              setSelectedSubjectForGrade(e.target.value);
              fetchPrediction(e.target.value);
            }}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">Select a subject…</option>
            {breakdown.map((s, i) => (
              <option key={i} value={s.subject_id || s.id}>{s.subject_name}</option>
            ))}
          </select>

          {predLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="text-purple-400 animate-spin" />
            </div>
          ) : prediction ? (
            <div className="space-y-4">
              {/* Grade badge */}
              {(() => {
                const g = prediction.predictedGrade || '';
                const gradeColor =
                  g.startsWith('A*') ? 'bg-teal-500' :
                  g.startsWith('A')  ? 'bg-green-500' :
                  g.startsWith('B')  ? 'bg-blue-500'  :
                  g.startsWith('C')  ? 'bg-amber-500' :
                                       'bg-red-500';
                return (
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-2xl ${gradeColor} flex items-center justify-center text-white text-3xl font-black shrink-0`}>
                      {g}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Confidence</p>
                      <div className="w-40 bg-gray-100 rounded-full h-2 mb-1">
                        <div
                          className={`h-2 rounded-full ${gradeColor} transition-all duration-700`}
                          style={{ width: `${prediction.confidence || 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">{prediction.confidence || 0}% confidence</p>
                    </div>
                  </div>
                );
              })()}

              {/* Weakest topics */}
              {(prediction.weakestTopics || []).length > 0 && (
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
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">
              {selectedSubjectForGrade
                ? 'Could not load prediction. Try again later.'
                : 'Select a subject to see your predicted grade'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
