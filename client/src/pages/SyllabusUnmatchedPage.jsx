// client/src/pages/SyllabusUnmatchedPage.jsx
// Route: /admin/syllabus/:id/unmatched and /teacher/syllabus/:id/unmatched
// (same PrivateRoute allowedRoles as every other syllabus page).
//
// Syllabus-driven topic mapping — Prompt 4 Part 3 of 3. Two halves, kept on
// one screen (Prompt 4's own brief groups them as a single part, and both
// are naturally "finishing up" actions for the same subject once the main
// remap queue in SyllabusRemapPage.jsx is empty):
//
// 1. Unmatched-item queue — suggestions where no_confident_match = true
//    (the AI couldn't confidently place them). Reuses SyllabusRemapPage.jsx's
//    exported SuggestionRow component and the SAME POST .../apply endpoint
//    for writes (confirmed by reading it: it already handles override and
//    skip generically for any pending suggestion, only blocking 'accept'
//    for no_confident_match rows) — no new write endpoint needed for this
//    half, only a differently-filtered read
//    (GET .../remap-suggestions?unmatched=true, same route Part 2 already
//    built, extended with a query param rather than duplicated).
//
// 2. Old-tree deactivation — lists the subject's OLD topics/subtopics
//    (source_syllabus_id IS DISTINCT FROM this document) with a live count
//    of remaining pending suggestions against each. Only ones already at
//    zero can be checked for deactivation; the server re-validates this
//    independently before writing (GET .../old-topics,
//    POST .../old-topics/deactivate — both new this part).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import { SuggestionRow } from './SyllabusRemapPage';
import {
  Loader2, AlertTriangle, ChevronLeft, CheckCircle2, HelpCircle,
  Archive, Lock,
} from 'lucide-react';

const TABLE_LABELS = {
  resources: 'Resources', questions: 'Questions', videos: 'Videos',
  revision_notes: 'Revision Notes', concepts: 'Concepts',
};

export default function SyllabusUnmatchedPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const basePath = user?.role === 'admin' ? '/admin/syllabus' : '/teacher/syllabus';

  // ── Unmatched queue state ────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [doc, setDoc] = useState(null);
  const [newTree, setNewTree] = useState({ topics: [], subtopics: [] });
  const [suggestions, setSuggestions] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitResult, setSubmitResult] = useState(null);

  const loadUnmatched = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api.get(`/syllabus/${id}/remap-suggestions`, { params: { unmatched: 'true' } })
      .then(res => {
        setDoc(res.data.document);
        setNewTree(res.data.newTree);
        setSuggestions(res.data.suggestions);
        setDecisions({});
        setSubmitResult(null);
      })
      .catch(err => setLoadError(err?.response?.data?.error || err?.message || 'Could not load the unmatched queue.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadUnmatched(); }, [loadUnmatched]);

  const topicTitleById = useMemo(() => Object.fromEntries(newTree.topics.map(t => [t.id, t.title])), [newTree]);
  const subtopicsByTopic = useMemo(() => {
    const map = {};
    for (const s of newTree.subtopics) (map[s.topic_id] ||= []).push(s);
    return map;
  }, [newTree]);

  const destinationLabel = (topicId, subtopicId) => {
    const topicTitle = topicId != null ? topicTitleById[topicId] : null;
    const subtopicTitle = subtopicId != null ? newTree.subtopics.find(s => s.id === subtopicId)?.title : null;
    if (topicTitle && subtopicTitle) return `${topicTitle} \u203a ${subtopicTitle}`;
    return topicTitle || subtopicTitle || 'Not yet placed';
  };

  const setDecision = (suggestionId, decision) => setDecisions(prev => ({ ...prev, [suggestionId]: decision }));
  const decidedCount = Object.keys(decisions).length;

  const handleSubmit = async () => {
    const payload = Object.entries(decisions).map(([suggestionId, d]) => ({ suggestionId, ...d }));
    if (payload.length === 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await api.post(`/syllabus/${id}/remap-suggestions/apply`, { decisions: payload });
      setSubmitResult(res.data);
      loadUnmatched();
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err?.message || 'Could not apply decisions.');
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const s of suggestions) (map[s.source_table] ||= []).push(s);
    return map;
  }, [suggestions]);

  // ── Old-topics deactivation state ────────────────────────────────────
  const [oldTopics, setOldTopics] = useState(null);
  const [oldTopicsError, setOldTopicsError] = useState('');
  const [selected, setSelected] = useState({ topics: new Set(), subtopics: new Set() });
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivateResult, setDeactivateResult] = useState(null);

  const loadOldTopics = useCallback(() => {
    api.get(`/syllabus/${id}/old-topics`)
      .then(res => { setOldTopics(res.data); setOldTopicsError(''); })
      .catch(err => setOldTopicsError(err?.response?.data?.error || err?.message || 'Could not load old topics.'));
  }, [id]);

  useEffect(() => { loadOldTopics(); }, [loadOldTopics]);

  const toggleSelected = (kind, itemId) => {
    setSelected(prev => {
      const next = { topics: new Set(prev.topics), subtopics: new Set(prev.subtopics) };
      const set = kind === 'topic' ? next.topics : next.subtopics;
      set.has(itemId) ? set.delete(itemId) : set.add(itemId);
      return next;
    });
  };

  const selectedCount = selected.topics.size + selected.subtopics.size;

  const handleDeactivate = async () => {
    if (selectedCount === 0) return;
    setDeactivating(true);
    setDeactivateError('');
    try {
      const res = await api.post(`/syllabus/${id}/old-topics/deactivate`, {
        topicIds: [...selected.topics],
        subtopicIds: [...selected.subtopics],
      });
      setDeactivateResult(res.data);
      setSelected({ topics: new Set(), subtopics: new Set() });
      loadOldTopics();
    } catch (err) {
      setDeactivateError(err?.response?.data?.error || err?.message || 'Could not deactivate.');
    } finally {
      setDeactivating(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate(`${basePath}/${id}/remap`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ChevronLeft size={15} /> Back
        </button>
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button onClick={() => navigate(`${basePath}/${id}/remap`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft size={15} /> Back to main queue
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Unmatched items &amp; old topics</h1>
      <p className="text-sm text-gray-500 mb-6">{doc?.subject_name} · {doc?.exam_board_name}</p>

      {/* ── Section 1: unmatched queue ─────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-gray-700">
          Needs manual placement ({suggestions.length})
        </h2>
      </div>

      {submitResult && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-4">
          <CheckCircle2 size={15} /> {submitResult.overridden} placed, {submitResult.skipped} skipped.
        </div>
      )}

      {suggestions.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-2xl mb-8">
          Nothing here — every item the AI couldn't place has already been resolved.
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            The AI couldn't confidently suggest a destination for these — pick one yourself, or skip.
          </p>
          {Object.entries(grouped).map(([table, rows]) => (
            <div key={table} className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 mb-2">{TABLE_LABELS[table] || table} ({rows.length})</h3>
              <div className="rounded-2xl border border-gray-100 divide-y divide-gray-50">
                {rows.map(s => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    destinationLabel={destinationLabel(s.suggested_topic_id, s.suggested_subtopic_id)}
                    decision={decisions[s.id]}
                    onDecide={d => setDecision(s.id, d)}
                    newTree={newTree}
                    subtopicsByTopic={subtopicsByTopic}
                    hideAccept
                  />
                ))}
              </div>
            </div>
          ))}

          {submitError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {submitError}
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting || decidedCount === 0}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 mb-8">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? 'Applying…' : `Submit ${decidedCount || ''} decision${decidedCount === 1 ? '' : 's'}`.trim()}
          </button>
        </>
      )}

      {/* ── Section 2: old-tree deactivation ───────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 pt-4 border-t border-gray-100">
        <Archive size={16} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Old topics &amp; subtopics</h2>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Once everything referencing an old topic has been remapped (0 remaining), it can be deactivated — hidden from students and teachers, without deleting anything it's still historically linked to.
      </p>

      {oldTopicsError && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {oldTopicsError}
        </div>
      )}

      {deactivateResult && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-4">
          <CheckCircle2 size={15} /> {deactivateResult.deactivatedTopics} topic(s) and {deactivateResult.deactivatedSubtopics} subtopic(s) deactivated.
        </div>
      )}

      {oldTopics && (
        <>
          <div className="rounded-2xl border border-gray-100 divide-y divide-gray-50 mb-4">
            {[...oldTopics.topics.map(t => ({ ...t, kind: 'topic' })), ...oldTopics.subtopics.map(s => ({ ...s, kind: 'subtopic' }))]
              .length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No old topics found for this subject.</p>
            ) : (
              <>
                {oldTopics.topics.map(t => (
                  <OldItemRow key={`topic-${t.id}`} item={t} label="Topic"
                    checked={selected.topics.has(t.id)} onToggle={() => toggleSelected('topic', t.id)} />
                ))}
                {oldTopics.subtopics.map(s => (
                  <OldItemRow key={`subtopic-${s.id}`} item={s} label="Subtopic"
                    checked={selected.subtopics.has(s.id)} onToggle={() => toggleSelected('subtopic', s.id)} />
                ))}
              </>
            )}
          </div>

          {deactivateError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {deactivateError}
            </div>
          )}

          <button onClick={handleDeactivate} disabled={deactivating || selectedCount === 0}
            className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {deactivating ? <Loader2 size={16} className="animate-spin" /> : <Archive size={15} />}
            {deactivating ? 'Deactivating…' : `Deactivate ${selectedCount || ''}`.trim()}
          </button>
        </>
      )}
    </div>
  );
}

function OldItemRow({ item, label, checked, onToggle }) {
  const ready = item.pending_count === 0 && item.is_active;
  return (
    <label className={`flex items-center gap-3 px-4 py-3 ${ready ? 'cursor-pointer hover:bg-gray-50/60' : 'opacity-50'}`}>
      <input type="checkbox" disabled={!ready} checked={checked} onChange={onToggle} className="accent-gray-800" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800 truncate">{item.title}</p>
        <p className="text-xs text-gray-400">
          {label}
          {!item.is_active && <span className="ml-2 text-gray-400">· Already deactivated</span>}
          {item.is_active && item.pending_count > 0 && (
            <span className="ml-2 text-amber-600">· {item.pending_count} unresolved suggestion{item.pending_count === 1 ? '' : 's'}</span>
          )}
          {item.is_active && item.pending_count === 0 && <span className="ml-2 text-green-600">· Ready</span>}
        </p>
      </div>
      {!ready && !item.is_active && <Lock size={13} className="text-gray-300 shrink-0" />}
    </label>
  );
}
