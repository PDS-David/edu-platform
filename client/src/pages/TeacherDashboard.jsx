// client/src/pages/TeacherDashboard.jsx

import { useState, useEffect } from 'react';
import { useNavigate, Link }   from 'react-router-dom';
import api                     from '../services/api';
import {
  Users, Plus, Copy, CheckCircle, Loader2, AlertTriangle,
  BarChart2, Zap, X, ChevronRight, Send, PenTool,
  BookOpen, Upload, AlertCircle,
} from 'lucide-react';
import TopNav       from '../components/TopNav';
import { useAuth }  from '../context/AuthContext';

// ── Shared helpers ────────────────────────────────────────────────────────────
const accColor = (pct) => {
  if (!pct && pct !== 0) return 'text-gray-400';
  if (pct >= 70) return 'text-green-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-500';
};

function getDisplayName(user) {
  if (!user) return 'Teacher';
  const first = user.firstName || user.first_name;
  if (first && first.trim()) return first.trim();
  const full = user.lastName || user.last_name || user.name || '';
  if (full.trim()) return full.trim().split(' ')[0];
  if (user.email) return user.email.split('@')[0];
  return 'Teacher';
}

function Toast({ msg, type, onClose }) {
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white
      ${type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
      {type === 'success' ? <CheckCircle size={14} className="text-teal-400" /> : <AlertTriangle size={14} />}
      {msg}
      <button onClick={onClose}><X size={13} className="opacity-60" /></button>
    </div>
  );
}

// ── Classes tab ───────────────────────────────────────────────────────────────
function ClassesTab({ onViewAnalytics }) {
  const [classes,    setClasses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [creating,   setCreating]  = useState(false);
  const [copied,     setCopied]    = useState(null);
  const [toast,      setToast]     = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/teacher/classes')
      .then(r => setClasses(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const createClass = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/teacher/classes', { name: newName });
      setNewName('');
      setShowCreate(false);
      setToast({ type: 'success', msg: 'Class created!' });
      load();
    } catch {
      setToast({ type: 'error', msg: 'Failed to create class.' });
    } finally {
      setCreating(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="text-teal-400 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{classes.length} class{classes.length !== 1 ? 'es' : ''}</p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={14} /> New Class
        </button>
      </div>

      {showCreate && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-center gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Class name e.g. SS3 Mathematics"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            onKeyDown={e => e.key === 'Enter' && createClass()}
          />
          <button onClick={createClass} disabled={creating}
            className="bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-60 transition-colors">
            {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
          </button>
          <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No classes yet. Create one to get started.</p>
        </div>
      ) : (
        classes.map(cls => (
          <div key={cls.id} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-semibold text-gray-900">{cls.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {cls.student_count} students · Avg accuracy {cls.avg_accuracy ?? '—'}%
                </p>
              </div>
              <button
                onClick={() => onViewAnalytics(cls)}
                className="flex items-center gap-1 text-xs text-teal-600 font-semibold hover:text-teal-800 shrink-0"
              >
                Analytics <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2.5 py-1 rounded-lg">
                Join code: <span className="font-bold text-gray-800">{cls.join_code}</span>
              </span>
              <button onClick={() => copyCode(cls.join_code)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors">
                {copied === cls.join_code
                  ? <CheckCircle size={12} className="text-teal-500" />
                  : <Copy size={12} />}
              </button>
            </div>
          </div>
        ))
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────
function AnalyticsTab({ cls }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [nudging,    setNudging]    = useState(null);
  const [toast,      setToast]      = useState(null);
  const [gapData,    setGapData]    = useState(null);
  const [gapLoading, setGapLoading] = useState(false);

  useEffect(() => {
    if (!cls) { setLoading(false); return; }
    setLoading(true);
    api.get(`/teacher/class/${cls.id}/analytics`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cls?.id]); // eslint-disable-line

  const nudge = async (student) => {
    setNudging(student.id);
    try {
      await api.post(`/teacher/nudge/${student.id}`);
      setToast({ type: 'success', msg: `Nudge sent to ${student.name}` });
    } catch {
      setToast({ type: 'error', msg: 'Failed to send nudge.' });
    } finally {
      setNudging(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const runGapAnalysis = async () => {
    setGapLoading(true);
    try {
      const res = await api.get('/analytics/cohort-gaps', { params: { class_id: cls.id } });
      setGapData(res.data?.gaps || []);
    } catch {
      setToast({ type: 'error', msg: 'AI analysis failed. Try again.' });
    } finally {
      setGapLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  if (!cls) return (
    <div className="text-center py-12 text-gray-400">
      <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">Select a class from My Classes to view analytics.</p>
    </div>
  );

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="text-teal-400 animate-spin" /></div>;
  if (!data)   return <p className="text-center py-8 text-gray-400 text-sm">No data available.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BarChart2 size={16} className="text-teal-500" />
        <p className="font-semibold text-gray-800">{cls.name} — Analytics</p>
      </div>

      {data.weak_topics?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Class weak topics</p>
          <div className="space-y-2">
            {data.weak_topics.map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 flex-1 truncate">{t.topic}</span>
                <span className="text-xs text-gray-400">{t.student_count} students</span>
                <span className={`text-xs font-bold w-12 text-right ${accColor(t.avg_accuracy)}`}>{t.avg_accuracy}%</span>
                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${100 - t.avg_accuracy}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">AI Gap Analysis</p>
          <button onClick={runGapAnalysis} disabled={gapLoading}
            className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
            {gapLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {gapLoading ? 'Analysing…' : 'Run AI Analysis'}
          </button>
        </div>
        {gapData === null && <p className="text-xs text-gray-400">Click to run AI analysis of your class gaps.</p>}
        {gapData?.length === 0 && <p className="text-xs text-gray-400">No significant gaps detected for this class.</p>}
        {gapData?.length > 0 && (
          <div className="space-y-2">
            {gapData.map((g, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700">{g.topic}</span>
                  <span className="text-xs font-bold text-red-500">{g.avg_accuracy}% avg</span>
                </div>
                <p className="text-[11px] text-gray-500">{g.recommendation}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.students?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Students</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Name</th>
                  <th className="text-center py-2 font-medium">Accuracy</th>
                  <th className="text-center py-2 font-medium">Attempts</th>
                  <th className="text-center py-2 font-medium">Streak</th>
                  <th className="text-center py-2 font-medium">Last active</th>
                  <th className="text-center py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, i) => {
                  const inactive = s.days_since_active !== null && s.days_since_active > 7;
                  return (
                    <tr key={i} className={`border-b border-gray-50 ${inactive ? 'bg-red-50' : ''}`}>
                      <td className="py-2 font-medium text-gray-700">{s.name}</td>
                      <td className={`py-2 text-center font-bold ${accColor(s.accuracy_pct)}`}>{s.accuracy_pct ?? '—'}%</td>
                      <td className="py-2 text-center text-gray-500">{s.attempts}</td>
                      <td className="py-2 text-center text-amber-600">{s.streak}d</td>
                      <td className="py-2 text-center text-gray-400">
                        {s.days_since_active !== null ? `${s.days_since_active}d ago` : '—'}
                      </td>
                      <td className="py-2 text-center">
                        {inactive && (
                          <button onClick={() => nudge(s)} disabled={nudging === s.id}
                            className="flex items-center gap-1 text-[10px] font-semibold text-white bg-amber-500 hover:bg-amber-600 px-2 py-1 rounded-lg transition-colors mx-auto disabled:opacity-60">
                            {nudging === s.id ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                            Nudge
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Test Builder tab ──────────────────────────────────────────────────────────
function TestBuilderTab() {
  const [step,        setStep]        = useState(1);
  const [classes,     setClasses]     = useState([]);
  const [subjects,    setSubjects]    = useState([]);
  const [form,        setForm]        = useState({
    title: '', class_id: '', subject_id: '', difficulty: 'mixed',
    question_count: 10, time_limit_minutes: 30, due_date: '',
  });
  const [creating,    setCreating]    = useState(false);
  const [createdTest, setCreatedTest] = useState(null);
  const [toast,       setToast]       = useState(null);
  const [copied,      setCopied]      = useState(false);

  useEffect(() => {
    api.get('/teacher/classes').then(r => setClasses(r.data || [])).catch(() => {});
    api.get('/subjects').then(r => setSubjects(r.data || [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!form.title.trim()) { setToast({ type: 'error', msg: 'Title required' }); return; }
    setCreating(true);
    try {
      const res = await api.post('/teacher/tests', {
        title:              form.title.trim(),
        class_id:           form.class_id  || null,
        subject_id:         form.subject_id || null,
        difficulty:         form.difficulty,
        question_count:     parseInt(form.question_count)     || 10,
        time_limit_minutes: parseInt(form.time_limit_minutes) || 30,
        due_date:           form.due_date || null,
      });
      setCreatedTest(res.data);
      setStep(2);
    } catch (err) {
      setToast({ type: 'error', msg: err?.error || err?.message || 'Failed to create test' });
    } finally {
      setCreating(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const shareLink = createdTest ? `${window.location.origin}/student/test/${createdTest.id}` : '';

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };

  const f = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }));

  if (step === 2 && createdTest) return (
    <div className="space-y-4">
      <div className="bg-teal-50 border border-teal-200 rounded-2xl p-6 text-center">
        <div className="text-3xl mb-2">✅</div>
        <p className="font-bold text-gray-900 text-lg">{createdTest.title}</p>
        <p className="text-sm text-gray-500 mt-1">
          {createdTest.question_count} questions · {createdTest.time_limit_minutes || form.time_limit_minutes} min
          {createdTest.due_date ? ` · Due ${new Date(createdTest.due_date).toLocaleDateString('en-GB')}` : ''}
        </p>
        <div className="mt-4 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <span className="text-xs font-mono text-gray-600 flex-1 truncate">{shareLink}</span>
          <button onClick={copyLink}
            className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-800 shrink-0">
            {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">Share this link with your students</p>
      </div>

      <button
        onClick={() => {
          setStep(1);
          setForm({ title:'', class_id:'', subject_id:'', difficulty:'mixed', question_count:10, time_limit_minutes:30, due_date:'' });
          setCreatedTest(null);
        }}
        className="w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Create Another Test
      </button>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Configure a test — questions are auto-selected from the question bank.</p>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Test Title *</label>
          <input value={form.title} onChange={f('title')} placeholder="e.g. SS3 Chemistry Mid-Term"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assign to Class</label>
            <select value={form.class_id} onChange={f('class_id')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white">
              <option value="">All / Unassigned</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject</label>
            <select value={form.subject_id} onChange={f('subject_id')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white">
              <option value="">Any subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Difficulty</label>
            <select value={form.difficulty} onChange={f('difficulty')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white">
              <option value="mixed">Mixed</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Questions</label>
            <input type="number" min={5} max={40} value={form.question_count} onChange={f('question_count')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Time Limit (mins)</label>
            <input type="number" min={5} max={180} value={form.time_limit_minutes} onChange={f('time_limit_minutes')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Due Date (optional)</label>
            <input type="date" value={form.due_date} onChange={f('due_date')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
        </div>
      </div>

      <button onClick={create} disabled={creating || !form.title.trim()}
        className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
        {creating ? <Loader2 size={16} className="animate-spin" /> : <PenTool size={16} />}
        {creating ? 'Creating Test…' : 'Create Test'}
      </button>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function TeacherDashboard() {
  const { user }                           = useAuth();
  const navigate                           = useNavigate();
  const [activeTab,        setActiveTab]   = useState('classes');
  const [selectedClass,  setSelectedClass] = useState(null);

  // null  = still loading
  // []    = loaded, none assigned
  // [...] = loaded, has assignments
  const [assignedSubjects, setAssignedSubjects] = useState(null);

  const tabs = [
    { id: 'classes',     label: 'My Classes',  icon: Users     },
    { id: 'analytics',   label: 'Analytics',   icon: BarChart2 },
    { id: 'testbuilder', label: 'Test Builder', icon: PenTool   },
  ];

  const handleViewAnalytics = (cls) => {
    setSelectedClass(cls);
    setActiveTab('analytics');
  };

  // Load the teacher's assigned subjects from the server.
  // The API returns { success: true, data: [...] } — we unpack .data.
  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => {
        // Handle both shapes: raw array or { data: [...] }
        const list = Array.isArray(r) ? r : (r.data ?? []);
        setAssignedSubjects(list);
      })
      .catch(() => setAssignedSubjects([])); // treat errors as "none assigned"
  }, []);

  const subjectsLoading = assignedSubjects === null;
  const hasSubjects     = Array.isArray(assignedSubjects) && assignedSubjects.length > 0;

  const displayName = getDisplayName(user);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* ── Header ── */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-white/50 text-xs mb-1">Teacher Dashboard</p>
            <h1 className="text-white text-xl font-bold">
              Welcome back, {displayName} 👋
            </h1>
          </div>
          {hasSubjects && (
            <Link
              to="/teacher/resources"
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shrink-0 mt-1"
            >
              <Upload size={14} />
              Upload Resources
            </Link>
          )}
        </div>
      </div>

      {/* ── Subject assignment status banner ────────────────────────────────── */}
      {/* Only render once loading is complete — prevents flash of amber banner */}
      {!subjectsLoading && (
        <div className={`border-b px-4 py-3 ${
          hasSubjects ? 'bg-teal-50 border-teal-100' : 'bg-amber-50 border-amber-100'
        }`}>
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            {hasSubjects ? (
              <>
                <CheckCircle size={16} className="text-teal-600 shrink-0" />
                <p className="text-sm text-teal-800">
                  <span className="font-semibold">Subjects assigned:</span>{' '}
                  {assignedSubjects
                    .map(s =>
                      `${s.icon_emoji ? s.icon_emoji + ' ' : ''}${s.name}${s.exam_board_code ? ` (${s.exam_board_code})` : ''}`
                    )
                    .join(' · ')}
                </p>
                <Link
                  to="/teacher/resources"
                  className="ml-auto text-xs font-semibold text-teal-700 hover:text-teal-900 shrink-0 flex items-center gap-1"
                >
                  <BookOpen size={12} /> Manage Resources →
                </Link>
              </>
            ) : (
              <>
                <AlertCircle size={16} className="text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">Awaiting subject assignment.</span>{' '}
                  The admin needs to assign you subjects and a curriculum before you can upload resources or create content.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-gray-100 sticky top-14 z-30">
        <div className="max-w-4xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === t.id
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'classes'     && <ClassesTab onViewAnalytics={handleViewAnalytics} />}
        {activeTab === 'analytics'   && <AnalyticsTab cls={selectedClass} />}
        {activeTab === 'testbuilder' && <TestBuilderTab />}
      </div>
    </div>
  );
}
