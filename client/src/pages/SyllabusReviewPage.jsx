// client/src/pages/SyllabusReviewPage.jsx
//
// Syllabus-driven topic mapping — Prompt 3, Part 2 of 3 (frontend review
// screen). Part 1 (backend: GET /api/syllabus, GET /api/syllabus/:id,
// POST /api/syllabus/:id/confirm) already merged — see server/routes/
// syllabusRoutes.js. Part 3 (upload form, nav entries, App.jsx routing) is
// explicitly NOT built here per instruction — this file is not yet wired
// into any route or nav array. It expects a single route param, `id`
// (the syllabus_documents.id, a UUID), whatever path Part 3 ends up
// registering it under for admin/teacher.
//
// DATA MODEL: the locally-edited tree is kept as the exact same FLAT,
// ORDERED array shape extracted_structure.nodes already uses
// ({ title, level, number }), NOT converted into a nested tree structure.
// This is deliberate: it's exactly what POST /:id/confirm's `nodes` body
// expects (see that route's own contract comment — "whatever the client
// submits is what gets created"), so there is no tree<->flat-array
// conversion step that could introduce a bug between what's shown on
// screen and what gets written. Indentation is purely a rendering
// concern, derived from each node's own `level`.
//
// CLIENT-SIDE VALIDATION mirrors the backend's dry-run pass in
// POST /:id/confirm EXACTLY (same three rules: a level-2 node needs a
// preceding level-1; a level-3 node needs a preceding level-2 since the
// last level-1). This is deliberately duplicated, not trusted to the
// server alone, so an invalid tree is caught immediately in the UI
// (Confirm disabled, inline error shown) rather than only after a
// failed POST — matching this feature's own "the edit step must not be
// cosmetic-only" verification requirement.
//
// BACKEND GAP FILLED HERE: Part 2's brief requires a "re-trigger" action
// on the failed state, but no retry endpoint exists in Part 1's backend
// (only the upload route triggers extraction, once, fire-and-forget).
// A minimal POST /api/syllabus/:id/retry was added to
// server/routes/syllabusRoutes.js to make this button function — it just
// re-invokes the same beginExtraction() the upload route already calls,
// with the same auth/ownership checks as confirm. Flagged here rather
// than silently building a non-functional button.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Loader2, AlertTriangle, CheckCircle, X, Save, Plus, Trash2,
  ChevronLeft, ChevronRight, RefreshCw, FileText, ArrowLeft,
} from 'lucide-react';

const POLL_INTERVAL_MS = 4000;
const LEVEL_LABELS = { 1: 'Topic', 2: 'Subtopic', 3: 'Sub-subtopic' };

// ── Toast — same shape as TeacherContentPage.jsx's, for visual consistency
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

// ── Inline editable title — same interaction pattern as
// TeacherContentPage.jsx's InlineEdit (Enter=save, Escape=cancel),
// auto-focused on mount.
function InlineTitleEdit({ value, onSave, onCancel }) {
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const handleKey = (e) => {
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
        placeholder="Topic title…"
        className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      />
      <button onClick={() => onSave(val)}
        className="p-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors" title="Save">
        <Save size={13} />
      </button>
      <button onClick={onCancel}
        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors" title="Cancel">
        <X size={13} />
      </button>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
            {loading && <Loader2 size={13} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Local flat-array helpers ─────────────────────────────────────────────
// A node's "subtree" in the flat array = itself plus every immediately-
// following node whose level is strictly greater, stopping at the first
// node whose level is <= this node's own level (or the end of the array).
function subtreeEnd(nodes, index) {
  const level = nodes[index].level;
  let i = index + 1;
  while (i < nodes.length && nodes[i].level > level) i++;
  return i; // exclusive end
}

// Mirrors POST /:id/confirm's own dry-run pass exactly (same 3 rules) so
// an invalid tree is caught client-side before ever attempting a submit.
function validateTree(nodes) {
  const errors = [];
  let sawTopic = false, sawSubtopicSinceTopic = false;
  nodes.forEach((n, i) => {
    if (n.level === 1) { sawTopic = true; sawSubtopicSinceTopic = false; }
    if (n.level === 2) {
      if (!sawTopic) errors.push({ index: i, message: `"${n.title || 'Untitled'}" is a subtopic with no topic above it.` });
      sawSubtopicSinceTopic = true;
    }
    if (n.level === 3) {
      if (!sawSubtopicSinceTopic) errors.push({ index: i, message: `"${n.title || 'Untitled'}" is a sub-subtopic with no subtopic above it.` });
    }
    if (!String(n.title || '').trim()) errors.push({ index: i, message: `Node ${i + 1} needs a title.` });
  });
  return errors;
}

let _keyCounter = 0;
const nextKey = () => `n${Date.now()}_${_keyCounter++}`;

export default function SyllabusReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doc,       setDoc]       = useState(null);   // full syllabus_documents row from GET /:id
  const [nodes,     setNodes]     = useState(null);    // locally-editable flat array, null until loaded
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast,     setToast]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // index pending delete confirm
  const [editingKey, setEditingKey]     = useState(null);  // key of node currently inline-editing
  const [confirming, setConfirming]     = useState(false);
  const [retrying,   setRetrying]       = useState(false);
  const [confirmedResult, setConfirmedResult] = useState(null); // { topics, subtopics } after a successful confirm

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/syllabus/${id}`);
      const d = r.data;
      setDoc(d);
      setLoadError('');
      if (d.status === 'extracted' && nodes === null) {
        // Seed local editable state from the stored AI output, once —
        // never re-seed on a later poll/reload so in-progress edits are
        // never silently clobbered.
        const seeded = (d.extracted_structure?.nodes || []).map(n => ({
          key: nextKey(), title: n.title, level: n.level, number: n.number ?? null,
        }));
        setNodes(seeded);
      }
      return d;
    } catch (err) {
      setLoadError(err?.response?.data?.error || err?.message || 'Could not load this syllabus document.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, nodes]);

  // Initial load
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Poll while processing/uploaded — stop as soon as status moves on.
  useEffect(() => {
    if (!doc) return;
    if (doc.status === 'processing' || doc.status === 'uploaded') {
      pollRef.current = setTimeout(() => load(), POLL_INTERVAL_MS);
    }
    return () => clearTimeout(pollRef.current);
  }, [doc, load]);

  const errors = nodes ? validateTree(nodes) : [];
  const errorsByIndex = new Map(errors.map(e => [e.index, e.message]));

  const updateNode = (index, patch) => {
    setNodes(prev => prev.map((n, i) => i === index ? { ...n, ...patch } : n));
  };

  const changeLevel = (index, delta) => {
    setNodes(prev => {
      const next = [...prev];
      const newLevel = Math.min(3, Math.max(1, next[index].level + delta));
      next[index] = { ...next[index], level: newLevel };
      return next;
    });
  };

  const deleteSubtree = (index) => {
    setNodes(prev => {
      const end = subtreeEnd(prev, index);
      return [...prev.slice(0, index), ...prev.slice(end)];
    });
    setDeleteTarget(null);
  };

  // Adds a new sibling node at the SAME level, right after this node's own
  // subtree — the most predictable place to insert "a missed node" without
  // needing an arbitrary drag/drop position picker (reordering is
  // explicitly deferred per the spec this is built from).
  const addSiblingAfter = (index) => {
    setNodes(prev => {
      const level = prev[index].level;
      const insertAt = subtreeEnd(prev, index);
      const created = { key: nextKey(), title: '', level, number: null };
      const next = [...prev.slice(0, insertAt), created, ...prev.slice(insertAt)];
      setEditingKey(created.key);
      return next;
    });
  };

  const addTopicAtEnd = () => {
    const created = { key: nextKey(), title: '', level: 1, number: null };
    setNodes(prev => [...prev, created]);
    setEditingKey(created.key);
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.post(`/syllabus/${id}/retry`);
      showToast('Extraction restarted.');
      setDoc(d => ({ ...d, status: 'processing', failure_reason: null }));
    } catch (err) {
      showToast(err?.response?.data?.error || err?.message || 'Could not restart extraction.', 'error');
    } finally {
      setRetrying(false);
    }
  };

  const handleConfirm = async () => {
    const currentErrors = validateTree(nodes);
    if (currentErrors.length) {
      showToast('Fix the highlighted issues before confirming.', 'error');
      return;
    }
    setConfirming(true);
    try {
      const payload = {
        nodes: nodes.map(({ title, level, number }) => ({ title: title.trim(), level, number })),
      };
      const r = await api.post(`/syllabus/${id}/confirm`, payload);
      setConfirmedResult(r.data);
      showToast('Syllabus confirmed — topics and subtopics have been created.');
    } catch (err) {
      showToast(err?.response?.data?.error || err?.message || 'Could not confirm this syllabus.', 'error');
    } finally {
      setConfirming(false);
    }
  };

  // ── Loading / error / terminal states ───────────────────────────────────
  if (loading && !doc) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (loadError && !doc) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-6 rounded-2xl border border-red-100 bg-red-50">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 mb-1">Could not load this document</p>
            <p className="text-sm text-red-600">{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={18} className="text-gray-400" />
            {doc.title || 'Syllabus document'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {doc.subject_name} · {doc.exam_board_name}
          </p>
        </div>
      </div>

      {/* Processing / uploaded — polling in progress */}
      {(doc.status === 'processing' || doc.status === 'uploaded') && (
        <div className="p-8 rounded-2xl border border-gray-100 bg-gray-50 text-center">
          <Loader2 size={22} className="animate-spin text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700">Extracting the topic structure…</p>
          <p className="text-xs text-gray-400 mt-1">This page updates automatically — no need to refresh.</p>
        </div>
      )}

      {/* Failed */}
      {doc.status === 'failed' && (
        <div className="p-6 rounded-2xl border border-red-100 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700 mb-1">Extraction failed</p>
              <p className="text-sm text-red-600 mb-4">{doc.failure_reason || 'An unknown error occurred.'}</p>
              <button onClick={handleRetry} disabled={retrying}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50">
                {retrying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Already confirmed — read-only, no re-confirm (matches the backend's
          own 409 on a non-'extracted' document) */}
      {doc.status === 'confirmed' && !confirmedResult && (
        <div className="p-6 rounded-2xl border border-blue-100 bg-blue-50">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800 mb-1">Already confirmed</p>
              <p className="text-sm text-blue-700">
                This syllabus was confirmed {doc.confirmed_at ? new Date(doc.confirmed_at).toLocaleDateString() : ''} — its topics and subtopics are already live. Uploading a new document for this subject will start a fresh review.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirm success */}
      {confirmedResult && (
        <div className="p-6 rounded-2xl border border-green-100 bg-green-50">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-800 mb-1">Confirmed</p>
              <p className="text-sm text-green-700">
                Created {confirmedResult.topics?.length ?? 0} topic{(confirmedResult.topics?.length ?? 0) === 1 ? '' : 's'} and {confirmedResult.subtopics?.length ?? 0} subtopic{(confirmedResult.subtopics?.length ?? 0) === 1 ? '' : 's'}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Extracted — the actual editable review tree */}
      {doc.status === 'extracted' && nodes && !confirmedResult && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            Review the AI-extracted structure below. Edit any title, promote/demote a level, delete anything wrong, or add anything missed — then confirm to create these as real topics and subtopics.
          </p>

          <div className="rounded-2xl border border-gray-100 divide-y divide-gray-50 mb-4">
            {nodes.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-10">No nodes — add one below to get started.</p>
            )}
            {nodes.map((n, i) => {
              const error = errorsByIndex.get(i);
              return (
                <div key={n.key}
                  style={{ paddingLeft: `${(n.level - 1) * 24 + 16}px` }}
                  className={`flex items-center gap-2 py-2.5 pr-3 ${error ? 'bg-red-50/60' : ''}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-300 w-20 shrink-0">
                    {LEVEL_LABELS[n.level]}
                  </span>

                  {editingKey === n.key ? (
                    <InlineTitleEdit
                      value={n.title}
                      onSave={(v) => { updateNode(i, { title: v }); setEditingKey(null); }}
                      onCancel={() => setEditingKey(null)}
                    />
                  ) : (
                    <button onClick={() => setEditingKey(n.key)}
                      className="flex-1 text-left text-sm text-gray-800 hover:text-blue-600 truncate">
                      {n.title || <span className="text-gray-300 italic">Untitled — click to edit</span>}
                    </button>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => changeLevel(i, -1)} disabled={n.level <= 1}
                      title="Promote (outdent)"
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-20 disabled:hover:bg-transparent">
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => changeLevel(i, 1)} disabled={n.level >= 3}
                      title="Demote (indent)"
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-20 disabled:hover:bg-transparent">
                      <ChevronRight size={14} />
                    </button>
                    <button onClick={() => addSiblingAfter(i)} title="Add a node after this one"
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-500">
                      <Plus size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(i)} title="Delete"
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {error && (
                    <p className="basis-full text-xs text-red-600 mt-1 ml-0">{error}</p>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={addTopicAtEnd}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors mb-6">
            + Add a topic
          </button>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {errors.length > 0
                ? `${errors.length} issue${errors.length === 1 ? '' : 's'} to fix before confirming`
                : `${nodes.length} node${nodes.length === 1 ? '' : 's'} ready`}
            </p>
            <button onClick={handleConfirm} disabled={confirming || errors.length > 0 || nodes.length === 0}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-2">
              {confirming ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
              {confirming ? 'Confirming…' : 'Confirm & Create Topics'}
            </button>
          </div>
        </>
      )}

      {deleteTarget !== null && (
        <ConfirmModal
          message={
            subtreeEnd(nodes, deleteTarget) - deleteTarget > 1
              ? `Delete "${nodes[deleteTarget].title || 'this node'}" and its ${subtreeEnd(nodes, deleteTarget) - deleteTarget - 1} sub-item(s)?`
              : `Delete "${nodes[deleteTarget].title || 'this node'}"?`
          }
          onConfirm={() => deleteSubtree(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
