// client/src/pages/TeacherContentPage.jsx
//
// Teacher Topic & Subtopic Management
// URL: /teacher/content
//
// TASK 14: Added ConceptList component embedded under each subtopic row.
//   - Import ConceptList from '../components/ConceptList'
//   - Each subtopic row now wraps in a block div with ConceptList below it
//   - Removed the old standalone concept_count badge (ConceptList toggle shows count)

import { useState, useEffect, useRef } from 'react';
import { Link }                        from 'react-router-dom';
import api                             from '../services/apiClient';
import TopNav                          from '../components/TopNav';
import ConceptList                     from '../components/ConceptList';
import {
  BookOpen, Plus, ChevronDown, ChevronUp,
  Pencil, Trash2, Loader2, CheckCircle, AlertTriangle,
  X, Save, Layers, FileText, Lock,
} from 'lucide-react';

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3
      rounded-2xl shadow-xl text-sm font-semibold text-white
      ${type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
      {type === 'success'
        ? <CheckCircle size={14} className="text-blue-400 shrink-0" />
        : <AlertTriangle size={14} className="shrink-0" />}
      <span>{msg}</span>
      <button onClick={onClose}><X size={13} className="opacity-60" /></button>
    </div>
  );
}

// ── Inline editable name field ────────────────────────────────────────────────
function InlineEdit({ value, onSave, onCancel, placeholder = 'Enter name…' }) {
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const handleKey = e => {
    if (e.key === 'Enter')  onSave(val);
    if (e.key === 'Escape') onCancel();
  };
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      />
      <button onClick={() => onSave(val)}
        className="p-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors">
        <Save size={13} />
      </button>
      <button onClick={onCancel}
        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
        <X size={13} />
      </button>
    </div>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────
// ── C2 fix: build a specific delete-impact message from real counts ──────────
// Falls back to a sensible generic sentence if the impact fetch failed for
// any reason (e.g. students_affected: null), rather than blocking deletion
// or showing a misleading number.
function buildTopicDeleteMessage(topic, impact) {
  const count = impact?.subtopic_count ?? topic?.subtopic_count ?? 0;

  if (count === 0) {
    return `Delete topic "${topic.name}"? It has no subtopics, so nothing else will be affected.`;
  }

  const subtopicPart = `${count} subtopic${count === 1 ? '' : 's'}`;
  const studentsAffected = impact?.students_affected;

  if (studentsAffected === null || studentsAffected === undefined) {
    return `Delete topic "${topic.name}"? This will remove ${subtopicPart} from students' view. Could not check how many students have progress on them.`;
  }

  if (studentsAffected === 0) {
    return `Delete topic "${topic.name}"? This will remove ${subtopicPart}. No students currently have progress recorded on them.`;
  }

  return `Delete topic "${topic.name}"? This will remove ${subtopicPart} and permanently erase progress data for ${studentsAffected} student${studentsAffected === 1 ? '' : 's'} who studied them. This cannot be undone.`;
}

function ConfirmModal({ message, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add-item row ──────────────────────────────────────────────────────────────
function AddRow({ placeholder, onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const handle = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onAdd(name.trim(), desc.trim() || null);
    setSaving(false);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 mb-2">
      <input
        ref={ref}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      />
      <input
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Description (optional)"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={handle} disabled={saving || !name.trim()}
          className="px-4 py-1.5 text-sm font-semibold bg-blue-500 hover:bg-blue-600
            disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
    </div>
  );
}

// ── Subtopic list inside an expanded topic ────────────────────────────────────
function SubtopicList({ topic, subjectId, showToast }) {
  const [subtopics,   setSubtopics]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAdd,     setShowAdd]     = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/teacher/subtopics', { params: { topic_id: topic.id } })
      .then(r => setSubtopics(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setSubtopics([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [topic.id]); // eslint-disable-line

  const handleAdd = async (name, description) => {
    try {
      const r = await api.post('/teacher/subtopics', {
        topic_id: topic.id, subject_id: subjectId, name, description,
        order_index: subtopics.length,
      });
      const created = r.data ?? r;
      setSubtopics(prev => [...prev, created]);
      setShowAdd(false);
      showToast('Subtopic added!');
    } catch (err) {
      showToast(err?.message || 'Failed to add subtopic', 'error');
    }
  };

  const handleEdit = async (id, newName) => {
    if (!newName.trim()) return;
    try {
      const r = await api.put(`/teacher/subtopics/${id}`, { name: newName.trim() });
      const updated = r.data ?? r;
      // Use name from server response; fall back to what we sent if server returns null
      const resolvedName = updated?.name || newName.trim();
      setSubtopics(prev => prev.map(s => s.id === id ? { ...s, name: resolvedName } : s));
      setEditingId(null);
      showToast('Subtopic updated!');
    } catch (err) {
      showToast(err?.message || 'Failed to update subtopic', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await api.delete(`/teacher/subtopics/${confirmDel.id}`);
      setSubtopics(prev => prev.filter(s => s.id !== confirmDel.id));
      showToast('Subtopic deleted.');
    } catch (err) {
      showToast(err?.message || 'Failed to delete subtopic', 'error');
    } finally {
      setDeleting(false);
      setConfirmDel(null);
    }
  };

  // C1: move a subtopic up or down by swapping order_index with its neighbour
  const moveSubtopic = async (idx, direction) => {
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= subtopics.length) return;
    const a = subtopics[idx];
    const b = subtopics[swapIdx];
    // Optimistic UI update
    const next = [...subtopics];
    next[idx]     = { ...a, order_index: b.order_index };
    next[swapIdx] = { ...b, order_index: a.order_index };
    next.sort((x, y) => (x.order_index ?? 0) - (y.order_index ?? 0));
    setSubtopics(next);
    try {
      await Promise.all([
        api.put(`/teacher/subtopics/${a.id}`, { order_index: b.order_index }),
        api.put(`/teacher/subtopics/${b.id}`, { order_index: a.order_index }),
      ]);
    } catch {
      // Revert on failure
      load();
      showToast('Failed to reorder subtopics', 'error');
    }
  };

  if (loading) return (
    <div className="py-4 flex justify-center">
      <Loader2 size={16} className="animate-spin text-blue-400" />
    </div>
  );

  return (
    <div className="px-5 pb-4 pt-1">
      {subtopics.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400 py-2">No subtopics yet. Add one below.</p>
      )}

      {subtopics.map(sub => (
        // TASK 14: wrapped in block div so ConceptList renders below each row
        <div key={sub.id} className="border-b border-gray-50 last:border-0">
          {/* Subtopic row */}
          <div className="flex items-center gap-2 py-2 group">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />

            {editingId === sub.id ? (
              <InlineEdit
                value={sub.name}
                onSave={v => handleEdit(sub.id, v)}
                onCancel={() => setEditingId(null)}
                placeholder="Subtopic name"
              />
            ) : (
              <>
                <span className="text-sm text-gray-700 flex-1">{sub.name}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {/* C1: reorder buttons */}
                  <button
                    onClick={() => moveSubtopic(subtopics.indexOf(sub), -1)}
                    disabled={subtopics.indexOf(sub) === 0}
                    title="Move up"
                    className="p-1 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveSubtopic(subtopics.indexOf(sub), 1)}
                    disabled={subtopics.indexOf(sub) === subtopics.length - 1}
                    title="Move down"
                    className="p-1 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                    <ChevronDown size={12} />
                  </button>
                  <button onClick={() => setEditingId(sub.id)}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => setConfirmDel(sub)}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* TASK 14: Concept management embedded below each subtopic */}
          <ConceptList subtopic={sub} showToast={showToast} />
        </div>
      ))}

      {showAdd ? (
        <AddRow
          placeholder="Subtopic name e.g. Cell Division"
          onAdd={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 font-medium
            hover:text-blue-800 transition-colors">
          <Plus size={12} /> Add subtopic
        </button>
      )}

      {confirmDel && (
        <ConfirmModal
          message={`Delete subtopic "${confirmDel.name}"? This will also hide all its concepts from students.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

// ── Topic card ────────────────────────────────────────────────────────────────
function TopicCard({ topic, idx, totalTopics, subjectId, showToast, onEdit, onDelete, onMove }) {
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-3">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => setExpanded(e => !e)}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {editing ? (
          <InlineEdit
            value={topic.name}
            onSave={v => { onEdit(topic.id, v); setEditing(false); }}
            onCancel={() => setEditing(false)}
            placeholder="Topic name"
          />
        ) : (
          <span className="text-sm font-semibold text-gray-800 flex-1">{topic.name}</span>
        )}

        {!editing && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
            {topic.subtopic_count} subtopic{topic.subtopic_count !== 1 ? 's' : ''}
          </span>
        )}

        {!editing && (
          <div className="flex gap-1 shrink-0">
            {/* C1: reorder buttons for topics */}
            <button
              onClick={() => onMove(idx, -1)}
              disabled={idx === 0}
              title="Move topic up"
              className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronUp size={13} />
            </button>
            <button
              onClick={() => onMove(idx, 1)}
              disabled={idx === totalTopics - 1}
              title="Move topic down"
              className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronDown size={13} />
            </button>
            <button onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={() => onDelete(topic)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {false && !editing && !topic.created_by_me && (
          <span title="Created by admin — read only"
            className="flex items-center gap-1 text-xs text-gray-300 shrink-0">
            <Lock size={11} /> Admin
          </span>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-50">
          <SubtopicList topic={topic} subjectId={subjectId} showToast={showToast} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function TeacherContentPage() {
  const [subjects,     setSubjects]     = useState([]);
  const [activeSubj,   setActiveSubj]   = useState(null);
  const [topics,       setTopics]       = useState([]);
  const [loadingSubj,  setLoadingSubj]  = useState(true);
  const [loadingTop,   setLoadingTop]   = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(null);
  const [deleteImpact, setDeleteImpact] = useState(null);   // { subtopic_count, subtopic_names, students_affected }
  const [loadingImpact,setLoadingImpact]= useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState(null);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => {
        const list = Array.isArray(r) ? r : (r.data ?? []);
        setSubjects(list);
        if (list.length > 0) setActiveSubj(list[0]);
      })
      .catch(() => setSubjects([]))
      .finally(() => setLoadingSubj(false));
  }, []);

  useEffect(() => {
    if (!activeSubj) return;
    setLoadingTop(true);
    setTopics([]);
    setShowAddTopic(false);
    api.get('/teacher/topics', { params: { subject_id: activeSubj.id } })
      .then(r => setTopics(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setTopics([]))
      .finally(() => setLoadingTop(false));
  }, [activeSubj?.id]); // eslint-disable-line

  const handleAddTopic = async (name, description) => {
    try {
      const r = await api.post('/teacher/topics', {
        subject_id: activeSubj.id, name, description,
        order_index: topics.length,
      });
      const created = r.data ?? r;
      setTopics(prev => [...prev, created]);
      setShowAddTopic(false);
      showToast('Topic added!');
    } catch (err) {
      showToast(err?.message || 'Failed to add topic', 'error');
    }
  };

  const handleEditTopic = async (id, name) => {
    try {
      const r = await api.put(`/teacher/topics/${id}`, { name });
      const updated = r.data ?? r;
      setTopics(prev => prev.map(t => t.id === id ? { ...t, name: updated.name } : t));
      showToast('Topic updated!');
    } catch (err) {
      showToast(err?.message || 'Failed to update topic', 'error');
    }
  };

  // C1: move a topic up or down by swapping order_index with its neighbour
  const handleMoveTopic = async (idx, direction) => {
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= topics.length) return;
    const a = topics[idx];
    const b = topics[swapIdx];
    const next = [...topics];
    next[idx]     = { ...a, order_index: b.order_index };
    next[swapIdx] = { ...b, order_index: a.order_index };
    next.sort((x, y) => (x.order_index ?? 0) - (y.order_index ?? 0));
    setTopics(next);
    try {
      await Promise.all([
        api.put(`/teacher/topics/${a.id}`, { order_index: b.order_index }),
        api.put(`/teacher/topics/${b.id}`, { order_index: a.order_index }),
      ]);
    } catch {
      // Revert on failure
      if (!activeSubj) return;
      api.get('/teacher/topics', { params: { subject_id: activeSubj.id } })
        .then(r => setTopics(Array.isArray(r) ? r : (r.data ?? [])))
        .catch(() => {});
      showToast('Failed to reorder topics', 'error');
    }
  };

  const handleDeleteTopic = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await api.delete(`/teacher/topics/${confirmDel.id}`);
      setTopics(prev => prev.filter(t => t.id !== confirmDel.id));
      showToast('Topic deleted.');
    } catch (err) {
      showToast(err?.message || 'Failed to delete topic', 'error');
    } finally {
      setDeleting(false);
      setConfirmDel(null);
      setDeleteImpact(null);
    }
  };

  // C2 fix: fetch the real cascade impact (subtopic count + students with
  // recorded progress) BEFORE showing the confirmation, so the warning is
  // specific to this exact topic instead of a static sentence that's the
  // same regardless of what's actually about to be removed.
  const openDeleteConfirm = async (topic) => {
    setConfirmDel(topic);
    setDeleteImpact(null);
    setLoadingImpact(true);
    try {
      const r = await api.get(`/teacher/topics/${topic.id}/delete-impact`);
      setDeleteImpact(r.data || r);
    } catch {
      // If the impact check fails, fall back to the topic's own subtopic_count
      // (already present on the topic object from GET /teacher/topics) rather
      // than blocking the delete flow entirely.
      setDeleteImpact({ subtopic_count: topic.subtopic_count || 0, students_affected: null, subtopic_names: [] });
    } finally {
      setLoadingImpact(false);
    }
  };

  const myTopicsCount    = topics.filter(t => t.created_by_me).length;
  const adminTopicsCount = topics.filter(t => !t.created_by_me).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-white/50 text-xs mb-1">Teacher</p>
            <h1 className="text-white text-xl font-bold">Content Management</h1>
            <p className="text-white/60 text-sm mt-0.5">
              Manage topics, subtopics and concepts for your assigned subjects
            </p>
          </div>
          <Link to="/teacher/dashboard"
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors">
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {!loadingSubj && subjects.length === 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-8 text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-amber-300" />
            <p className="text-sm font-semibold text-amber-800">No subjects assigned yet</p>
            <p className="text-xs text-amber-600 mt-1">
              Ask your admin to assign you a subject before you can manage content.
            </p>
          </div>
        )}

        {loadingSubj && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        )}

        {!loadingSubj && subjects.length > 0 && (
          <>
            <div className="flex gap-2 flex-wrap mb-6">
              {subjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSubj(s)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors border
                    ${activeSubj?.id === s.id
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
                >
                  {s.icon_emoji && <span>{s.icon_emoji}</span>}
                  {s.name}
                  {s.exam_board_code && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                      ${activeSubj?.id === s.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {s.exam_board_code}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {!loadingTop && activeSubj && (
              <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Layers size={12} className="text-blue-500" />
                  <strong className="text-gray-700">{topics.length}</strong> total topics
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={12} className="text-blue-500" />
                  <strong className="text-gray-700">{myTopicsCount}</strong> created by you
                </span>
                {adminTopicsCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Lock size={11} className="text-gray-400" />
                    <strong className="text-gray-700">{adminTopicsCount}</strong> by admin
                  </span>
                )}
              </div>
            )}

            {loadingTop ? (
              <div className="flex justify-center py-12">
                <Loader2 size={20} className="animate-spin text-blue-400" />
              </div>
            ) : (
              <>
                {topics.length === 0 && !showAddTopic && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center mb-3">
                    <Layers size={32} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400">
                      No topics yet for <strong>{activeSubj?.name}</strong>.<br />
                      Add your first topic to get started.
                    </p>
                  </div>
                )}

                {topics.map((topic, idx) => (
                  <TopicCard
                    key={topic.id}
                    topic={topic}
                    idx={idx}
                    totalTopics={topics.length}
                    subjectId={activeSubj.id}
                    showToast={showToast}
                    onEdit={handleEditTopic}
                    onDelete={openDeleteConfirm}
                    onMove={handleMoveTopic}
                  />
                ))}

                {showAddTopic ? (
                  <AddRow
                    placeholder="Topic name e.g. Cell Biology"
                    onAdd={handleAddTopic}
                    onCancel={() => setShowAddTopic(false)}
                  />
                ) : (
                  <button
                    onClick={() => setShowAddTopic(true)}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed
                      border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-blue-300
                      hover:text-blue-600 transition-colors"
                  >
                    <Plus size={15} /> Add a new topic
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {confirmDel && (
        <ConfirmModal
          message={
            loadingImpact
              ? `Checking what depends on "${confirmDel.name}"…`
              : buildTopicDeleteMessage(confirmDel, deleteImpact)
          }
          onConfirm={handleDeleteTopic}
          onCancel={() => { setConfirmDel(null); setDeleteImpact(null); }}
          loading={deleting || loadingImpact}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
