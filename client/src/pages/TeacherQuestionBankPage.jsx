import { useEffect, useState } from 'react';
import {
  ChevronDown, ChevronRight, Folder, BookOpen, Search, Loader2,
  MoveRight, CheckCircle2, Clock, XCircle, AlertTriangle,
} from 'lucide-react';
import api from '../services/apiClient';

const PAGE_SIZE = 50;

const STATUS = {
  approved: { label: 'Approved', icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  active:   { label: 'Approved', icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  pending:  { label: 'Pending review', icon: Clock, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  rejected: { label: 'Rejected', icon: XCircle, cls: 'text-red-700 bg-red-50 border-red-200' },
};

function statusMeta(status) {
  return STATUS[String(status || 'pending').toLowerCase()] || STATUS.pending;
}

export default function TeacherQuestionBankPage() {
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState({});
  const [subtopics, setSubtopics] = useState({});
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [expandedTopics, setExpandedTopics] = useState({});
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);
  const [unclassified, setUnclassified] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState('');

  const [assigning, setAssigning] = useState(null);
  const [assignSubject, setAssignSubject] = useState('');
  const [assignTopic, setAssignTopic] = useState('');
  const [assignSubtopic, setAssignSubtopic] = useState('');
  const [assignTopics, setAssignTopics] = useState([]);
  const [assignSubtopics, setAssignSubtopics] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setSubjects(r.data || []))
      .catch(() => setError('Could not load your assigned subjects.'))
      .finally(() => setLoading(false));
  }, []);

  const loadTopics = async (subjectId) => {
    if (topics[subjectId]) return topics[subjectId];
    const r = await api.get('/teacher/topics', { params: { subject_id: subjectId } });
    const rows = r.data || [];
    setTopics(prev => ({ ...prev, [subjectId]: rows }));
    return rows;
  };

  const loadSubtopics = async (topicId) => {
    if (subtopics[topicId]) return subtopics[topicId];
    const r = await api.get('/teacher/subtopics', { params: { topic_id: topicId } });
    const rows = r.data || [];
    setSubtopics(prev => ({ ...prev, [topicId]: rows }));
    return rows;
  };

  const toggleSubject = async (subjectId) => {
    const open = !expandedSubjects[subjectId];
    setExpandedSubjects(prev => ({ ...prev, [subjectId]: open }));
    if (open) {
      try { await loadTopics(subjectId); } catch { setError('Could not load topics.'); }
    }
  };

  const toggleTopic = async (topicId) => {
    const open = !expandedTopics[topicId];
    setExpandedTopics(prev => ({ ...prev, [topicId]: open }));
    if (open) {
      try { await loadSubtopics(topicId); } catch { setError('Could not load subtopics.'); }
    }
  };

  const loadQuestions = async (mode, id, nextOffset = 0) => {
    setQuestionsLoading(true);
    setError('');
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: nextOffset,
        search: search.trim() || undefined,
      };
      if (mode === 'unclassified') params.unclassified = 'true';
      else params.subtopic_id = id;

      const r = await api.get('/teacher/question-bank/questions', { params });
      setQuestions(r.data || []);
      setTotal(r.total || 0);
      setOffset(nextOffset);
    } catch (err) {
      setError(err?.message || 'Could not load questions.');
    } finally {
      setQuestionsLoading(false);
    }
  };

  useEffect(() => {
    if (unclassified) loadQuestions('unclassified', null, 0);
    else if (selectedSubtopic) loadQuestions('subtopic', selectedSubtopic.id, 0);
  }, [unclassified, selectedSubtopic?.id]);

  const selectSubtopic = (st, subject, topic) => {
    setUnclassified(false);
    setSelectedSubtopic({ ...st, subjectName: subject.name, topicName: topic.name });
    setOffset(0);
  };

  const selectUnclassified = () => {
    setSelectedSubtopic(null);
    setUnclassified(true);
    setOffset(0);
  };

  const beginAssign = (question) => {
    setAssigning(question);
    setAssignSubject('');
    setAssignTopic('');
    setAssignSubtopic('');
    setAssignTopics([]);
    setAssignSubtopics([]);
  };

  const chooseAssignSubject = async (value) => {
    setAssignSubject(value);
    setAssignTopic('');
    setAssignSubtopic('');
    setAssignSubtopics([]);
    if (!value) return setAssignTopics([]);
    try { setAssignTopics(await loadTopics(value)); }
    catch { setError('Could not load topics for that subject.'); }
  };

  const chooseAssignTopic = async (value) => {
    setAssignTopic(value);
    setAssignSubtopic('');
    if (!value) return setAssignSubtopics([]);
    try { setAssignSubtopics(await loadSubtopics(value)); }
    catch { setError('Could not load subtopics for that topic.'); }
  };

  const saveClassification = async () => {
    if (!assigning || !assignSubtopic) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/teacher/question-bank/questions/${assigning.id}/classify`, {
        subtopic_id: assignSubtopic,
      });
      setAssigning(null);
      loadQuestions(unclassified ? 'unclassified' : 'subtopic', selectedSubtopic?.id, offset);
    } catch (err) {
      setError(err?.message || 'Could not classify question.');
    } finally {
      setSaving(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
        <p className="text-sm text-gray-500 mt-1">
          Organise questions by <strong>Subject → Topic → Subtopic</strong>. AI-generated questions remain unavailable to students until they are classified and reviewed.
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        <aside className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Question Bank Structure</p>
          </div>

          <button
            onClick={selectUnclassified}
            className={`w-full flex items-center gap-2 px-4 py-3 text-left border-b border-gray-100 ${unclassified ? 'bg-amber-50 text-amber-800' : 'hover:bg-gray-50 text-gray-700'}`}
          >
            <AlertTriangle size={15} className="shrink-0" />
            <span className="text-sm font-semibold">AI Questions — Needs Classification</span>
          </button>

          <div className="p-2">
            {subjects.map(subject => (
              <div key={subject.id}>
                <button
                  onClick={() => toggleSubject(subject.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left"
                >
                  {expandedSubjects[subject.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <BookOpen size={15} className="text-blue-500 shrink-0" />
                  <span className="text-sm font-semibold text-gray-800 truncate">{subject.name}</span>
                </button>

                {expandedSubjects[subject.id] && (
                  <div className="ml-5 border-l border-gray-100 pl-2">
                    {(topics[subject.id] || []).map(topic => (
                      <div key={topic.id}>
                        <button
                          onClick={() => toggleTopic(topic.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-left"
                        >
                          {expandedTopics[topic.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <Folder size={14} className="text-amber-500 shrink-0" />
                          <span className="text-sm text-gray-700 truncate">{topic.name}</span>
                        </button>

                        {expandedTopics[topic.id] && (
                          <div className="ml-5 border-l border-gray-100 pl-2">
                            {(subtopics[topic.id] || []).map(st => (
                              <button
                                key={st.id}
                                onClick={() => selectSubtopic(st, subject, topic)}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left ${selectedSubtopic?.id === st.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}
                              >
                                <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                                <span className="text-sm truncate">{st.name}</span>
                              </button>
                            ))}
                            {subtopics[topic.id] && subtopics[topic.id].length === 0 && (
                              <p className="px-3 py-2 text-xs text-gray-400">No active subtopics.</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {topics[subject.id] && topics[subject.id].length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-400">No active topics.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {subjects.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">No subjects are assigned to you.</p>}
          </div>
        </aside>

        <section className="bg-white border border-gray-100 rounded-2xl shadow-sm min-h-[520px]">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {unclassified ? 'AI Questions — Needs Classification' : selectedSubtopic ? selectedSubtopic.name : 'Select a subtopic'}
                </h2>
                {selectedSubtopic && <p className="text-xs text-gray-400 mt-0.5">{selectedSubtopic.subjectName} → {selectedSubtopic.topicName}</p>}
              </div>
              {(unclassified || selectedSubtopic) && (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') loadQuestions(unclassified ? 'unclassified' : 'subtopic', selectedSubtopic?.id, 0); }}
                    placeholder="Search questions…"
                    className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-64"
                  />
                </div>
              )}
            </div>
          </div>

          {!unclassified && !selectedSubtopic ? (
            <div className="flex items-center justify-center h-80 text-sm text-gray-400">
              Click a Subject, Topic and then a Subtopic to open its questions.
            </div>
          ) : questionsLoading ? (
            <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : questions.length === 0 ? (
            <div className="flex items-center justify-center h-80 text-sm text-gray-400 px-6 text-center">
              {unclassified ? 'No unclassified AI questions remain.' : 'No AI-generated questions are currently in this subtopic.'}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {questions.map(q => {
                  const meta = statusMeta(q.status);
                  const Icon = meta.icon;
                  return (
                    <div key={q.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 leading-relaxed">{q.question_text}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="text-[11px] text-gray-400">{q.type || q.question_type || 'question'}</span>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                              <Icon size={11} /> {meta.label}
                            </span>
                            {q.subject_name && <span className="text-[11px] text-gray-400">{q.subject_name}</span>}
                            {q.topic_name && <span className="text-[11px] text-gray-400">→ {q.topic_name}</span>}
                          </div>
                        </div>
                        {unclassified && (
                          <button
                            onClick={() => beginAssign(q)}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                          >
                            <MoveRight size={13} /> Assign subtopic
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {pageCount > 1 && (
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>Page {currentPage} of {pageCount} · {total} questions</span>
                  <div className="flex gap-2">
                    <button disabled={offset === 0} onClick={() => loadQuestions(unclassified ? 'unclassified' : 'subtopic', selectedSubtopic?.id, Math.max(0, offset - PAGE_SIZE))} className="px-3 py-1.5 border rounded-lg disabled:opacity-30">Previous</button>
                    <button disabled={offset + PAGE_SIZE >= total} onClick={() => loadQuestions(unclassified ? 'unclassified' : 'subtopic', selectedSubtopic?.id, offset + PAGE_SIZE)} className="px-3 py-1.5 border rounded-lg disabled:opacity-30">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {assigning && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-bold text-gray-900">Assign question to a subtopic</h3>
            <p className="text-sm text-gray-500 mt-1 mb-5">{assigning.question_text}</p>

            <div className="space-y-3">
              <select value={assignSubject} onChange={e => chooseAssignSubject(e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm">
                <option value="">Subject…</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={assignTopic} onChange={e => chooseAssignTopic(e.target.value)} disabled={!assignSubject} className="w-full border rounded-lg px-3 py-2.5 text-sm disabled:bg-gray-50">
                <option value="">Topic…</option>
                {assignTopics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={assignSubtopic} onChange={e => setAssignSubtopic(e.target.value)} disabled={!assignTopic} className="w-full border rounded-lg px-3 py-2.5 text-sm disabled:bg-gray-50">
                <option value="">Subtopic…</option>
                {assignSubtopics.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button onClick={() => setAssigning(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button disabled={!assignSubtopic || saving} onClick={saveClassification} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40">
                {saving ? 'Saving…' : 'Assign & send to review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
