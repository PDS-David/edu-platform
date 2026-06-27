import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Users, Plus, CheckCircle, Loader2, AlertTriangle,
  BarChart2, X, PenTool, BookOpen, Upload, Send, FileText,
  ChevronDown, AlertCircle, Search, UserPlus, Settings, Check, Trash2, Pencil,
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
const accColor = p => !p && p !== 0 ? 'text-gray-400' : p >= 70 ? 'text-emerald-500' : p >= 40 ? 'text-amber-500' : 'text-red-500';
const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '—';

/* ── Toast ───────────────────────────────────────────────────────────────── */
function Toast({ msg, type, onClose }) {
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold border ${
      type === 'success' ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white border-red-200 text-red-700'
    }`}>
      {type === 'success' ? <CheckCircle size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-red-500" />}
      {msg}
      <button onClick={onClose}><X size={13} className="opacity-40 hover:opacity-80" /></button>
    </div>
  );
}

const inp = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200';

/* ── Student Picker (shared by Create + Manage) ──────────────────────────── */
// Searchable, multi-select list of all active students. Controlled component:
// the parent owns the Set of selected ids.
function StudentPicker({ selected, onChange, label = 'Students' }) {
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');

  // Debounced server-side search so big rosters stay snappy.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api.get('/teacher/students-directory', { params: query.trim() ? { q: query.trim() } : {} })
        .then(r => { if (!cancelled) setStudents(Array.isArray(r?.data) ? r.data : []); })
        .catch(() => { if (!cancelled) setStudents([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const visibleIds = students.map(s => s.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const toggleAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
    else visibleIds.forEach(id => next.add(id));
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">
          {label} <span className="text-gray-400 font-mono">· {selected.size} selected</span>
        </p>
        {students.length > 0 && (
          <button type="button" onClick={toggleAllVisible}
            className="text-[11px] font-semibold text-violet-600 hover:text-violet-700">
            {allVisibleSelected ? 'Clear visible' : 'Select visible'}
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-3 text-gray-300" />
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search students by name or email"
          className={inp + ' pl-8'} />
      </div>

      <div className="border border-gray-200 rounded-xl bg-white max-h-64 overflow-y-auto divide-y divide-gray-50">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-violet-300" /></div>
        ) : students.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">
            {query ? 'No students match that search.' : 'No students found.'}
          </p>
        ) : students.map(s => {
          const checked = selected.has(s.id);
          const name = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email;
          return (
            <label key={s.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-violet-50/40' : ''}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(s.id)}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{name}</p>
                <p className="text-[11px] text-gray-400 truncate font-mono">{s.email}</p>
              </div>
              {checked && <CheckCircle size={13} className="text-violet-500 shrink-0" />}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ── Manage Class Modal ──────────────────────────────────────────────────── */
function ManageClassModal({ cls, onClose, onSaved, showToast }) {
  const [selected, setSelected] = useState(new Set());
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/teacher/class/${cls.id}/members`)
      .then(r => setSelected(new Set((r?.data || []).map(s => s.id))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cls.id]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/teacher/class/${cls.id}/members`, { student_ids: [...selected] });
      showToast(`Updated "${cls.name}" — ${selected.size} student${selected.size !== 1 ? 's' : ''}.`);
      onSaved();
      onClose();
    } catch (err) {
      showToast(err?.message || 'Failed to update members.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Manage students</h3>
            <p className="text-xs text-gray-500 mt-0.5">{cls.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-violet-300" /></div>
        ) : (
          <StudentPicker selected={selected} onChange={setSelected} />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
          <button onClick={save} disabled={saving || loading}
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40 flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Classes Tab ─────────────────────────────────────────────────────────── */
function ClassesTab() {
  const [classes,    setClasses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newSelected,setNewSelected]= useState(new Set());
  const [creating,   setCreating]   = useState(false);
  const [managing,   setManaging]   = useState(null);
  const [toast,      setToast]      = useState(null);

  // Rename state
  const [renamingId,  setRenamingId]  = useState(null);   // class id being renamed
  const [renameVal,   setRenameVal]   = useState('');      // current input value
  const [renaming,    setRenaming]    = useState(false);   // saving in-flight

  // Delete state
  const [confirmDel,  setConfirmDel]  = useState(null);   // class object to confirm-delete
  const [deleting,    setDeleting]    = useState(false);   // delete in-flight

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(() => {
    setLoading(true);
    api.get('/teacher/classes').then(r => setClasses(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const startRename = (cls) => { setRenamingId(cls.id); setRenameVal(cls.name); };
  const cancelRename = () => { setRenamingId(null); setRenameVal(''); };

  const saveRename = async (cls) => {
    if (!renameVal.trim() || renameVal.trim() === cls.name) { cancelRename(); return; }
    setRenaming(true);
    try {
      await api.patch(`/teacher/classes/${cls.id}`, { name: renameVal.trim() });
      showToast('Class renamed.');
      cancelRename();
      load();
    } catch (err) {
      showToast(err?.message || 'Failed to rename class.', 'error');
    } finally {
      setRenaming(false);
    }
  };

  const deleteClass = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await api.delete(`/teacher/classes/${confirmDel.id}`);
      showToast('Class deleted.');
      setConfirmDel(null);
      load();
    } catch (err) {
      showToast(err?.message || 'Failed to delete class.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const createClass = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/teacher/classes', {
        name: newName.trim(),
        student_ids: [...newSelected],
      });
      setNewName('');
      setNewSelected(new Set());
      setShowCreate(false);
      showToast(`Class created with ${newSelected.size} student${newSelected.size !== 1 ? 's' : ''}.`);
      load();
    } catch (err) {
      showToast(err?.message || 'Failed to create class.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const cancelCreate = () => {
    setShowCreate(false);
    setNewName('');
    setNewSelected(new Set());
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-gray-400">{classes.length} CLASS{classes.length !== 1 ? 'ES' : ''}</p>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={12} /> New Class
        </button>
      </div>

      {showCreate && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Class name</p>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="e.g. WAEC Biology 2025" autoFocus className={inp} />
          </div>
          <StudentPicker selected={newSelected} onChange={setNewSelected} label="Add students" />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={cancelCreate}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
            <button onClick={createClass} disabled={creating || !newName.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40 flex items-center gap-1.5">
              {creating ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              Create class ({newSelected.size})
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-violet-300" /></div>
      ) : classes.length === 0 && !showCreate ? (
        <div className="text-center py-14 border border-dashed border-gray-200 rounded-xl">
          <Users size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-400">No classes yet</p>
          <p className="text-xs text-gray-300 mt-1">Create a class and add students from the directory.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {classes.map(cls => (
            <div key={cls.id} className="bg-white border border-gray-100 rounded-xl p-4 hover:border-violet-100 transition-colors shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {renamingId === cls.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveRename(cls); if (e.key === 'Escape') cancelRename(); }}
                        autoFocus
                        className="flex-1 text-sm font-semibold border border-violet-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                      <button onClick={() => saveRename(cls)} disabled={renaming}
                        className="text-violet-600 hover:text-violet-800 disabled:opacity-40">
                        {renaming ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={cancelRename} className="text-gray-400 hover:text-gray-600">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-gray-800 truncate">{cls.name}</p>
                      <button onClick={() => startRename(cls)} title="Rename class"
                        className="text-gray-300 hover:text-violet-500 flex-shrink-0">
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">
                    {cls.student_count ?? 0} student{cls.student_count !== 1 ? 's' : ''} · {fmtDate(cls.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setManaging(cls)}
                    className="flex items-center gap-1.5 text-xs text-violet-600 border border-violet-200 hover:bg-violet-50 px-3 py-1.5 rounded-lg font-semibold transition-colors">
                    <Settings size={12} /> Manage
                  </button>
                  <button onClick={() => setConfirmDel(cls)} title="Delete class"
                    className="text-red-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {managing && (
        <ManageClassModal
          cls={managing}
          onClose={() => setManaging(null)}
          onSaved={load}
          showToast={showToast}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-1">Delete class?</h3>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-semibold text-gray-800">"{confirmDel.name}"</span> and all its student memberships will be permanently removed.
            </p>
            <p className="text-xs text-amber-600 mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDel(null)}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl">
                Cancel
              </button>
              <button onClick={deleteClass} disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-40 flex items-center gap-2">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
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
  const [drillStudent,   setDrillStudent]   = useState(null); // { id, name }
  const [drillData,      setDrillData]      = useState([]);
  const [drillLoading,   setDrillLoading]   = useState(false);
  // D6: subject-assigned students when teacher has no classes
  const [subjectStudents,    setSubjectStudents]    = useState([]);
  const [subjectStudentsLoaded, setSubjectStudentsLoaded] = useState(false);

  useEffect(() => {
    api.get('/teacher/classes').then(r => {
      const cls = Array.isArray(r?.data) ? r.data : [];
      setClasses(cls);
      if (cls.length > 0) {
        setSelectedClass(cls[0].id);
      } else {
        // D6: no classes — fetch students via subject assignments instead
        api.get('/teacher/students')
          .then(r2 => {
            const list = Array.isArray(r2?.data) ? r2.data : [];
            // Build analytics rows from basic user data
            const rows = list.map(u => ({
              id:           u.id,
              name:         `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
              email:        u.email,
              accuracy_pct: null,
              attempts:     0,
              streak:       0,
            }));
            setSubjectStudents(rows);
          })
          .catch(() => setSubjectStudents([]))
          .finally(() => setSubjectStudentsLoaded(true));
      }
    }).catch(() => {}).finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    setDrillStudent(null);
    api.get(`/teacher/class/${selectedClass}/analytics`)
      .then(r => setAnalytics(r?.data || null))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [selectedClass]);

  const openDrill = (s) => {
    if (drillStudent?.id === s.id) { setDrillStudent(null); setDrillData([]); return; }
    setDrillStudent({ id: s.id, name: s.name });
    setDrillLoading(true);
    api.get(`/analytics/student/${s.id}/topics`)
      .then(r => setDrillData(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setDrillData([]))
      .finally(() => setDrillLoading(false));
  };

  if (loadingClasses) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-violet-300" /></div>;

  // D6: teacher has no classes but has subject-assigned students
  if (classes.length === 0) {
    if (!subjectStudentsLoaded) return (
      <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-violet-300" /></div>
    );
    if (subjectStudents.length === 0) return (
      <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
        <Users size={28} className="mx-auto mb-2 text-gray-200" />
        <p className="text-sm font-medium text-gray-500 mb-1">No students yet</p>
        <p className="text-xs text-gray-400">Students enrolled in your assigned subjects will appear here.</p>
      </div>
    );
    // Render subject-assigned students with drill-down — reuses same student rows UI below
    const subjectAnalytics = { students: subjectStudents };
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Users size={13} className="text-violet-400" />
          <span className="text-xs text-gray-500 font-mono uppercase">Students via subject assignments ({subjectStudents.length})</span>
        </div>
        <StudentTable
          analytics={subjectAnalytics}
          drillStudent={drillStudent}
          drillData={drillData}
          drillLoading={drillLoading}
          openDrill={openDrill}
          setDrillStudent={setDrillStudent}
          setDrillData={setDrillData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 font-mono">CLASS</span>
        <div className="relative">
          <select value={selectedClass || ''} onChange={e => setSelectedClass(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2 pr-7 text-sm text-gray-800 focus:outline-none focus:border-violet-400">
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.student_count ?? 0})</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-violet-300" /></div>
      ) : (
        <StudentTable
          analytics={analytics}
          drillStudent={drillStudent}
          drillData={drillData}
          drillLoading={drillLoading}
          openDrill={openDrill}
          setDrillStudent={setDrillStudent}
          setDrillData={setDrillData}
        />
      )}
    </div>
  );
}

// ── Shared student analytics table ───────────────────────────────────────────
function StudentTable({ analytics, drillStudent, drillData, drillLoading, openDrill, setDrillStudent, setDrillData }) {
  if (!analytics || analytics.students?.length === 0) return (
    <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">No student data yet.</div>
  );
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      <div className="grid grid-cols-12 text-[10px] font-mono text-gray-400 uppercase px-4 py-2.5 border-b border-gray-100">
        <span className="col-span-4">Student</span>
        <span className="col-span-2 text-center">Accuracy</span>
        <span className="col-span-2 text-center">Attempts</span>
        <span className="col-span-2 text-center hidden sm:block">Streak</span>
        <span className="col-span-2 text-center">Nudge</span>
      </div>
      <div className="divide-y divide-gray-50">
        {analytics.students.map(s => (
          <div key={s.id}>
            <div
              className="grid grid-cols-12 items-center px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => openDrill(s)}
              title="Click to see topic breakdown"
            >
              <div className="col-span-4 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1">
                  {s.name}
                  <span className={`text-[10px] ml-1 text-gray-400 transition-transform ${drillStudent?.id === s.id ? 'rotate-90' : ''}`}>▶</span>
                </p>
                <p className="text-xs text-gray-400 truncate">{s.email}</p>
              </div>
              <div className="col-span-2 text-center">
                <span className={`font-mono font-bold text-sm ${accColor(s.accuracy_pct)}`}>{s.accuracy_pct != null ? `${s.accuracy_pct}%` : '—'}</span>
              </div>
              <div className="col-span-2 text-center text-sm text-gray-600 font-mono">{s.attempts ?? 0}</div>
              <div className="col-span-2 text-center hidden sm:block text-sm text-amber-500 font-mono">{s.streak ?? 0}</div>
              <div className="col-span-2 text-center" onClick={e => e.stopPropagation()}><NudgeButton studentId={s.id} /></div>
            </div>

            {/* Topic drill-down panel */}
            {drillStudent?.id === s.id && (
              <div className="bg-gray-50 border-t border-gray-100 px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-mono font-semibold text-gray-500 uppercase">Topic breakdown — {s.name}</p>
                  <button onClick={() => { setDrillStudent(null); setDrillData([]); }}
                    className="text-xs text-gray-400 hover:text-gray-600">✕ Close</button>
                </div>
                {drillLoading ? (
                  <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-violet-300" /></div>
                ) : drillData.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No practice data yet for this student.</p>
                ) : (
                  <div className="space-y-2">
                    {drillData.map(t => (
                      <div key={t.topic_id} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-gray-700 truncate">{t.topic}</span>
                            <span className={`text-xs font-mono font-bold ml-2 ${accColor(t.accuracy_pct)}`}>
                              {t.accuracy_pct != null ? `${t.accuracy_pct}%` : '—'}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                t.accuracy_pct >= 70 ? 'bg-green-400' :
                                t.accuracy_pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.min(t.accuracy_pct ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono shrink-0">{t.attempt_count} attempts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NudgeButton({ studentId }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const nudge = async () => {
    setBusy(true);
    try { const r = await api.post(`/teacher/nudge/${studentId}`); setSent(true); setTimeout(() => setSent(false), 3000); }
    catch {} finally { setBusy(false); }
  };
  return (
    <button onClick={nudge} disabled={busy || sent}
      className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
        sent ? 'bg-emerald-50 text-emerald-500 border-emerald-200' : 'border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300'
      }`}>
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
  const [editingQ,   setEditingQ]   = useState(null);   // test id whose question panel is open
  const [bank,       setBank]       = useState([]);     // teacher's question bank
  const [attached,   setAttached]   = useState([]);     // questions already on the open test
  const [savingQ,    setSavingQ]    = useState(false);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/teacher/tests').catch(() => ({ data: [] })),
      api.get('/teacher/classes').catch(() => ({ data: [] })),
    ]).then(([t, c]) => { setTests(Array.isArray(t?.data) ? t.data : []); setClasses(Array.isArray(c?.data) ? c.data : []); }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const createTest = async () => {
    if (!form.title.trim()) { showToast('Title is required.', 'error'); return; }
    setCreating(true);
    try { await api.post('/teacher/tests', form); showToast('Test created!'); setForm({ title: '', duration_minutes: 60, total_marks: 100 }); setShowCreate(false); load(); }
    catch (err) { showToast(err?.message || 'Failed.', 'error'); }
    finally { setCreating(false); }
  };

  const publishTest = async id => {
    setPublishing(id);
    try { await api.put(`/teacher/tests/${id}/publish`); showToast('Test published!'); load(); }
    catch (err) { showToast(err?.message || 'Publish failed.', 'error'); }
    finally { setPublishing(null); }
  };

  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting,   setDeleting]   = useState(null);
  const [editingTest, setEditingTest] = useState(null);  // test object being edited
  const [editForm,    setEditForm]    = useState({});
  const [saving,      setSaving]      = useState(false);

  const deleteTest = async () => {
    if (!confirmDel) return;
    setDeleting(confirmDel.id);
    try {
      await api.delete(`/teacher/tests/${confirmDel.id}`);
      showToast('Test deleted.');
      setConfirmDel(null);
      load();
    } catch (err) {
      showToast(err?.message || 'Failed to delete test.', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = t => {
    setEditingTest(t.id);
    setEditForm({ title: t.title, duration_minutes: t.duration_minutes, total_marks: t.total_marks });
  };

  const saveEdit = async () => {
    if (!editForm.title?.trim()) { showToast('Title cannot be blank.', 'error'); return; }
    setSaving(true);
    try {
      await api.patch(`/teacher/tests/${editingTest}`, editForm);
      showToast('Test updated.');
      setEditingTest(null);
      load();
    } catch (err) { showToast(err?.message || 'Failed to update.', 'error'); }
    finally { setSaving(false); }
  };

  const assignTest = async testId => {
    if (!assignClass) { showToast('Select a class first.', 'error'); return; }
    try { await api.post(`/teacher/tests/${testId}/assign`, { class_id: assignClass }); showToast('Assigned!'); setAssigning(null); setAssignClass(''); }
    catch (err) { showToast(err?.message || 'Failed.', 'error'); }
  };

  const toggleQuestionPanel = async testId => {
    if (editingQ === testId) { setEditingQ(null); return; }
    setEditingQ(testId);
    try {
      const [b, a] = await Promise.all([
        api.get('/teacher/questions').catch(() => ({ data: [] })),
        api.get(`/teacher/tests/${testId}/questions`).catch(() => ({ data: [] })),
      ]);
      setBank(Array.isArray(b?.data) ? b.data : []);
      setAttached(Array.isArray(a?.data) ? a.data : []);
    } catch (err) { showToast(err?.message || 'Could not load questions.', 'error'); }
  };

  const isAttached = qId => attached.some(a => a.id === qId);

  const toggleQuestionOnTest = async (testId, questionId) => {
    setSavingQ(true);
    try {
      if (isAttached(questionId)) {
        await api.delete(`/teacher/tests/${testId}/questions/${questionId}`);
        setAttached(prev => prev.filter(a => a.id !== questionId));
      } else {
        await api.post(`/teacher/tests/${testId}/questions`, { question_ids: [questionId] });
        const q = bank.find(b => b.id === questionId);
        if (q) setAttached(prev => [...prev, q]);
      }
      load();
    } catch (err) { showToast(err?.message || 'Failed to update test questions.', 'error'); }
    finally { setSavingQ(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-violet-300" /></div>;

  return (
    <>
    <div className="space-y-4">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-mono text-violet-500 uppercase tracking-widest">What is Test Builder?</p>
        <p className="text-sm text-gray-700">Create custom assessments from your subject's question bank. Set duration and marks, then push to a class or individual student.</p>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={() => navigate('/teacher/content')}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
            <PenTool size={12} /> Open Full Test Builder
          </button>
          <button onClick={() => navigate('/teacher/questions/add')}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-white text-xs font-semibold px-3 py-1.5 rounded-lg">
            <Plus size={12} /> Add Question
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-gray-400">{tests.length} TEST{tests.length !== 1 ? 'S' : ''}</p>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
          <Plus size={12} /> New Test
        </button>
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Test title *" className={inp} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400 mb-1 block font-mono">DURATION (min)</label><input type="number" min={5} value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))} className={inp} /></div>
            <div><label className="text-xs text-gray-400 mb-1 block font-mono">TOTAL MARKS</label><input type="number" min={1} value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks: parseInt(e.target.value) || 100 }))} className={inp} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={createTest} disabled={creating} className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
          <PenTool size={24} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-400">No tests yet — click "New Test" to start.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tests.map(t => (
            <div key={t.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800">{t.title}</p>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${t.is_published ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {t.is_published ? 'LIVE' : 'DRAFT'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{t.duration_minutes}min · {t.total_marks}pts · {t.question_count ?? 0}q</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!t.is_published && (
                    <button onClick={() => publishTest(t.id)} disabled={publishing === t.id}
                      className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold rounded-lg border border-emerald-200">
                      {publishing === t.id ? <Loader2 size={12} className="animate-spin" /> : 'Publish'}
                    </button>
                  )}
                  {/* D3: edit button — pencil icon opens inline edit form */}
                  <button onClick={() => editingTest === t.id ? setEditingTest(null) : startEdit(t)}
                    title="Edit test"
                    className={`text-xs px-2.5 py-1.5 border font-semibold rounded-lg transition-colors ${editingTest === t.id ? 'bg-violet-50 border-violet-300 text-violet-600' : 'border-gray-200 text-gray-400 hover:text-violet-600 hover:border-violet-200'}`}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => toggleQuestionPanel(t.id)}
                    className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-violet-600 hover:border-violet-200 font-semibold rounded-lg">
                    Questions ({t.question_count ?? 0})
                  </button>
                  <button onClick={() => setAssigning(assigning === t.id ? null : t.id)}
                    className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-violet-600 hover:border-violet-200 font-semibold rounded-lg">
                    Assign
                  </button>
                  {!t.is_published && (
                    <button
                      onClick={() => setConfirmDel(t)}
                      disabled={deleting === t.id}
                      title="Delete this draft test"
                      className="text-xs px-2.5 py-1.5 border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 font-semibold rounded-lg disabled:opacity-40">
                      {deleting === t.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {/* D3: inline edit form */}
              {editingTest === t.id && (
                <div className="border-t border-gray-100 bg-violet-50 px-4 py-3 space-y-3">
                  <p className="text-xs font-mono text-violet-500 uppercase tracking-widest">Edit Test</p>
                  <input
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Test title *"
                    className={inp}
                  />
                  {!t.is_published && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block font-mono">DURATION (min)</label>
                        <input type="number" min={1} value={editForm.duration_minutes}
                          onChange={e => setEditForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))}
                          className={inp} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block font-mono">TOTAL MARKS</label>
                        <input type="number" min={1} value={editForm.total_marks}
                          onChange={e => setEditForm(f => ({ ...f, total_marks: parseInt(e.target.value) || 100 }))}
                          className={inp} />
                      </div>
                    </div>
                  )}
                  {t.is_published && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      This test is live — only the title can be edited.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={saving}
                      className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                    </button>
                    <button onClick={() => setEditingTest(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                </div>
              )}
              {assigning === t.id && (
                <div className="border-t border-gray-100 bg-violet-50 px-4 py-3 flex items-center gap-2">
                  <select value={assignClass} onChange={e => setAssignClass(e.target.value)}
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-violet-400">
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => assignTest(t.id)} className="bg-violet-600 text-white text-xs font-semibold px-3 py-2 rounded-lg">Assign</button>
                  <button onClick={() => setAssigning(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
              )}
              {editingQ === t.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono text-gray-400 uppercase tracking-widest">Question bank — tap to attach/remove</p>
                    {savingQ && <Loader2 size={12} className="animate-spin text-violet-400" />}
                  </div>
                  {bank.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">
                      No questions in your bank yet. Use "Add Question" above to create some first.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                      {bank.map(q => {
                        const on = isAttached(q.id);
                        return (
                          <button key={q.id} onClick={() => toggleQuestionOnTest(t.id, q.id)} disabled={savingQ}
                            className={`w-full text-left text-xs px-3 py-2 rounded-lg border flex items-start gap-2 transition-colors ${
                              on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:border-violet-200'
                            }`}>
                            <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                              {on && <Check size={10} className="text-white" />}
                            </span>
                            <span className="line-clamp-2">{q.question_text}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>

      {/* ── Delete confirmation dialog ─────────────────────────────────── */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-1">Delete test?</h3>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-semibold text-gray-800">"{confirmDel.title}"</span> will be permanently removed
              along with all its questions.
            </p>
            <p className="text-xs text-amber-600 mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDel(null)}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl">
                Cancel
              </button>
              <button
                onClick={deleteTest}
                disabled={!!deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-40 flex items-center gap-2">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── MAIN DASHBOARD ──────────────────────────────────────────────────────── */
export default function TeacherDashboard() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [searchParams] = useSearchParams();

  const [activeTab,        setActiveTab]        = useState('classes');
  const [assignedSubjects, setAssignedSubjects] = useState(null);

  // N2 fix: read ?tab= from URL (e.g. /teacher/dashboard?tab=testbuilder) and
  // activate the matching tab on mount. This allows /teacher/assignments to
  // redirect here with the Tests tab pre-selected instead of dumping the teacher
  // on the wrong tab with no indication of where they are.
  // Only inline tabs are valid targets — link-based tabs (content, resources,
  // addq, pastpapers, settings) navigate to separate pages so cannot be
  // activated this way.
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const INLINE_TABS = ['classes', 'analytics', 'testbuilder'];
    if (tabParam && INLINE_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []); // run once on mount only

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setAssignedSubjects(r.data ?? []))
      .catch(() => setAssignedSubjects([]));
  }, []);

  const displayName     = getDisplayName(user);
  const subjectsLoading = assignedSubjects === null;
  const hasSubjects     = (assignedSubjects?.length ?? 0) > 0;

  const tabs = [
    { id: 'classes',     label: 'Classes',   icon: Users    },
    { id: 'analytics',   label: 'Analytics', icon: BarChart2},
    { id: 'testbuilder', label: 'Tests',      icon: PenTool  },
    { id: 'content',     label: 'Content',    icon: BookOpen, link: '/teacher/content'      },
    { id: 'resources',   label: 'Resources',  icon: Upload,   link: '/teacher/resources'    },
    { id: 'addq',        label: 'Add Q',      icon: Plus,     link: '/teacher/questions/add' },
    { id: 'pastpapers',  label: 'Past Papers', icon: FileText, link: '/past-papers'           },
    { id: 'settings',    label: 'Settings',    icon: Settings, link: '/teacher/settings'      },
  ];

  // ── Sidebar items — all wired ─────────────────────────────────────────────
  const sidebarItems = [
    { id: 'classes',     icon: Users,     label: 'My Classes',      tab: true  },
    { id: 'analytics',   icon: BarChart2, label: 'Analytics',       tab: true  },
    { id: 'testbuilder', icon: PenTool,   label: 'Test Builder',    tab: true  },
    { id: 'content',     icon: BookOpen,  label: 'Content Manager', link: '/teacher/content'      },
    { id: 'resources',   icon: Upload,    label: 'Resources',       link: '/teacher/resources'    },
    { id: 'addq',        icon: Plus,      label: 'Add Question',    link: '/teacher/questions/add'},
    { id: 'pastpapers',  icon: FileText,  label: 'Past Papers',     link: '/past-papers'          },
    { id: 'settings',    icon: Settings,  label: 'Settings',        link: '/teacher/settings'     },
  ];

  const isTabActive = (item) => item.tab && activeTab === item.id;

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />

      <div className="flex">
        {/* ── SIDEBAR ── */}
        <aside className="w-52 shrink-0 min-h-[calc(100vh-48px)] bg-[#f0ede8] border-r border-[#e8e4dd] sticky top-12 self-start hidden md:block">
          <div className="px-3 py-5">
            <div className="px-3 py-2 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">Teacher</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5 truncate">{displayName}</p>
            </div>

            {/* Subject pills */}
            {!subjectsLoading && hasSubjects && (
              <div className="mx-3 mb-3 space-y-1">
                {(assignedSubjects || []).slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 bg-white/60 border border-[#e8e4dd] rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d97757] shrink-0" />
                    <span className="text-[10px] font-medium text-[#6b6259] truncate">{s.name}</span>
                  </div>
                ))}
              </div>
            )}
            {!subjectsLoading && !hasSubjects && (
              <div className="mx-3 mb-3 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-[10px] text-amber-700">No subjects assigned</p>
              </div>
            )}

            <nav className="space-y-0.5">
              {sidebarItems.map(({ id, icon: Icon, label, tab, link }) => {
                const active = tab ? isTabActive({ id, tab }) : location.pathname.startsWith(link || '/_');
                return (
                  <button key={id}
                    onClick={() => link ? navigate(link) : setActiveTab(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                      active
                        ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]'
                        : 'text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60'
                    }`}>
                    <Icon size={14} className={active ? 'text-[#d97757]' : 'text-[#b5a99a]'} />
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 min-w-0">
          {/* Header */}
          <div className="border-b border-[#e8e4dd] px-4 md:px-8 py-5 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#b5a99a] text-xs uppercase tracking-widest mb-0.5 font-medium">Teacher Console</p>
                <h1 className="text-xl font-bold text-gray-900">Welcome back, {displayName}</h1>
              </div>
              <div className="flex gap-2 md:hidden">
                {hasSubjects && (
                  <Link to="/teacher/resources" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                    <Upload size={13} /> Resources
                  </Link>
                )}
                <Link to="/teacher/questions/add" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold">
                  <Plus size={13} /> Add Q
                </Link>
              </div>
            </div>
          </div>

          {/* No subjects warning */}
          {!subjectsLoading && !hasSubjects && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 md:px-8 py-2.5">
              <div className="flex items-center gap-2">
                <AlertCircle size={13} className="text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">No subjects assigned — contact admin to get assigned to exam types and subjects</p>
              </div>
            </div>
          )}

          {/* Mobile tab bar */}
          <div className="border-b border-gray-100 md:hidden sticky top-12 bg-white z-10 overflow-x-auto">
            <div className="flex min-w-max px-2">
              {tabs.map(t => (
                t.link ? (
                  <button key={t.id} onClick={() => navigate(t.link)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      location.pathname.startsWith(t.link) ? 'border-violet-600 text-violet-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}>
                    <t.icon size={13} /> {t.label}
                  </button>
                ) : (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === t.id ? 'border-violet-600 text-violet-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}>
                    <t.icon size={13} /> {t.label}
                  </button>
                )
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-4 md:px-8 py-6">
            <Outlet />
            {activeTab === 'classes'     && <ClassesTab />}
            {activeTab === 'analytics'   && <AnalyticsTab />}
            {activeTab === 'testbuilder' && <TestBuilderTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
