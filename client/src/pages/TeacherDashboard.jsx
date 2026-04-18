import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, Outlet } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Users, Plus, Copy, CheckCircle, Loader2, AlertTriangle,
  BarChart2, Zap, X, ChevronRight, Send, PenTool,
  BookOpen, Upload, AlertCircle, TrendingUp, TrendingDown,
  Clock, Target, ChevronDown,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import { useAuth } from '../context/AuthContext';

/* ================= HELPERS ================= */

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
      {type === 'success'
        ? <CheckCircle size={14} className="text-teal-400" />
        : <AlertTriangle size={14} />}
      {msg}
      <button onClick={onClose}>
        <X size={13} className="opacity-60" />
      </button>
    </div>
  );
}

/* ================= CLASSES TAB ================= */

function ClassesTab({ onViewAnalytics }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(null);
  const [toast, setToast] = useState(null);

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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {classes.length} class{classes.length !== 1 ? 'es' : ''}
        </p>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          <Plus size={14} /> New Class
        </button>
      </div>

      {showCreate && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Class name"
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />

          <button onClick={createClass} disabled={creating}>
            {creating ? <Loader2 size={14} /> : 'Create'}
          </button>

          <button onClick={() => setShowCreate(false)}>
            <X size={16} />
          </button>
        </div>
      )}

      {classes.map(cls => (
        <div key={cls.id} className="bg-white rounded-2xl border p-5">
          <p className="font-semibold">{cls.name}</p>

          <button onClick={() => onViewAnalytics(cls)}>
            View Analytics
          </button>

          <button onClick={() => copyCode(cls.join_code)}>
            {copied === cls.join_code ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      ))}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ================= ANALYTICS TAB ================= */

function AnalyticsTab() {
  const [classes,       setClasses]       = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [analytics,     setAnalytics]     = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [loadingClasses,setLoadingClasses]= useState(true);

  useEffect(() => {
    api.get('/teacher/classes')
      .then(r => {
        const cls = Array.isArray(r?.data) ? r.data : [];
        setClasses(cls);
        if (cls.length > 0) setSelectedClass(cls[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    api.get(`/teacher/class/${selectedClass}/analytics`)
      .then(r => setAnalytics(r?.data || null))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [selectedClass]);

  const accColor = (pct) => {
    if (!pct && pct !== 0) return 'text-gray-400';
    if (pct >= 70) return 'text-green-600';
    if (pct >= 40) return 'text-amber-600';
    return 'text-red-500';
  };

  if (loadingClasses) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-teal-400" /></div>;

  if (classes.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium">No classes yet.</p>
      <p className="text-xs mt-1">Create a class first to see analytics.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Class selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-600">Class:</label>
        <div className="relative">
          <select
            value={selectedClass || ''}
            onChange={e => setSelectedClass(e.target.value)}
            className="appearance-none border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
          >
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.student_count ?? 0} students)</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-teal-400" /></div>
      ) : !analytics ? (
        <div className="text-center py-8 text-gray-400 text-sm">No analytics data available yet.</div>
      ) : analytics.students?.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">No students in this class yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 font-semibold uppercase">
              <tr>
                <th className="text-left px-4 py-3">Student</th>
                <th className="text-center px-4 py-3">Accuracy</th>
                <th className="text-center px-4 py-3">Attempts</th>
                <th className="text-center px-4 py-3">Streak</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Last Active</th>
                <th className="text-center px-4 py-3">Nudge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {analytics.students.map(s => (
                <tr key={s.id} className="bg-white hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[140px]">{s.email}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold text-base ${accColor(s.accuracy_pct)}`}>
                      {s.accuracy_pct != null ? `${s.accuracy_pct}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{s.attempts ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-amber-500 font-semibold">{s.streak ?? 0}🔥</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-400">
                    {s.last_active ? new Date(s.last_active).toLocaleDateString('en-NG', { day:'2-digit', month:'short' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <NudgeButton studentId={s.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NudgeButton({ studentId }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const nudge = async () => {
    setBusy(true);
    try {
      await api.post(`/teacher/nudge/${studentId}`);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch {}
    finally { setBusy(false); }
  };
  return (
    <button onClick={nudge} disabled={busy || sent}
      title="Send nudge"
      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${
        sent ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 hover:bg-teal-50 hover:text-teal-600'
      }`}>
      {busy ? <Loader2 size={10} className="animate-spin" /> : sent ? '✓ Sent' : <Send size={10} />}
    </button>
  );
}

/* ================= TEST BUILDER TAB ================= */

function TestBuilderTab() {
  const [tests,       setTests]       = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [subjects,    setSubjects]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [creating,    setCreating]    = useState(false);
  const [publishing,  setPublishing]  = useState(null);
  const [assigning,   setAssigning]   = useState(null);  // test id being assigned
  const [assignClass, setAssignClass] = useState('');
  const [toast,       setToast]       = useState(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [form,        setForm]        = useState({ title: '', duration_minutes: 60, total_marks: 100 });

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/teacher/tests').catch(() => ({ data: [] })),
      api.get('/teacher/classes').catch(() => ({ data: [] })),
      api.get('/teacher/my-subjects').catch(() => ({ data: [] })),
    ]).then(([t, c, s]) => {
      setTests(Array.isArray(t?.data) ? t.data : []);
      setClasses(Array.isArray(c?.data) ? c.data : []);
      setSubjects(Array.isArray(s?.data) ? s.data : []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const createTest = async () => {
    if (!form.title.trim()) { showToast('Title is required.', 'error'); return; }
    setCreating(true);
    try {
      await api.post('/teacher/tests', form);
      showToast('Test created!');
      setForm({ title: '', duration_minutes: 60, total_marks: 100 });
      setShowCreate(false);
      load();
    } catch (err) {
      showToast(err?.error || 'Failed to create test.', 'error');
    } finally { setCreating(false); }
  };

  const publishTest = async (id) => {
    setPublishing(id);
    try {
      await api.put(`/teacher/tests/${id}/publish`);
      showToast('Test published — students can now take it.');
      load();
    } catch (err) {
      showToast(err?.error || 'Publish failed.', 'error');
    } finally { setPublishing(null); }
  };

  const assignTest = async (testId) => {
    if (!assignClass) { showToast('Select a class first.', 'error'); return; }
    try {
      await api.post(`/teacher/tests/${testId}/assign`, { class_id: assignClass });
      showToast('Test assigned to class!');
      setAssigning(null);
      setAssignClass('');
    } catch (err) {
      showToast(err?.error || 'Assignment failed.', 'error');
    }
  };

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300';

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-teal-400" /></div>;

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white
          ${toast.type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle size={14} className="text-teal-400" /> : <AlertTriangle size={14} />}
          {toast.msg}
          <button onClick={() => setToast(null)}><X size={13} className="opacity-60" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Test Builder</h3>
          <p className="text-xs text-gray-400 mt-0.5">Create tests and assign them to your classes</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
          <Plus size={14} /> New Test
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-teal-800">New Test</p>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Test title *" className={inp} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Duration (minutes)</label>
              <input type="number" min={5} value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))}
                className={inp} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Total Marks</label>
              <input type="number" min={1} value={form.total_marks}
                onChange={e => setForm(f => ({ ...f, total_marks: parseInt(e.target.value) || 100 }))}
                className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createTest} disabled={creating}
              className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl flex items-center justify-center gap-2">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Test
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tests list */}
      {tests.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl text-gray-400">
          <PenTool size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No tests yet. Click "New Test" to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tests.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{t.title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      t.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {t.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t.duration_minutes}min · {t.total_marks} marks · {t.question_count ?? 0} questions
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!t.is_published && (
                    <button onClick={() => publishTest(t.id)} disabled={publishing === t.id}
                      className="text-xs px-3 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 font-semibold rounded-lg border border-green-200 transition-colors">
                      {publishing === t.id ? <Loader2 size={12} className="animate-spin" /> : 'Publish'}
                    </button>
                  )}
                  <button onClick={() => setAssigning(assigning === t.id ? null : t.id)}
                    className={`text-xs px-3 py-1.5 font-semibold rounded-lg border transition-colors ${
                      assigning === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                    }`}>
                    Assign
                  </button>
                </div>
              </div>

              {/* Assign to class panel */}
              {assigning === t.id && (
                <div className="border-t border-gray-100 bg-indigo-50 px-4 py-3 flex items-center gap-3">
                  <select value={assignClass} onChange={e => setAssignClass(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => assignTest(t.id)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                    Assign
                  </button>
                  <button onClick={() => setAssigning(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeacherDashboard() {

  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('classes');
  const [selectedClass, setSelectedClass] = useState(null);

  const [assignedSubjects, setAssignedSubjects] = useState(null);

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setAssignedSubjects(r.data ?? []))
      .catch(() => setAssignedSubjects([]));
  }, []);

  const subjectsLoading = assignedSubjects === null;
  const hasSubjects = assignedSubjects?.length > 0;

  const displayName = getDisplayName(user);

  const tabs = [
    { id: 'classes', label: 'My Classes', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'testbuilder', label: 'Test Builder', icon: PenTool },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      <TopNav />

      {/* HEADER */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex justify-between">
          <div>
            <p className="text-white/50 text-xs">Teacher Dashboard</p>
            <h1 className="text-white text-xl font-bold">
              Welcome back, {displayName} 👋
            </h1>
          </div>

          {hasSubjects && (
            <Link to="/teacher/resources" className="bg-teal-500 text-white px-4 py-2 rounded-xl">
              Upload Resources
            </Link>
          )}
        </div>
      </div>

      {/* SUBJECT BANNER */}
      {!subjectsLoading && (
        <div className="px-4 py-3 border-b">
          {hasSubjects ? (
            <p className="text-sm text-teal-700">
              Subjects assigned: {assignedSubjects.map(s => s.name).join(', ')}
            </p>
          ) : (
            <p className="text-sm text-amber-700">
              Awaiting subject assignment
            </p>
          )}
        </div>
      )}

      {/* TABS */}
      <div className="bg-white border-b sticky top-14">
        <div className="max-w-4xl mx-auto flex gap-2 px-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm ${
                activeTab === t.id ? 'text-teal-600' : 'text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        <Outlet />

        {activeTab === 'classes'     && <ClassesTab onViewAnalytics={setSelectedClass} />}
        {activeTab === 'analytics'   && <AnalyticsTab />}
        {activeTab === 'testbuilder' && <TestBuilderTab />}

      </div>
    </div>
  );
}
