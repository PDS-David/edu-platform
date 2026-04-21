// client/src/components/ConceptList.jsx
// ─────────────────────────────────────────────────────────────────────────────
// TASK 14 — Concept Management UI
// Embedded inside SubtopicList when a subtopic row is expanded.
// Shows concepts for a subtopic; teacher can add, edit, delete their own.
//
// Usage (inside SubtopicList subtopic row):
//   <ConceptList subtopic={sub} showToast={showToast} />
//
// API endpoints used:
//   GET    /api/concepts?subtopic_id=:id   → list concepts
//   POST   /api/concepts                   → create concept
//   PUT    /api/concepts/:id               → update concept
//   DELETE /api/concepts/:id               → delete concept
//
// Response shape: { success, data: [...] }  or flat array — handled with
//   Array.isArray(r) ? r : (r.data ?? [])
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import api from '../services/apiClient';
import {
  Plus, Pencil, Trash2, Loader2, Save, X,
  ChevronDown, ChevronUp, BookMarked, Lock,
} from 'lucide-react';

// ── Confirm delete modal (local, lightweight) ─────────────────────────────────
function DeleteConfirm({ name, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5">
        <p className="text-sm text-gray-700 mb-4">
          Delete concept <strong>"{name}"</strong>? Students will no longer see it.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl py-2 text-sm font-semibold flex items-center justify-center gap-1.5">
            {loading && <Loader2 size={12} className="animate-spin" />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline edit / add form ────────────────────────────────────────────────────
function ConceptForm({ initial = {}, onSave, onCancel }) {
  const [title,       setTitle]       = useState(initial.title || '');
  const [description, setDescription] = useState(initial.description || '');
  const [saving,      setSaving]      = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const handle = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), description: description.trim() || null });
    setSaving(false);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 my-1">
      <input
        ref={ref}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Concept title e.g. Mitosis vs Meiosis"
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs
          focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Short description (optional)"
        rows={2}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs resize-none
          focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={handle} disabled={saving || !title.trim()}
          className="px-3 py-1 text-xs font-semibold bg-blue-500 hover:bg-blue-600
            disabled:opacity-50 text-white rounded-lg flex items-center gap-1">
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ConceptList({ subtopic, showToast }) {
  const [concepts,    setConcepts]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  // Load on expand
  useEffect(() => {
    if (!expanded) return;
    if (concepts.length > 0) return; // already loaded
    setLoading(true);
    api.get('/concepts', { params: { subtopic_id: subtopic.id } })
      .then(r => setConcepts(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setConcepts([]))
      .finally(() => setLoading(false));
  }, [expanded, subtopic.id]); // eslint-disable-line

  const handleAdd = async ({ title, description }) => {
    try {
      const r = await api.post('/concepts', {
        subtopic_id: subtopic.id,
        title,
        description,
        order_index: concepts.length,
      });
      const created = r.data ?? r;
      setConcepts(prev => [...prev, created]);
      setShowAdd(false);
      showToast('Concept added!');
    } catch (err) {
      showToast(err?.error || 'Failed to add concept', 'error');
    }
  };

  const handleEdit = async (id, { title, description }) => {
    try {
      const r = await api.put(`/concepts/${id}`, { title, description });
      const updated = r.data ?? r;
      setConcepts(prev => prev.map(c =>
        c.id === id ? { ...c, title: updated.title, description: updated.description } : c
      ));
      setEditingId(null);
      showToast('Concept updated!');
    } catch (err) {
      showToast(err?.error || 'Failed to update concept', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await api.delete(`/concepts/${confirmDel.id}`);
      setConcepts(prev => prev.filter(c => c.id !== confirmDel.id));
      showToast('Concept deleted.');
    } catch (err) {
      showToast(err?.error || 'Failed to delete concept', 'error');
    } finally {
      setDeleting(false);
      setConfirmDel(null);
    }
  };

  const conceptCount = subtopic.concept_count ?? concepts.length;

  return (
    <div className="ml-4 mt-1">
      {/* Toggle row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors py-1 group"
      >
        <BookMarked size={11} className="group-hover:text-blue-500 transition-colors" />
        <span className="font-medium">
          {conceptCount > 0 ? `${conceptCount} concept${conceptCount !== 1 ? 's' : ''}` : 'Concepts'}
        </span>
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {expanded && (
        <div className="pl-2 border-l-2 border-blue-100 ml-1 mt-1 space-y-0.5">
          {loading && (
            <div className="py-2 flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={11} className="animate-spin" /> Loading concepts…
            </div>
          )}

          {!loading && concepts.length === 0 && !showAdd && (
            <p className="text-xs text-gray-400 py-1">No concepts yet.</p>
          )}

          {!loading && concepts.map(concept => (
            <div key={concept.id} className="group">
              {editingId === concept.id && concept.created_by_me ? (
                <ConceptForm
                  initial={{ title: concept.title, description: concept.description }}
                  onSave={data => handleEdit(concept.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start gap-2 py-1.5 rounded-lg hover:bg-gray-50 px-1 -mx-1">
                  <div className="w-1 h-1 rounded-full bg-gray-300 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 leading-snug">{concept.title}</p>
                    {concept.description && (
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug line-clamp-2">
                        {concept.description}
                      </p>
                    )}
                  </div>
                  {concept.created_by_me ? (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => setEditingId(concept.id)}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit concept"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={() => setConfirmDel(concept)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete concept"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ) : (
                    <Lock size={9} className="text-gray-200 shrink-0 mt-1 opacity-0 group-hover:opacity-100" title="Admin-created" />
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add concept form */}
          {showAdd && (
            <ConceptForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />
          )}

          {!showAdd && !loading && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 font-medium mt-1 transition-colors"
            >
              <Plus size={10} /> Add concept
            </button>
          )}
        </div>
      )}

      {confirmDel && (
        <DeleteConfirm
          name={confirmDel.title}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
