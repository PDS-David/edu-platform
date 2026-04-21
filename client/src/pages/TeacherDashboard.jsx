import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, Outlet } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Users, Plus, Copy, CheckCircle, Loader2, AlertTriangle,
  BarChart2, X, PenTool, BookOpen, Upload, Send,
  ChevronDown, AlertCircle, ChevronRight,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import { useAuth } from '../context/AuthContext';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getDisplayName(u) {
  if (!u) return 'Teacher';
  const f = u.first_name || u.firstName;
  if (f?.trim()) return f.trim();
  return u.last_name || u.lastName || u.name?.split(' ')[0] || u.email?.split('@')[0] || 'Teacher';
}
const accColor = p => !p && p !== 0 ? 'text-white/30' : p >= 70 ? 'text-emerald-400' : p >= 40 ? 'text-amber-400' : 'text-red-400';
const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-NG',{day:'2-digit',month:'short',timeZone:'UTC'}) : '—';

/* ── Toast ───────────────────────────────────────────────────────────────── */
function Toast({ msg, type, onClose }) {
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3 rounded-lg shadow-2xl text-sm font-semibold text-white border ${type === 'success' ? 'bg-[#1a1a1b] border-emerald-500/30' : 'bg-red-900/90 border-red-500/30'}`}>
      {type === 'success' ? <CheckCircle size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-red-400" />}
      {msg}
      <button onClick={onClose}><X size={13} className="opacity-40 hover:opacity-80" /></button>
    </div>
  );
}

/* ── Input style ─────────────────────────────────────────────────────────── */
const inp = 'w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30';

/* ── Classes Tab ─────────────────────────────────────────────────────────── */
function ClassesTab({ onViewAnalytics }) {
  const [classes,    setClasses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [creating,   setCreating]   = useState(false);
  const [copied,     setCopied]     = useState(null);
  const [toast,      setToast]      = useState(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(() => {
    setLoading(true);
    api.get('/teacher/classes').then(r => setClasses(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const createClass = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/teacher/classes', { name: newName.trim() });
      setNewName(''); setShowCreate(false); showToast('Class created!'); load();
    } catch (err) { showToast(err?.error || 'Failed to create class.', 'error'); }
    finally { setCreating(false); }
  };

  const copyCode = code => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code); setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-white/40">{classes.length} CLASS{classes.length !== 1 ? 'ES' : ''}</p>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors">
          <Plus size={12} /> New Class
        </button>
      </div>

      {showCreate && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createClass()}
            placeholder="e.g. WAEC Biology 2025" autoFocus className={inp + ' flex-1'} />
          <button onClick={createClass} disabled={creating || !newName.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-40">
            {creating ? <Loader2 size={13} className="animate-spin" /> : 'Create'}
          </button>
          <button onClick={() => { setShowCreate(false); setNewName(''); }} className="text-white/30 hover:text-white/70 px-1">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-white/30" /></div>
      ) : classes.length === 0 && !showCreate ? (
        <div className="text-center py-14 border border-dashed border-white/[0.08] rounded-lg">
          <Users size={28} className="mx-auto mb-2 text-white/20" />
          <p className="text-sm text-white/30">No classes yet</p>
          <p className="text-xs text-white/20 mt-1">Create a class to start managing students</p>
        </div>
      ) : (
        <div className="space-y-2">
          {classes.map(cls => (
            <div key={cls.id} className="bg-[#1a1a1b] border border-white/[0.06] rounded-lg p-4 hover:border-white/[0.12] transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white/90">{cls.name}</p>
                  <p className="text-xs text-white/30 mt-0.5 font-mono">
                    {cls.student_count ?? 0} student{cls.student_count !== 1 ? 's' : ''} · {fmtDate(cls.created_at)}
                  </p>
                </div>
                <button onClick={() => onViewAnalytics(cls)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 px-3 py-1.5 rounded-md font-semibold transition-colors">
                  <BarChart2 size={12} /> Manage
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-white/30 font-mono">JOIN CODE</span>
                <span className="font-mono font-bold text-emerald-400 tracking-widest text-sm">{cls.join_code}</span>
                <button onClick={() => copyCode(cls.join_code)} className="text-white/30 hover:text-white transition-colors ml-1" title="Copy">
                  {copied === cls.join_code ? <CheckCircle size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ── Analytics Tab ───────────────────────────────────────────────────────── */
function AnalyticsTab() {
  const [classes,        setClasses]        = useState([]);
  const [selectedClass,  setSelectedClass]  = useState(null);
  const [analytics,      setAnalytics]      = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);

  useEffect(() => {
    api.get('/teacher/classes').then(r => {
      const cls = Array.isArray(r?.data) ? r.data : [];
      setClasses(cls);
      if (cls.length > 0) setSelectedClass(cls[0].id);
    }).catch(() => {}).finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    api.get(`/teacher/class/${selectedClass}/analytics`)
      .then(r => setAnalytics(r?.data || null))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [selectedClass]);

  if (loadingClasses) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-white/30" /></div>;

  if (classes.length === 0) return (
    <div className="text-center py-16 border border-dashed border-white/[0.08] rounded-lg">
      <BarChart2 size={28} className="mx-auto mb-2 text-white/20" />
      <p className="text-sm text-white/30">No classes yet — create one first.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/40 font-mono">CLASS</span>
        <div className="relative">
          <select value={selectedClass || ''} onChange={e => setSelectedClass(e.target.value)}
            className="appearance-none bg-[#1a1a1b] border border-white/[0.10] rounded-lg px-3 py-2 pr-7 text-sm text-white/80 focus:outline-none focus:border-blue-500/50">
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.student_count ?? 0})</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-3 text-white/30 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-white/30" /></div>
      ) : !analytics || analytics.students?.length === 0 ? (
        <div className="text-center py-8 text-white/30 text-sm border border-dashed border-white/[0.08] rounded-lg">No student data yet.</div>
      ) : (
        <div className="bg-[#1a1a1b] border border-white/[0.06] rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 text-[10px] font-mono text-white/30 uppercase px-4 py-2.5 border-b border-white/[0.06]">
            <span className="col-span-4">Student</span>
            <span className="col-span-2 text-center">Accuracy</span>
            <span className="col-span-2 text-center">Attempts</span>
            <span className="col-span-2 text-center hidden sm:block">Streak</span>
            <span className="col-span-2 text-center">Nudge</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {analytics.students.map(s => (
              <div key={s.id} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="col-span-4 min-w-0">
                  <p className="text-sm font-medium text-white/80 truncate">{s.name}</p>
                  <p className="text-xs text-white/30 truncate">{s.email}</p>
                </div>
                <div className="col-span-2 text-center">
                  <span className={`font-mono font-bold text-sm ${accColor(s.accuracy_pct)}`}>
                    {s.accuracy_pct != null ? `${s.accuracy_pct}%` : '—'}
                  </span>
                </div>
                <div className="col-span-2 text-center text-sm text-white/50 font-mono">{s.attempts ?? 0}</div>
                <div className="col-span-2 text-center hidden sm:block text-sm text-amber-400 font-mono">{s.streak ?? 0}</div>
                <div className="col-span-2 text-center">
                  <NudgeButton studentId={s.id} />
                </div>
              </div>
            ))}
          </div>
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
    try { await api.post(`/teacher/nudge/${studentId}`); setSent(true); setTimeout(() => setSent(false), 3000); }
    catch {} finally { setBusy(false); }
  };
  return (
    <button onClick={nudge} disabled={busy || sent}
      className={`text-xs px-2.5 py-1 rounded border font-semibold transition-colors ${sent ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'border-white/[0.10] text-white/40 hover:text-white/70 hover:border-white/20'}`}>
      {busy ? <Loader2 size={10} className="animate-spin" /> : sent ? '✓' : <Send size={10} />}
    </button>
  );
}

/* ── Test Builder Tab ────────────────────────────────────────────────────── */
function TestBuilderTab() {
  const navigate = useNavigate();
  const [tests,      setTests]      = useState([]);
  const [classes,    setClasses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [publishing, setPublishing] = useState(null);
  const [assigning,  setAssigning]  = useState(null);
  const [assignClass,setAssignClass]= useState('');
  const [toast,      setToast]      = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form,       setForm]       = useState({ title: '', duration_minutes: 60, total_marks: 100 });

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/teacher/tests').catch(() => ({ data: [] })),
      api.get('/teacher/classes').catch(() => ({ data: [] })),
    ]).then(([t, c]) => {
      setTests(Array.isArray(t?.data) ? t.data : []);
      setClasses(Array.isArray(c?.data) ? c.data : []);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const createTest = async () => {
    if (!form.title.trim()) { showToast('Title is required.', 'error'); return; }
    setCreating(true);
    try { await api.post('/teacher/tests', form); showToast('Test created!'); setForm({ title: '', duration_minutes: 60, total_marks: 100 }); setShowCreate(false); load(); }
    catch (err) { showToast(err?.error || 'Failed.', 'error'); }
    finally { setCreating(false); }
  };

  const publishTest = async id => {
    setPublishing(id);
    try { await api.put(`/teacher/tests/${id}/publish`); showToast('Test published!'); load(); }
    catch (err) { showToast(err?.error || 'Publish failed.', 'error'); }
    finally { setPublishing(null); }
  };

  const assignTest = async testId => {
    if (!assignClass) { showToast('Select a class first.', 'error'); return; }
    try { await api.post(`/teacher/tests/${testId}/assign`, { class_id: assignClass }); showToast('Assigned!'); setAssigning(null); setAssignClass(''); }
    catch (err) { showToast(err?.error || 'Failed.', 'error'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-white/30" /></div>;

  return (
    <div className="space-y-4">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Info card */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
        <p className="text-xs font-mono text-blue-400 uppercase tracking-widest">What is Test Builder?</p>
        <p className="text-sm text-white/70">Create custom assessments from your subject's question bank. Set duration and marks, then push to a class or individual student.</p>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={() => navigate('/teacher/content')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md">
            <PenTool size={12} /> Open Full Test Builder
          </button>
          <button onClick={() => navigate('/teacher/questions/add')}
            className="flex items-center gap-1.5 border border-white/[0.10] text-white/60 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-md">
            <Plus size={12} /> Add Question
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-white/40">{tests.length} TEST{tests.length !== 1 ? 'S' : ''}</p>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md">
          <Plus size={12} /> New Test
        </button>
      </div>

      {showCreate && (
        <div className="bg-white/[0.03] border border-white/[0.10] rounded-lg p-4 space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Test title *" className={inp} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block font-mono">DURATION (min)</label>
              <input type="number" min={5} value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))}
                className={inp} />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block font-mono">TOTAL MARKS</label>
              <input type="number" min={1} value={form.total_marks}
                onChange={e => setForm(f => ({ ...f, total_marks: parseInt(e.target.value) || 100 }))}
                className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createTest} disabled={creating}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-md flex items-center justify-center gap-2">
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-white/[0.10] rounded-md text-xs text-white/40 hover:text-white/70">Cancel</button>
          </div>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-white/[0.08] rounded-lg">
          <PenTool size={24} className="mx-auto mb-2 text-white/20" />
          <p className="text-sm text-white/30">No tests yet — click "New Test" to start.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tests.map(t => (
            <div key={t.id} className="bg-[#1a1a1b] border border-white/[0.06] rounded-lg overflow-hidden">
              <div className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white/80">{t.title}</p>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${t.is_published ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-white/[0.04] text-white/30 border-white/[0.10]'}`}>
                      {t.is_published ? 'LIVE' : 'DRAFT'}
                    </span>
                  </div>
                  <p className="text-xs text-white/30 mt-0.5 font-mono">{t.duration_minutes}min · {t.total_marks}pts · {t.question_count ?? 0}q</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!t.is_published && (
                    <button onClick={() => publishTest(t.id)} disabled={publishing === t.id}
                      className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-semibold rounded-md border border-emerald-500/30">
                      {publishing === t.id ? <Loader2 size={12} className="animate-spin" /> : 'Publish'}
                    </button>
                  )}
                  <button onClick={() => setAssigning(assigning === t.id ? null : t.id)}
                    className="text-xs px-3 py-1.5 border border-white/[0.10] text-white/50 hover:text-white hover:border-white/20 font-semibold rounded-md">
                    Assign
                  </button>
                </div>
              </div>
              {assigning === t.id && (
                <div className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center gap-2">
                  <select value={assignClass} onChange={e => setAssignClass(e.target.value)}
                    className="flex-1 bg-white/[0.04] border border-white/[0.10] rounded-md px-3 py-2 text-xs text-white/70 focus:outline-none">
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => assignTest(t.id)} className="bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-md">Assign</button>
                  <button onClick={() => setAssigning(null)} className="text-white/30 hover:text-white/60"><X size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────────────────── */
export default function TeacherDashboard() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [activeTab,        setActiveTab]        = useState('classes');
  const [assignedSubjects, setAssignedSubjects] = useState(null);

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setAssignedSubjects(r.data ?? []))
      .catch(() => setAssignedSubjects([]));
  }, []);

  const displayName     = getDisplayName(user);
  const subjectsLoading = assignedSubjects === null;
  const hasSubjects     = (assignedSubjects?.length ?? 0) > 0;

  const tabs = [
    { id: 'classes',     label: 'Classes',     icon: Users    },
    { id: 'analytics',   label: 'Analytics',   icon: BarChart2},
    { id: 'testbuilder', label: 'Tests',        icon: PenTool  },
  ];

  /* Group assigned subjects by exam board for display */
  const byBoard = {};
  (assignedSubjects || []).forEach(s => {
    const b = s.exam_board_name || s.exam_board_code || 'General';
    if (!byBoard[b]) byBoard[b] = [];
    byBoard[b].push(s);
  });

  return (
    <div className="min-h-screen bg-[#0f0f10] text-white">
      <TopNav />

      {/* Page header */}
      <div className="border-b border-white/[0.06] px-4 md:px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-white/40 text-xs font-mono uppercase tracking-widest mb-1">Teacher Console</p>
            <h1 className="text-xl font-bold text-white">Welcome back, {displayName}</h1>
          </div>
          <div className="flex gap-2">
            {hasSubjects && (
              <Link to="/teacher/resources"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] text-white/70 hover:text-white text-xs font-medium transition-colors">
                <Upload size={13} /> Resources
              </Link>
            )}
            <Link to="/teacher/questions/add"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
              <Plus size={13} /> Add Question
            </Link>
          </div>
        </div>
      </div>

      {/* Subject assignments bar */}
      {!subjectsLoading && (
        <div className={`border-b px-4 md:px-8 py-2.5 ${hasSubjects ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-amber-500/20 bg-amber-500/[0.04]'}`}>
          <div className="max-w-5xl mx-auto">
            {hasSubjects ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-mono text-emerald-400/70 uppercase">Assigned</span>
                {Object.entries(byBoard).map(([board, subs]) => (
                  <span key={board} className="flex items-center gap-1.5">
                    <span className="text-xs text-white/30 font-mono">{board}:</span>
                    {subs.map(s => (
                      <span key={s.id} className="text-xs bg-white/[0.06] border border-white/[0.08] text-white/60 px-2 py-0.5 rounded font-medium">{s.name}</span>
                    ))}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle size={13} className="text-amber-400 shrink-0" />
                <p className="text-xs text-amber-400/80">No subjects assigned — contact admin to get assigned to exam types and subjects</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-white/[0.06] px-4 md:px-8 sticky top-12 bg-[#0f0f10] z-10">
        <div className="max-w-5xl mx-auto flex">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-white/40 hover:text-white/70'}`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
        <Outlet />
        {activeTab === 'classes'     && <ClassesTab onViewAnalytics={() => {}} />}
        {activeTab === 'analytics'   && <AnalyticsTab />}
        {activeTab === 'testbuilder' && <TestBuilderTab />}
      </div>
    </div>
  );
}
