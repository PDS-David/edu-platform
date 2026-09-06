import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import api, { TIMEOUT_AI_GENERATE } from '../services/apiClient';
import {
  Users, Plus, CheckCircle, Loader2, AlertTriangle,
  BarChart2, X, PenTool, BookOpen, Upload, Send, FileText,
  ChevronDown, AlertCircle, Search, UserPlus, Settings, Check, Trash2, Pencil,
  Sparkles, Zap,
} from 'lucide-react';
import PrintReportButton from '../components/PrintReportButton';
import PrintableReportHeader from '../components/PrintableReportHeader';
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
  // ASSIGN-2 fix: the member list as last fetched from the server — sent
  // back on Save so the backend can detect if a school_admin added/removed
  // someone in the meantime. Deliberately kept separate from `selected`
  // (which the teacher may have since edited) so a stale-roster retry can
  // refresh this without discarding the teacher's in-progress checkbox
  // changes for anyone they were already looking at.
  const [knownMemberIds, setKnownMemberIds] = useState([]);

  const loadMembers = () => {
    setLoading(true);
    return api.get(`/teacher/class/${cls.id}/members`)
      .then(r => {
        const ids = (r?.data || []).map(s => s.id);
        setSelected(new Set(ids));
        setKnownMemberIds(ids);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/teacher/class/${cls.id}/members`, {
        student_ids: [...selected],
        known_member_ids: knownMemberIds,
      });
      showToast(`Updated "${cls.name}" — ${selected.size} student${selected.size !== 1 ? 's' : ''}.`);
      onSaved();
      onClose();
    } catch (err) {
      if (err?.status === 409) {
        // Someone else (a school_admin) changed this class's roster since
        // we loaded it. Re-fetch the real current list and tell the
        // teacher plainly, rather than silently overwriting their change —
        // this is the whole point of the fix, so don't reduce it to a
        // generic error banner. NOTE: apiClient.js's response interceptor
        // rejects with a flattened { message, status, raw } object, not
        // the raw axios error — status lives at err.status directly, not
        // err.response.status.
        await loadMembers();
        showToast("This class's roster changed since you opened this — refreshed with the latest list. Please review and save again.", 'error');
      } else {
        showToast(err?.message || 'Failed to update members.', 'error');
      }
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
      const res = await api.patch(`/teacher/classes/${cls.id}`, { name: renameVal.trim() });
      showToast('Class renamed.');
      cancelRename();
      // BUG FIX (classes-tab-full-reload-on-small-edit): this used to call the
      // full load() here, which sets `loading` back to true and — since this
      // component does `loading ? <spinner> : classes.map(...)` — replaced
      // the ENTIRE class list with a blank spinner just to rename one class,
      // losing scroll position and collapsing any other class's open state.
      // The PATCH endpoint already returns the updated { id, name }, so just
      // patch that one class locally instead.
      const updated = res?.data?.class;
      setClasses(prev => prev.map(c =>
        c.id === cls.id ? { ...c, name: updated?.name ?? renameVal.trim() } : c
      ));
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
      const deletedId = confirmDel.id;
      setConfirmDel(null);
      // Same fix as saveRename/createClass below: no need to reload the whole
      // list and blank the screen just to remove one row we already know the
      // id of.
      setClasses(prev => prev.filter(c => c.id !== deletedId));
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
      const res = await api.post('/teacher/classes', {
        name: newName.trim(),
        student_ids: [...newSelected],
      });
      setNewName('');
      setNewSelected(new Set());
      setShowCreate(false);
      showToast(`Class created with ${newSelected.size} student${newSelected.size !== 1 ? 's' : ''}.`);
      // Same fix: POST already returns the created class (id, name,
      // created_at, student_count) — prepend it locally instead of a full
      // reload that would blank the entire list mid-creation.
      if (res?.data) {
        setClasses(prev => [res.data, ...prev]);
      }
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
  // GAP-1 fix: NudgeButton used to fail with zero feedback in either
  // direction on error. Same local Toast + showToast pattern already used
  // by ClassesTab/ManageClassModal above in this file (see the Toast
  // component defined at the top of this file) — threaded down through
  // StudentTable to NudgeButton.
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

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
          classLabel="Subject-assigned students"
          drillStudent={drillStudent}
          drillData={drillData}
          drillLoading={drillLoading}
          openDrill={openDrill}
          setDrillStudent={setDrillStudent}
          setDrillData={setDrillData}
          showToast={showToast}
        />
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
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
          classLabel={classes.find(c => c.id === selectedClass)?.name || null}
          drillStudent={drillStudent}
          drillData={drillData}
          drillLoading={drillLoading}
          openDrill={openDrill}
          setDrillStudent={setDrillStudent}
          setDrillData={setDrillData}
          showToast={showToast}
        />
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Shared student analytics table ───────────────────────────────────────────
function StudentTable({ analytics, classLabel, drillStudent, drillData, drillLoading, openDrill, setDrillStudent, setDrillData, showToast }) {
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
              <div className="col-span-2 text-center" onClick={e => e.stopPropagation()}><NudgeButton studentId={s.id} showToast={showToast} /></div>
            </div>

            {/* Topic drill-down panel — this is also the printable/downloadable report */}
            {drillStudent?.id === s.id && (
              <div className="bg-gray-50 border-t border-gray-100 px-6 py-4">
                <div className="printable-report">
                  <PrintableReportHeader
                    title="Student Performance Report"
                    subtitle={`${s.name}${classLabel ? ` — ${classLabel}` : ''}`}
                  />
                  <div className="flex items-center justify-between mb-3 no-print">
                    <div className="flex items-center gap-2">
                      <PrintReportButton />
                    </div>
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
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NudgeButton({ studentId, showToast }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const nudge = async () => {
    setBusy(true);
    try {
      await api.post(`/teacher/nudge/${studentId}`);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      console.error('[NudgeButton]', err);
      showToast?.(err?.message || 'Could not send nudge. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
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
// ─── AI Generate Tab ──────────────────────────────────────────────────────
// The real gap: /teacher/generate-questions (backend), GET
// /teacher/questions/pending + PUT /teacher/questions/:id/review (backend),
// and QuestionReview.jsx (frontend, fixed to stop hardcoding /admin/... so
// it actually works for a teacher) all already existed and worked — but
// there was no teacher-facing generation FORM anywhere to call the
// generate endpoint from. Only AdminDashboard.jsx's AIGeneratePanel had one.
//
// Deliberately NOT a copy of AIGeneratePanel's exam-type-first flow — a
// teacher's access is scoped by teacher_subjects directly (verified
// server-side in POST /teacher/generate-questions: 403 if the subject isn't
// one of theirs), with no exam_type_id in that check at all. So this starts
// straight from "pick one of YOUR assigned subjects" (GET
// /teacher/my-subjects — already used elsewhere for a teacher's own scoped
// views, e.g. TeacherPastPapersPage.jsx), then reuses the exact same
// topic/subtopic cascade + inline-create endpoints TeacherAddQuestionPage.jsx
// already uses for manual authoring (GET/POST /teacher/topics,
// GET/POST /teacher/subtopics) — same backend, same shapes, so a topic or
// subtopic created from either form immediately shows up in the other.
function AIGenerateTab() {
  const [subjects,      setSubjects]      = useState([]);
  const [subjectsLoad,  setSubjectsLoad]  = useState(true);
  const [topics,        setTopics]        = useState([]);
  const [topicsLoad,    setTopicsLoad]    = useState(false);
  const [subtopics,     setSubtopics]     = useState([]);
  const [subtopicsLoad, setSubtopicsLoad] = useState(false);
  const [pendingCount,  setPendingCount]  = useState(null);

  const [form, setForm] = useState({
    subject_id: '', topic_id: '', topic: '', subtopic_id: '',
    count: 10, difficulty: 'medium', question_type: 'mcq',
  });

  const [creatingTopic,    setCreatingTopic]    = useState(false);
  const [newTopicName,     setNewTopicName]     = useState('');
  const [savingTopic,      setSavingTopic]      = useState(false);
  const [topicError,       setTopicError]       = useState('');
  const [creatingSubtopic, setCreatingSubtopic] = useState(false);
  const [newSubtopicName,  setNewSubtopicName]  = useState('');
  const [savingSubtopic,   setSavingSubtopic]   = useState(false);
  const [subtopicError,    setSubtopicError]    = useState('');

  const [generating, setGenerating] = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setSubjects(r.data || []))
      .catch(() => setSubjects([]))
      .finally(() => setSubjectsLoad(false));
    // limit=1: only the `total` count is needed here, not the rows — same
    // lightweight-badge intent as admin's dedicated pending-count endpoint,
    // teacher just doesn't have a separate one, so ask for the fewest rows.
    api.get('/teacher/questions/pending?limit=1')
      .then(r => setPendingCount(r.total ?? 0))
      .catch(() => {});
  }, []);

  const handleSubjectChange = (subjectId) => {
    setForm(f => ({ ...f, subject_id: subjectId, topic_id: '', topic: '', subtopic_id: '' }));
    setTopics([]); setSubtopics([]); setCreatingTopic(false); setCreatingSubtopic(false);
    if (!subjectId) return;
    setTopicsLoad(true);
    api.get(`/teacher/topics?subject_id=${subjectId}`)
      .then(r => setTopics(r.data || []))
      .catch(() => setTopics([]))
      .finally(() => setTopicsLoad(false));
  };

  const handleTopicChange = (topicId) => {
    const chosen = topics.find(t => String(t.id) === String(topicId));
    setForm(f => ({ ...f, topic_id: topicId, topic: chosen?.name || '', subtopic_id: '' }));
    setSubtopics([]); setCreatingSubtopic(false);
    if (!topicId) return;
    setSubtopicsLoad(true);
    api.get(`/teacher/subtopics?topic_id=${topicId}`)
      .then(r => setSubtopics(r.data || []))
      .catch(() => setSubtopics([]))
      .finally(() => setSubtopicsLoad(false));
  };

  const handleCreateTopic = async () => {
    const name = newTopicName.trim();
    if (!name) { setTopicError('Topic name is required.'); return; }
    setSavingTopic(true); setTopicError('');
    try {
      const res = await api.post('/teacher/topics', { subject_id: form.subject_id, name });
      const created = res.data;
      setTopics(prev => [...prev, created]);
      setForm(f => ({ ...f, topic_id: String(created.id), topic: name, subtopic_id: '' }));
      setCreatingTopic(false); setNewTopicName('');
    } catch (err) {
      setTopicError(err.message || 'Failed to create topic.');
    } finally {
      setSavingTopic(false);
    }
  };

  const handleCreateSubtopic = async () => {
    const name = newSubtopicName.trim();
    if (!name) { setSubtopicError('Subtopic name is required.'); return; }
    setSavingSubtopic(true); setSubtopicError('');
    try {
      const res = await api.post('/teacher/subtopics', {
        topic_id: form.topic_id, subject_id: form.subject_id, name,
      });
      const created = res.data;
      setSubtopics(prev => [...prev, created]);
      setForm(f => ({ ...f, subtopic_id: String(created.id) }));
      setCreatingSubtopic(false); setNewSubtopicName('');
    } catch (err) {
      setSubtopicError(err.message || 'Failed to create subtopic.');
    } finally {
      setSavingSubtopic(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.subject_id)   { setError('Please select a subject.'); return; }
    if (!form.topic.trim()) { setError('Please select or create a topic.'); return; }
    setError(''); setResult(null); setGenerating(true);
    try {
      const res = await api.post('/teacher/generate-questions', {
        subject_id:    form.subject_id,
        topic:         form.topic,
        subtopic_id:   form.subtopic_id || undefined,
        count:         form.count,
        difficulty:    form.difficulty,
        question_type: form.question_type,
      }, { timeout: TIMEOUT_AI_GENERATE });
      setResult(res.data || res);
      const inserted = res.data?.inserted ?? res.inserted ?? 0;
      setPendingCount(c => (c || 0) + inserted);
    } catch (err) {
      setError(err?.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  if (subjectsLoad) {
    return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-violet-400" /></div>;
  }

  if (subjects.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <Sparkles size={28} className="text-gray-200 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-600 mb-1">No subjects assigned</p>
        <p className="text-xs text-gray-400">Contact your admin to get assigned to a subject before generating questions.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-500" /><h3 className="font-bold text-gray-900">AI Question Generator</h3></div>
        {pendingCount !== null && (
          <Link to="/teacher/review" className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full hover:bg-amber-200">
            <Zap size={12} />{pendingCount} pending review
          </Link>
        )}
      </div>

      <form onSubmit={handleGenerate} className="space-y-4 max-w-lg">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Subject — scoped to this teacher's own assignments, no exam-type step needed */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Subject *</label>
          <select value={form.subject_id} onChange={e => handleSubjectChange(e.target.value)} className={inp} required>
            <option value="">Select subject…</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.exam_board_code ? ` (${s.exam_board_code})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Topic — cascades from Subject, with inline create (same as TeacherAddQuestionPage.jsx) */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Topic *</label>
          {!form.subject_id ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">Select a subject above</div>
          ) : topicsLoad ? (
            <div className={inp + ' text-gray-400'}>Loading topics…</div>
          ) : creatingTopic ? (
            <div className="space-y-2">
              <input value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="New topic name" className={inp} autoFocus />
              {topicError && <p className="text-xs text-red-500">{topicError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={handleCreateTopic} disabled={savingTopic}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                  {savingTopic && <Loader2 size={12} className="animate-spin" />} Save Topic
                </button>
                <button type="button" onClick={() => { setCreatingTopic(false); setTopicError(''); }} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <select value={form.topic_id} onChange={e => handleTopicChange(e.target.value)} className={inp} required={!form.topic_id}>
                <option value="">{topics.length === 0 ? 'No topics yet' : 'Select topic…'}</option>
                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => setCreatingTopic(true)}
                className="shrink-0 flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-400 px-3 rounded-lg">
                <Plus size={12} /> New
              </button>
            </div>
          )}
        </div>

        {/* Subtopic — optional, cascades from Topic, with inline create */}
        {form.topic_id && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Subtopic (optional)</label>
            {subtopicsLoad ? (
              <div className={inp + ' text-gray-400'}>Loading subtopics…</div>
            ) : creatingSubtopic ? (
              <div className="space-y-2">
                <input value={newSubtopicName} onChange={e => setNewSubtopicName(e.target.value)} placeholder="New subtopic name" className={inp} autoFocus />
                {subtopicError && <p className="text-xs text-red-500">{subtopicError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={handleCreateSubtopic} disabled={savingSubtopic}
                    className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                    {savingSubtopic && <Loader2 size={12} className="animate-spin" />} Save Subtopic
                  </button>
                  <button type="button" onClick={() => { setCreatingSubtopic(false); setSubtopicError(''); }} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <select value={form.subtopic_id} onChange={e => setForm(f => ({ ...f, subtopic_id: e.target.value }))} className={inp}>
                  <option value="">{subtopics.length === 0 ? 'No subtopics yet — questions still work without one' : 'Select subtopic…'}</option>
                  {subtopics.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
                <button type="button" onClick={() => setCreatingSubtopic(true)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-400 px-3 rounded-lg">
                  <Plus size={12} /> New
                </button>
              </div>
            )}
          </div>
        )}

        {/* Question type */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Question Type</label>
          <select value={form.question_type} onChange={e => setForm(f => ({ ...f, question_type: e.target.value }))} className={inp}>
            <option value="mcq">Multiple Choice</option>
            <option value="short_answer">Short Answer</option>
            <option value="structured">Structured (free-response)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Difficulty</label>
            <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} className={inp}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Count (max 15)</label>
            <input type="number" min={1} max={15} value={form.count}
              onChange={e => setForm(f => ({ ...f, count: Math.min(Math.max(parseInt(e.target.value) || 1, 1), 15) }))}
              className={inp} />
          </div>
        </div>

        <button type="submit" disabled={generating}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          {generating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate Questions</>}
        </button>
      </form>

      {result && (
        <div className="max-w-lg mt-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle size={14} /> {result.message}</p>
          {result.skipped > 0 && result.skipped_reasons?.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-700 list-disc list-inside">
              {result.skipped_reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          <Link to="/teacher/review" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-violet-600 hover:text-violet-800">
            Go to Review Queue <Zap size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}

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

  const [confirmCancel, setConfirmCancel] = useState(null); // test object pending cancel confirmation
  const [cancelling,    setCancelling]    = useState(null);

  const unpublishTest = async () => {
    if (!confirmCancel) return;
    setCancelling(confirmCancel.id);
    try {
      await api.put(`/teacher/tests/${confirmCancel.id}/unpublish`);
      showToast('Test cancelled.');
      setConfirmCancel(null);
      load();
    } catch (err) {
      showToast(err?.message || 'Failed to cancel test.', 'error');
    } finally {
      setCancelling(null);
    }
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
        // FEATURE: scope=subject — this bank picker should show every
        // question in this teacher's supervised subjects (per explicit
        // request: subject/exam-type supervision, not authorship), not
        // just questions they personally wrote. The default (unscoped)
        // request below is still used by three OTHER pages that manage a
        // teacher's own submitted questions with a Delete button — those
        // are deliberately untouched, see the scope=subject comment in
        // teacherRoutes.js's GET /questions for the full reasoning.
        api.get('/teacher/questions?scope=subject').catch(() => ({ data: [] })),
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
        // BUG FIX (question-list-refreshes-on-toggle): this used to call the
        // full load() here, which sets `loading` back to true and — since
        // this component does `if (loading) return <spinner>` — replaced the
        // ENTIRE tab (including the open question bank list a teacher was
        // scrolling through) with a blank spinner on every single checkbox
        // click. All that was actually needed was to keep this one test's
        // "Questions (N)" count in sync, so just update it locally instead.
        setTests(prev => prev.map(t =>
          t.id === testId ? { ...t, question_count: Math.max(0, (t.question_count ?? 0) - 1) } : t
        ));
      } else {
        await api.post(`/teacher/tests/${testId}/questions`, { question_ids: [questionId] });
        const q = bank.find(b => b.id === questionId);
        if (q) setAttached(prev => [...prev, q]);
        setTests(prev => prev.map(t =>
          t.id === testId ? { ...t, question_count: (t.question_count ?? 0) + 1 } : t
        ));
      }
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
          <button onClick={() => setShowCreate(true)}
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
                  {t.is_published && (
                    <button onClick={() => setConfirmCancel(t)} disabled={cancelling === t.id}
                      title="Unpublish this test — students will no longer be able to open or resume it"
                      className="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 font-semibold rounded-lg border border-amber-200 disabled:opacity-40">
                      {cancelling === t.id ? <Loader2 size={12} className="animate-spin" /> : 'Cancel'}
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
                      {/* BUG FIX (questions-mixed-up-in-test-builder): the backend now
                         sorts by subject, so group consecutive same-subject rows under
                         a header instead of rendering one flat, mixed-together list. */}
                      {(() => {
                        let lastSubject = null;
                        return bank.map(q => {
                          const on = isAttached(q.id);
                          const subjectLabel = q.subject_name || 'No subject';
                          const showHeader = subjectLabel !== lastSubject;
                          lastSubject = subjectLabel;
                          return (
                            <div key={q.id}>
                              {showHeader && (
                                <p className="text-[10px] font-mono font-semibold text-violet-500 uppercase tracking-widest pt-2 pb-1 first:pt-0">
                                  {subjectLabel}
                                </p>
                              )}
                              <button onClick={() => toggleQuestionOnTest(t.id, q.id)} disabled={savingQ}
                                className={`w-full text-left text-xs px-3 py-2 rounded-lg border flex items-start gap-2 transition-colors ${
                                  on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:border-violet-200'
                                }`}>
                                <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                                  {on && <Check size={10} className="text-white" />}
                                </span>
                                <span className="line-clamp-2 flex-1">{q.question_text}</span>
                                {(q.type === 'essay' || q.type === 'structured') && (
                                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                    {q.type}
                                  </span>
                                )}
                              </button>
                            </div>
                          );
                        });
                      })()}
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

      {/* ── Cancel (unpublish) confirmation dialog ─────────────────────── */}
      {confirmCancel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-1">Cancel test?</h3>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-semibold text-gray-800">"{confirmCancel.title}"</span> will be taken down —
              any student who hasn't finished it yet will no longer be able to open or resume it.
            </p>
            <p className="text-xs text-gray-400 mb-5">Answers already submitted are kept, and you can republish this test later.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmCancel(null)}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl">
                Keep it live
              </button>
              <button
                onClick={unpublishTest}
                disabled={!!cancelling}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-xl disabled:opacity-40 flex items-center gap-2">
                {cancelling ? <Loader2 size={13} className="animate-spin" /> : null}
                Cancel test
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
  // activate the matching tab. This allows /teacher/assignments to redirect
  // here with the Tests tab pre-selected instead of dumping the teacher on
  // the wrong tab with no indication of where they are.
  // Only inline tabs are valid targets — link-based tabs (content, resources,
  // addq, pastpapers, settings) navigate to separate pages so cannot be
  // activated this way.
  //
  // BUG FIX: previously `[]` (mount-only). Navigating from
  // /teacher/dashboard?tab=A to /teacher/dashboard?tab=B is a same-route,
  // search-param-only change — React Router does NOT remount this
  // component for that, so a mount-only effect never re-fires once already
  // on the dashboard. Depending on searchParams.get('tab') directly (not
  // the whole searchParams object) avoids re-running on unrelated
  // query-string changes.
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    // BUG FIX: 'aigenerate' was added as a sidebar nav item, a render
    // condition ({activeTab === 'aigenerate' && <AIGenerateTab />}), and a
    // real AIGenerateTab component — but never added here. Since
    // PortalSidebar.jsx is a separate component with no access to this
    // component's local activeTab state, clicking the sidebar item can
    // only navigate via URL (?tab=aigenerate) and rely on this allowlist
    // to sync it into state. Without this entry, the URL changes and the
    // sidebar highlights correctly, but the content area silently stays
    // on whatever tab was previously active — reproducing the exact
    // "AI Generate highlighted, Classes content shown" bug this feature
    // was supposed to fix.
    const INLINE_TABS = ['classes', 'analytics', 'testbuilder', 'aigenerate'];
    if (tabParam && INLINE_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

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
    { id: 'aigenerate',  label: 'AI Generate',icon: Sparkles },
    { id: 'content',     label: 'Content',    icon: BookOpen, link: '/teacher/content'      },
    { id: 'resources',   label: 'Resources',  icon: Upload,   link: '/teacher/resources'    },
    { id: 'addq',        label: 'Add Q',      icon: Plus,     link: '/teacher/questions/add' },
    { id: 'pastpapers',  label: 'Past Papers', icon: FileText, link: '/teacher/past-papers'    },

  ];

  // DEF-020: sidebar rendering (including this same item list, previously
  // hand-copied here as `sidebarItems`) moved to layouts/TeacherLayout.jsx
  // -- the real shared shell every /teacher/* route now renders inside, so
  // it appears on every teacher page, not just this dashboard. The `tabs`
  // array above still drives the mobile tab bar further down, which stays
  // dashboard-specific (desktop sidebar is `hidden md:block`, so mobile
  // still needs its own nav -- unchanged from before this fix, and a
  // separate gap from the one this fix addresses).

  return (
    <div>
        {/* ── CONTENT ── */}
        <div>
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
            {activeTab === 'aigenerate'  && <AIGenerateTab />}
          </div>
        </div>
    </div>
  );
}
