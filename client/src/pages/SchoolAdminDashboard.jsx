// client/src/pages/SchoolAdminDashboard.jsx
// Route: /school-admin/dashboard (school_admin only)
//
// Intentionally minimal — this is the first slice of a school_admin's
// experience. It only shows their own school's roster (teachers/students who
// have joined via the school's join_code) and the join_code itself, for
// handing to new staff/students. It does NOT expose any platform-wide admin
// functionality (question banks, exam types, other schools' data, etc.) —
// those stay App-Admin-only. Isolation is enforced server-side by
// GET /api/schools/me/roster, which is hard-scoped to req.user.school_id.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import AssignExamTypeModal from '../components/AssignExamTypeModal';
import {
  School, Users, GraduationCap, UserCheck, Copy, Check,
  Loader2, LogOut, AlertCircle, AlertTriangle, Plus, X, Image as ImageIcon, FileText,
  BookOpen, ChevronRight, Trash2, Bell, Send,
} from 'lucide-react';

// ─── Assign Subjects to Teacher ─────────────────────────────────────────────
// Backend: GET/POST /schools/me/teachers/:teacherId/subjects, DELETE
// .../subjects/:subjectId (school_admin only, scoped to the caller's own
// school — see schoolRoutes.js). Subject picker sources from the same
// public /catalog/all-subjects endpoint the App Admin equivalent uses.
function AssignSubjectsModal({ teacher, onClose, onAssigned }) {
  const [allSubjects,     setAllSubjects]     = useState(null);
  const [assignedIds,     setAssignedIds]     = useState(null);
  const [selectedIds,     setSelectedIds]     = useState(new Set());
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/catalog/all-subjects'),
      api.get(`/schools/me/teachers/${teacher.id}/subjects`),
    ])
      .then(([allRes, assignedRes]) => {
        const assigned = assignedRes.data || [];
        setAllSubjects(allRes.data || []);
        setAssignedIds(assigned.map(s => s.id));
        setSelectedIds(new Set(assigned.map(s => s.id)));
      })
      .catch(err => setError(err?.response?.data?.error || 'Could not load subjects.'))
      .finally(() => setLoading(false));
  }, [teacher.id]);

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const toAdd    = [...selectedIds].filter(id => !(assignedIds || []).includes(id));
      const toRemove = (assignedIds || []).filter(id => !selectedIds.has(id));

      if (toAdd.length) {
        await api.post(`/schools/me/teachers/${teacher.id}/subjects`, { subject_ids: toAdd });
      }
      // Removals have no bulk endpoint (mirrors the App Admin route's own
      // one-at-a-time unassign) — fine here since a single save is realistically
      // a handful of changes, not a large unbounded batch like Phase 2's roster add.
      for (const id of toRemove) {
        await api.delete(`/schools/me/teachers/${teacher.id}/subjects/${id}`);
      }
      onAssigned();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not save subject assignments.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = allSubjects && assignedIds && (
    selectedIds.size !== assignedIds.length || [...selectedIds].some(id => !assignedIds.includes(id))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            Assign Subjects — {teacher.first_name} {teacher.last_name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
        ) : (
          <>
            {(allSubjects || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No subjects in the catalog yet.</p>
            ) : (
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {allSubjects.map(s => (
                  <label key={s.id} className="flex items-center justify-between py-2 px-3 text-sm cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggle(s.id)}
                        className="accent-indigo-600" />
                      <span className="text-gray-800">{s.name}</span>
                    </span>
                    {s.exam_board_code && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{s.exam_board_code}</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <button onClick={save} disabled={!dirty || saving}
              className="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Phase 2: School-Owned Classes ──────────────────────────────────────────

function CreateClassModal({ teachers, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', teacher_id: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/schools/me/classes', {
        name: form.name,
        teacher_id: form.teacher_id || undefined,
      });
      onCreated(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not create class.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Create a Class</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Class Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Teacher (optional)</label>
            <select value={form.teacher_id} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
              <option value="">No teacher assigned</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={!form.name.trim() || loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {loading ? 'Creating…' : 'Create Class'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ClassMembersModal({ cls, students, onClose, onChanged }) {
  const [members, setMembers]   = useState(null);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const loadMembers = () => {
    setLoading(true);
    api.get(`/schools/me/classes/${cls.id}/students`)
      .then(res => setMembers(res.data || []))
      .catch(err => setError(err?.response?.data?.error || 'Could not load members.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMembers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cls.id]);

  const memberIds = new Set((members || []).map(m => m.id));
  const available = students.filter(s => !memberIds.has(s.id));

  const addSelected = async () => {
    if (!selected.length) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/schools/me/classes/${cls.id}/students`, { student_ids: selected });
      setSelected([]);
      loadMembers();
      onChanged();
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not add students.');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (studentId) => {
    setError('');
    try {
      await api.delete(`/schools/me/classes/${cls.id}/students/${studentId}`);
      loadMembers();
      onChanged();
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not remove student.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{cls.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Members ({(members || []).length})
            </p>
            <div className="divide-y divide-gray-50 mb-4 max-h-40 overflow-y-auto">
              {(members || []).length === 0 && (
                <p className="text-sm text-gray-400 py-3">No students in this class yet.</p>
              )}
              {(members || []).map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-800">{m.first_name} {m.last_name}</span>
                  <button onClick={() => removeMember(m.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Add students</p>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 mb-3 max-h-40 overflow-y-auto">
              {available.length === 0 && (
                <p className="text-sm text-gray-400 py-3 px-3">Every student in your school is already in this class.</p>
              )}
              {available.map(s => (
                <label key={s.id} className="flex items-center gap-2 py-2 px-3 text-sm cursor-pointer">
                  <input type="checkbox" className="accent-indigo-600"
                    checked={selected.includes(s.id)}
                    onChange={e => setSelected(sel => e.target.checked ? [...sel, s.id] : sel.filter(id => id !== s.id))} />
                  <span className="text-gray-700">{s.first_name} {s.last_name}</span>
                </label>
              ))}
            </div>
            <button onClick={addSelected} disabled={!selected.length || saving}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Adding…' : `Add ${selected.length || ''} Selected`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ClassesSection({ teachers, students }) {
  const [classes, setClasses] = useState(null);
  const [error, setError]     = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [openClass, setOpenClass]   = useState(null);

  const loadClasses = () => {
    api.get('/schools/me/classes')
      .then(res => setClasses(res.data || []))
      .catch(err => setError(err?.response?.data?.error || 'Could not load classes.'));
  };

  useEffect(() => { loadClasses(); }, []);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Classes</p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          <Plus size={14} /> Create Class
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {classes === null && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      )}

      {classes && classes.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">
          No classes yet. Create one to start grouping students, with or without a teacher.
        </p>
      )}

      {classes && classes.length > 0 && (
        <div className="divide-y divide-gray-50">
          {classes.map(c => (
            <button key={c.id} onClick={() => setOpenClass(c)}
              className="w-full flex items-center justify-between py-2.5 text-sm text-left hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-indigo-400" />
                <span className="text-gray-800">{c.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {c.teacher_first_name ? `${c.teacher_first_name} ${c.teacher_last_name}` : 'No teacher assigned'}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {c.student_count} student{c.student_count === 1 ? '' : 's'}
                </span>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateClassModal
          teachers={teachers}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadClasses(); }}
        />
      )}

      {openClass && (
        <ClassMembersModal
          cls={openClass}
          students={students}
          onClose={() => setOpenClass(null)}
          onChanged={loadClasses}
        />
      )}
    </div>
  );
}

// ─── Phase 4: School Admin Notifications ────────────────────────────────────

function SendNotificationModal({ roster, classes, onClose, onSent }) {
  const [form, setForm] = useState({
    title: '',
    message: '',
    recipientType: 'people', // 'people' | 'class' | 'school'
    personIds: [],
    classId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const togglePerson = (id) => setForm(f => ({
    ...f,
    personIds: f.personIds.includes(id)
      ? f.personIds.filter(x => x !== id)
      : [...f.personIds, id],
  }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (form.recipientType === 'people') {
        // Single request for the whole selection (backend recipient.kind:
        // 'users' — plural) instead of one POST per person. Was previously
        // N sequential calls, which meant one slow/failed pick left the
        // sender with no idea which people had already been notified.
        await api.post('/notifications', {
          title: form.title,
          message: form.message,
          recipient: { kind: 'users', ids: form.personIds },
        });
      } else if (form.recipientType === 'class') {
        await api.post('/notifications', {
          title: form.title,
          message: form.message,
          recipient: { kind: 'class', id: form.classId },
        });
      } else {
        await api.post('/notifications', {
          title: form.title,
          message: form.message,
          recipient: { kind: 'school' },
        });
      }
      onSent();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not send notification.');
    } finally {
      setLoading(false);
    }
  };

  const ready = form.title.trim() && form.message.trim() && (
    (form.recipientType === 'people' && form.personIds.length > 0) ||
    (form.recipientType === 'class' && form.classId) ||
    form.recipientType === 'school'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Send Notification</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Message *</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Send to</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer">
                <input type="radio" name="recipientType" checked={form.recipientType === 'people'}
                  onChange={() => setForm(f => ({ ...f, recipientType: 'people' }))} className="accent-indigo-600" />
                <span className="text-sm text-gray-700">Specific people</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer">
                <input type="radio" name="recipientType" checked={form.recipientType === 'class'}
                  onChange={() => setForm(f => ({ ...f, recipientType: 'class' }))} className="accent-indigo-600" />
                <span className="text-sm text-gray-700">A class</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer">
                <input type="radio" name="recipientType" checked={form.recipientType === 'school'}
                  onChange={() => setForm(f => ({ ...f, recipientType: 'school' }))} className="accent-indigo-600" />
                <span className="text-sm text-gray-700">Everyone in my school</span>
              </label>
            </div>
          </div>

          {form.recipientType === 'people' && (
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-40 overflow-y-auto">
              {roster.length === 0 && (
                <p className="text-sm text-gray-400 py-3 px-3">No teachers or students in your school yet.</p>
              )}
              {roster.map(u => (
                <label key={u.id} className="flex items-center gap-2 py-2 px-3 text-sm cursor-pointer">
                  <input type="checkbox" className="accent-indigo-600"
                    checked={form.personIds.includes(u.id)}
                    onChange={() => togglePerson(u.id)} />
                  <span className="text-gray-700">{u.first_name} {u.last_name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 ml-auto">{u.role}</span>
                </label>
              ))}
            </div>
          )}

          {form.recipientType === 'class' && (
            <div>
              <select value={form.classId} onChange={e => setForm(f => ({ ...f, classId: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
                <option value="">Select a class…</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {classes.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No classes yet — create one first.</p>
              )}
            </div>
          )}

          <button type="submit" disabled={!ready || loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {loading ? 'Sending…' : 'Send Notification'}
          </button>
        </form>
      </div>
    </div>
  );
}

function NotificationsSection({ roster }) {
  const [showSend, setShowSend] = useState(false);
  const [sent, setSent] = useState(false);
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    api.get('/schools/me/classes')
      .then(res => setClasses(res.data || []))
      .catch(() => {}); // non-fatal — the class option just shows empty if this fails
  }, []);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Notifications</p>
        <button onClick={() => { setSent(false); setShowSend(true); }}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          <Bell size={14} /> Send Notification
        </button>
      </div>

      {sent ? (
        <p className="text-sm text-gray-400 py-6 text-center">Notification sent.</p>
      ) : (
        <p className="text-sm text-gray-400 py-6 text-center">
          Send a message to specific people, a class, or your whole school.
        </p>
      )}

      {showSend && (
        <SendNotificationModal
          roster={roster}
          classes={classes}
          onClose={() => setShowSend(false)}
          onSent={() => { setShowSend(false); setSent(true); }}
        />
      )}
    </div>
  );
}

function InviteModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ role: 'teacher', email: '', password: '', first_name: '', last_name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/schools/me/invite', form);
      onCreated(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  const ready = form.email.trim() && form.password.trim().length >= 8 && form.first_name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Add a Teacher or Student</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Creates the account directly, already linked to your school — no join code
          needed for this person. We'll email them their login details.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-3">
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer">
              <input type="radio" name="role" checked={form.role === 'teacher'} onChange={() => setForm(f => ({ ...f, role: 'teacher' }))} className="accent-indigo-600" />
              <span className="text-sm text-gray-700">Teacher</span>
            </label>
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer">
              <input type="radio" name="role" checked={form.role === 'student'} onChange={() => setForm(f => ({ ...f, role: 'student' }))} className="accent-indigo-600" />
              <span className="text-sm text-gray-700">Student</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
              <input value={form.first_name} onChange={set('first_name')} required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
              <input value={form.last_name} onChange={set('last_name')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={set('email')} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Temporary Password *</label>
            <input type="text" value={form.password} onChange={set('password')} required minLength={8}
              placeholder="At least 8 characters"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <button type="submit" disabled={!ready || loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {loading ? 'Creating…' : `Create ${form.role === 'teacher' ? 'Teacher' : 'Student'} Account`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SchoolAdminDashboard() {
  const { logout } = useAuth();
  const [school,  setSchool]  = useState(null);
  const [roster,  setRoster]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [copied,  setCopied]  = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoError, setLogoError] = useState('');
  // Phase 3 Step 5: shared assign-exam-type modal, keyed to which student
  // row triggered it (or null when closed).
  const [assigningStudent, setAssigningStudent] = useState(null);
  const [assigningTeacher, setAssigningTeacher] = useState(null);
  // Remove-from-school (backend: DELETE /schools/me/roster/:userId, already
  // in place) — frontend confirm + trigger for it.
  const [removeConfirm, setRemoveConfirm] = useState(null); // roster row pending removal
  const [removing, setRemoving] = useState(null);           // id currently being removed
  const [removeError, setRemoveError] = useState('');

  const loadRoster = () => {
    api.get('/schools/me/roster')
      .then(res => setRoster(res.data || []))
      .catch(() => {});
  };

  const loadSchool = () => {
    api.get('/schools/me')
      .then(res => setSchool(res.data || null))
      .catch(() => {});
  };

  const handleRemove = async () => {
    if (!removeConfirm) return;
    const target = removeConfirm;
    setRemoveConfirm(null);
    setRemoveError('');
    setRemoving(target.id);
    try {
      await api.delete(`/schools/me/roster/${target.id}`);
      setRoster(prev => (prev || []).filter(u => u.id !== target.id));
    } catch (err) {
      setRemoveError(err?.response?.data?.error || err?.message || 'Could not remove user.');
    } finally {
      setRemoving(null);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get('/schools/me'),
      api.get('/schools/me/roster'),
    ])
      .then(([schoolRes, rosterRes]) => {
        setSchool(schoolRes.data || null);
        setRoster(rosterRes.data || []);
      })
      .catch(err => setError(err?.response?.data?.error || 'Could not load your school.'))
      .finally(() => setLoading(false));
  }, []);

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    setLogoSaving(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      await api.patch('/schools/me/logo', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      loadSchool();
    } catch (err) {
      setLogoError(err?.response?.data?.error || err?.message || 'Could not update logo.');
    } finally {
      setLogoSaving(false);
    }
  };

  const teachers = (roster || []).filter(u => u.role === 'teacher');
  const students = (roster || []).filter(u => u.role === 'student');
  const admins   = (roster || []).filter(u => u.role === 'school_admin');

  const copyCode = () => {
    if (!school?.join_code) return;
    navigator.clipboard?.writeText(school.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="relative w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center overflow-hidden cursor-pointer group shrink-0">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickLogo} className="hidden" />
            {school?.logo_url
              ? <img src={school.logo_url} alt="" className="w-full h-full object-cover" />
              : <School size={18} className="text-indigo-600" />}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              {logoSaving
                ? <Loader2 size={12} className="text-white animate-spin" />
                : <ImageIcon size={12} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />}
            </span>
          </label>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {school?.name || 'Your School'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">School Admin</p>
              {school?.enable_aischoolonair && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-semibold">AISchoolonair</span>
              )}
              {school?.enable_em && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-semibold">EM</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <LogOut size={15} /> Sign out
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Your School</h1>
        <p className="text-sm text-gray-500 mb-6">
          Only your own school's teachers and students — this view can't see any other
          school's data, and no other school can see yours.
        </p>

        {logoError && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{logoError}</p>
          </div>
        )}

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <UserCheck size={16} className="text-indigo-500 mb-2" />
                <p className="text-xl font-bold text-gray-900">{admins.length}</p>
                <p className="text-xs text-gray-400">Admins</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <Users size={16} className="text-indigo-500 mb-2" />
                <p className="text-xl font-bold text-gray-900">{teachers.length}</p>
                <p className="text-xs text-gray-400">Teachers</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <GraduationCap size={16} className="text-indigo-500 mb-2" />
                <p className="text-xl font-bold text-gray-900">{students.length}</p>
                <p className="text-xs text-gray-400">Students</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <span className="text-[11px] font-bold text-indigo-500 mb-2 block">EM</span>
                <p className="text-xl font-bold text-gray-900">{(roster || []).filter(u => u.uses_english_masterclass).length}</p>
                <p className="text-xs text-gray-400">Use Language Masterclass</p>
              </div>
            </div>

            {school?.join_code && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-indigo-900">Your join code</p>
                  <p className="text-xs text-indigo-600 mt-0.5">Give this to new teachers and students — they enter it once from their account to join.</p>
                </div>
                <button onClick={copyCode}
                  className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-indigo-700 hover:border-indigo-400 transition-colors shrink-0 ml-4">
                  {school.join_code}
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-indigo-400" />}
                </button>
              </div>
            )}

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Roster</p>
                <button onClick={() => setShowInvite(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  <Plus size={14} /> Add Teacher or Student
                </button>
              </div>
              {removeError && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{removeError}</p>
                </div>
              )}
              {(roster || []).length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">
                  No one has joined your school yet. Share your join code above to get started.
                </p>
              )}
              <div className="divide-y divide-gray-50">
                {(roster || []).map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-gray-800">{u.first_name} {u.last_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{u.email}</span>
                      {u.uses_english_masterclass && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600" title="Also uses Language Masterclass">
                          EM
                        </span>
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {u.role.replace('_', ' ')}
                      </span>
                      {/* EM-only guard: exam types/subjects are an
                          AISchoolonair-only concept — hidden entirely when
                          this school hasn't been granted AISchoolonair,
                          since in that case every student in this roster is
                          EM-only, not just some. Enforced authoritatively
                          server-side (see the is_em_only check in
                          POST /students/:studentId/assign-exam-type) — this
                          is just keeping the option from being offered when
                          it can never succeed. */}
                      {u.role === 'student' && school?.enable_aischoolonair && (
                        <>
                          <button onClick={() => setAssigningStudent(u)}
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
                            <GraduationCap size={12} /> Assign Exam Type
                          </button>
                          <Link to={`/school-admin/students/${u.id}`} state={{ student: u }}
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
                            <FileText size={12} /> Report
                          </Link>
                        </>
                      )}
                      {u.role === 'student' && !school?.enable_aischoolonair && (
                        <Link to={`/school-admin/students/${u.id}`} state={{ student: u }}
                          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
                          <FileText size={12} /> Report
                        </Link>
                      )}
                      {u.role === 'teacher' && (
                        <button onClick={() => setAssigningTeacher(u)}
                          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
                          <BookOpen size={12} /> Assign Subjects
                        </button>
                      )}
                      {(u.role === 'student' || u.role === 'teacher') && (
                        removing === u.id ? (
                          <Loader2 size={14} className="animate-spin text-red-300 shrink-0" />
                        ) : (
                          <button
                            onClick={() => setRemoveConfirm(u)}
                            title={`Remove this ${u.role} from your school`}
                            className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ClassesSection teachers={teachers} students={students} />
            <NotificationsSection roster={[...teachers, ...students]} />
          </>
        )}
      </div>

      {removeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  Remove {removeConfirm.first_name} {removeConfirm.last_name}?
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  They'll lose access to your school{removeConfirm.role === 'teacher' ? ' and be unassigned from their subjects here' : ' and be removed from any classes'}.
                  Their account itself isn't deleted — they can rejoin with a new invite or join code.
                </p>
              </div>
              <button
                onClick={() => setRemoveConfirm(null)}
                className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-500 transition-colors ml-auto">
                <X size={15} />
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setRemoveConfirm(null)}
                className="flex-1 text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRemove}
                className="flex-1 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl transition-colors">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={() => {
            setShowInvite(false);
            loadRoster();
          }}
        />
      )}

      {assigningStudent && (
        <AssignExamTypeModal
          studentId={assigningStudent.id}
          studentName={`${assigningStudent.first_name} ${assigningStudent.last_name}`}
          onClose={() => setAssigningStudent(null)}
          onAssigned={loadRoster}
        />
      )}

      {assigningTeacher && (
        <AssignSubjectsModal
          teacher={assigningTeacher}
          onClose={() => setAssigningTeacher(null)}
          onAssigned={loadRoster}
        />
      )}
    </div>
  );
}
