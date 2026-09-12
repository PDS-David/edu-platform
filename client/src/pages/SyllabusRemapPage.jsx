// client/src/pages/SyllabusRemapPage.jsx
//
// Syllabus-driven topic mapping — Prompt 4 Part 2 of 3 (review UI + the
// actual remap writes). Part 1 (server/scripts/generateSyllabusRemapSuggestions.js)
// generated AI suggestions into syllabus_remap_suggestions for every
// confirmed subject's old-tree content — this screen is where a human
// reviews those suggestions for ONE subject/document at a time and the
// real subtopic_id/topic_id UPDATEs actually happen, gated behind that
// review. Reached from SyllabusListPage.jsx's "Remap Content" action on a
// confirmed document row, not a separate nav entry — matches this
// session's own preference for extending existing UI over adding new
// navigation surfaces.
//
// SCOPE: only suggestions with no_confident_match = false are shown here
// (confirmed via syllabusRoutes.js's GET :id/remap-suggestions query) —
// items the AI couldn't confidently place belong to Prompt 4 Part 3's
// separate unmatched-item queue, not this screen, per this feature's own
// design decision to keep those two review flows distinct (an AI
// limitation vs. a human's deliberate accept/override/skip).
//
// GROUPED BY source_table (resources / questions / videos / revision_notes
// / concepts) since these are genuinely different kinds of content a
// reviewer thinks about differently, not a single flat list.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import {
  Loader2, AlertTriangle, ChevronLeft, CheckCircle2, XCircle,
  PenLine, SkipForward, Sparkles,
} from 'lucide-react';

const TABLE_LABELS = {
  resources: 'Resources', questions: 'Questions', videos: 'Videos',
  revision_notes: 'Revision Notes', concepts: 'Concepts',
};

// Matches generateSyllabusRemapSuggestions.js's own HIGH_CONFIDENCE_THRESHOLD
// — same number, kept as an independent constant here since this is a UI
// default a reviewer can adjust, not the script's own fixed summary cutoff.
const DEFAULT_BULK_THRESHOLD = 0.85;

export default function SyllabusRemapPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const basePath = user?.role === 'admin' ? '/admin/syllabus' : '/teacher/syllabus';

  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState('');
  const [doc,      setDoc]      = useState(null);
  const [newTree,  setNewTree]  = useState({ topics: [], subtopics: [] });
  const [suggestions, setSuggestions] = useState([]);

  // Per-suggestion local decision before submit: { [id]: { action, topicId, subtopicId } }
  const [decisions, setDecisions] = useState({});
  const [bulkThreshold, setBulkThreshold] = useState(DEFAULT_BULK_THRESHOLD);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitResult, setSubmitResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api.get(`/syllabus/${id}/remap-suggestions`)
      .then(res => {
        setDoc(res.data.document);
        setNewTree(res.data.newTree);
        setSuggestions(res.data.suggestions);
        setDecisions({});
        setSubmitResult(null);
      })
      .catch(err => setLoadError(err?.response?.data?.error || err?.message || 'Could not load remap suggestions.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
    return topicTitle || subtopicTitle || '(unknown)';
  };

  const setDecision = (suggestionId, decision) => {
    setDecisions(prev => ({ ...prev, [suggestionId]: decision }));
  };

  const handleBulkAccept = () => {
    const next = { ...decisions };
    for (const s of suggestions) {
      if (s.confidence != null && s.confidence >= bulkThreshold) {
        next[s.id] = { action: 'accept' };
      }
    }
    setDecisions(next);
  };

  const decidedCount = Object.keys(decisions).length;

  const handleSubmit = async () => {
    const payload = Object.entries(decisions).map(([suggestionId, d]) => ({ suggestionId, ...d }));
    if (payload.length === 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await api.post(`/syllabus/${id}/remap-suggestions/apply`, { decisions: payload });
      setSubmitResult(res.data);
      load(); // refetch — accepted/overridden/skipped items drop out (status != 'pending' now)
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

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate(`${basePath}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
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
      <button onClick={() => navigate(`${basePath}/${id}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft size={15} /> Back to document
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Remap existing content</h1>
      <p className="text-sm text-gray-500 mb-6">
        {doc?.subject_name} · {doc?.exam_board_name} — {suggestions.length} item{suggestions.length === 1 ? '' : 's'} awaiting review.
        {' '}Items the AI couldn't confidently place aren't shown here —{' '}
        <Link to={`${basePath}/${id}/unmatched`} className="text-blue-600 hover:text-blue-700 font-medium">
          review those in the unmatched queue
        </Link>.
      </p>

      {submitResult && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-6">
          <CheckCircle2 size={15} /> {submitResult.accepted} accepted, {submitResult.overridden} overridden, {submitResult.skipped} skipped.
        </div>
      )}

      {suggestions.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-2xl">
          Nothing pending — every suggestion for this document has been reviewed.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 mb-6">
            <Sparkles size={15} className="text-blue-500 shrink-0" />
            <span className="text-sm text-gray-600">Bulk-accept everything at or above</span>
            <input
              type="number" min="0" max="1" step="0.05"
              value={bulkThreshold}
              onChange={e => setBulkThreshold(Math.min(1, Math.max(0, Number(e.target.value))))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center"
            />
            <span className="text-sm text-gray-600">confidence</span>
            <button onClick={handleBulkAccept}
              className="ml-auto text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100">
              Apply
            </button>
          </div>

          {Object.entries(grouped).map(([table, rows]) => (
            <div key={table} className="mb-8">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">{TABLE_LABELS[table] || table} ({rows.length})</h2>
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
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? 'Applying…' : `Submit ${decidedCount || ''} decision${decidedCount === 1 ? '' : 's'}`.trim()}
          </button>
        </>
      )}
    </div>
  );
}

// Exported — reused as-is by SyllabusUnmatchedPage.jsx's queue (Prompt 4
// Part 3) rather than duplicating this ~75-line component. hideAccept lets
// that caller hide the one action guaranteed to 400 there (the backend's
// own apply endpoint blocks 'accept' for no_confident_match rows).
export function SuggestionRow({ suggestion, destinationLabel, decision, onDecide, newTree, subtopicsByTopic, hideAccept = false }) {
  const [overriding, setOverriding] = useState(false);
  const [overrideTopicId, setOverrideTopicId] = useState(suggestion.suggested_topic_id || '');
  const [overrideSubtopicId, setOverrideSubtopicId] = useState(suggestion.suggested_subtopic_id || '');

  const confidencePct = suggestion.confidence != null ? Math.round(suggestion.confidence * 100) : null;

  const saveOverride = () => {
    onDecide({
      action: 'override',
      topicId: overrideTopicId ? Number(overrideTopicId) : null,
      subtopicId: overrideSubtopicId ? Number(overrideSubtopicId) : null,
    });
    setOverriding(false);
  };

  const decisionLabel = decision
    ? decision.action === 'accept' ? 'Accepted'
    : decision.action === 'override' ? 'Overridden'
    : 'Skipped'
    : null;

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 truncate">{suggestion.source_text}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            &rarr; {destinationLabel}
            {confidencePct != null && <span className="ml-2 text-gray-300">· {confidencePct}% confidence</span>}
          </p>
          {suggestion.ai_rationale && (
            <p className="text-xs text-gray-400 mt-0.5 italic truncate">"{suggestion.ai_rationale}"</p>
          )}
        </div>

        {decisionLabel ? (
          <span className="shrink-0 text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">{decisionLabel}</span>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {!hideAccept && (
              <button onClick={() => onDecide({ action: 'accept' })} title="Accept"
                className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50"><CheckCircle2 size={16} /></button>
            )}
            <button onClick={() => setOverriding(v => !v)} title="Override"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"><PenLine size={16} /></button>
            <button onClick={() => onDecide({ action: 'skip' })} title="Skip"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><SkipForward size={16} /></button>
          </div>
        )}
      </div>

      {overriding && !decision && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <select value={overrideTopicId} onChange={e => { setOverrideTopicId(e.target.value); setOverrideSubtopicId(''); }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
            <option value="">Topic…</option>
            {newTree.topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <select value={overrideSubtopicId} onChange={e => setOverrideSubtopicId(e.target.value)}
            disabled={!overrideTopicId}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs disabled:opacity-40">
            <option value="">Subtopic (optional)…</option>
            {(subtopicsByTopic[overrideTopicId] || []).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button onClick={saveOverride} disabled={!overrideTopicId && !overrideSubtopicId}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-40">
            Save
          </button>
          <button onClick={() => setOverriding(false)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <XCircle size={12} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}
