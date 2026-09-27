import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, BookOpen, Folder, Search, Loader2,
  MoveRight, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import api from '../services/apiClient';

const PAGE_SIZE = 50;

export default function AdminQuestionBankPage() {
  const [structure, setStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);
  const [unclassified, setUnclassified] = useState(false);
  const [expandedExamTypes, setExpandedExamTypes] = useState({});
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [expandedTopics, setExpandedTopics] = useState({});
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [assigning, setAssigning] = useState(null);
  const [assignSubject, setAssignSubject] = useState('');
  const [assignTopic, setAssignTopic] = useState('');
  const [assignSubtopic, setAssignSubtopic] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/admin/question-bank/structure')
      .then(r => setStructure(r.data || []))
      .catch(err => setError(err?.message || 'Could not load the main Question Bank.'))
      .finally(() => setLoading(false));
  }, []);

  const tree = useMemo(() => {
    const examMap = new Map();
    for (const row of structure) {
      const ek = String(row.exam_type_id ?? 'none');
      if (!examMap.has(ek)) {
        examMap.set(ek, {
          id: row.exam_type_id,
          name: row.exam_type_name || 'Unassigned Exam Type',
          subjects: new Map(),
        });
      }
      const exam = examMap.get(ek);
      if (!row.subject_id) continue;
      if (!exam.subjects.has(String(row.subject_id))) {
        exam.subjects.set(String(row.subject_id), {
          id: row.subject_id, name: row.subject_name, topics: new Map(),
        });
      }
      const subject = exam.subjects.get(String(row.subject_id));
      if (!row.topic_id) continue;
      if (!subject.topics.has(String(row.topic_id))) {
        subject.topics.set(String(row.topic_id), {
          id: row.topic_id, name: row.topic_name, subtopics: [],
        });
      }
      const topic = subject.topics.get(String(row.topic_id));
      if (row.subtopic_id && !topic.subtopics.some(st => String(st.id) === String(row.subtopic_id))) {
        topic.subtopics.push({ id: row.subtopic_id, name: row.subtopic_name });
      }
    }
    return [...examMap.values()].map(exam => ({
      ...exam,
      subjects: [...exam.subjects.values()].map(subject => ({
        ...subject,
        topics: [...subject.topics.values()],
      })),
    }));
  }, [structure]);

  const loadQuestions = async (mode, subtopicId, nextOffset = 0) => {
    setQuestionsLoading(true);
    setError('');
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: nextOffset,
        search: search.trim() || undefined,
      };
      if (mode === 'unclassified') params.unclassified = 'true';
      else params.subtopic_id = subtopicId;
      const r = await api.get('/admin/question-bank/questions', { params });
      setQuestions(r.data || []);
      setTotal(r.total || 0);
      setOffset(nextOffset);
    } catch (err) {
      setError(err?.message || 'Could not load Question Bank questions.');
    } finally {
      setQuestionsLoading(false);
    }
  };

  useEffect(() => {
    if (unclassified) loadQuestions('unclassified', null, 0);
    else if (selectedSubtopic) loadQuestions('subtopic', selectedSubtopic.id, 0);
  }, [unclassified, selectedSubtopic?.id]);

  const toggle = (setter, id, loader) => {
    setter(prev => ({ ...prev, [id]: !prev[id] }));
    if (loader) loader();
  };

  const beginAssign = (question) => {
    setAssigning(question);
    setAssignSubject('');
    setAssignTopic('');
    setAssignSubtopic('');
  };

  const assignExam = useMemo(() => tree, [tree]);

  const subjectOptions = assignExam.flatMap(exam => exam.subjects);
  const chosenSubject = subjectOptions.find(s => String(s.id) === String(assignSubject));
  const topicOptions = chosenSubject?.topics || [];
  const chosenTopic = topicOptions.find(t => String(t.id) === String(assignTopic));
  const subtopicOptions = chosenTopic?.subtopics || [];

  const saveClassification = async () => {
    if (!assigning || !assignSubtopic) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/question-bank/questions/${assigning.id}/classify`, {
        subtopic_id: assignSubtopic,
      });
      setAssigning(null);
      loadQuestions('unclassified', null, offset);
    } catch (err) {
      setError(err?.message || 'Could not classify the question.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Main Question Bank</h1>
        <p className="text-sm text-gray-500 mt-1">
          App Admin view — all Exam Types → Subjects → Topics → Subtopics. This is not school-scoped.
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        <aside className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Question Bank Structure</p>
          </div>

          <button
            onClick={() => { setSelectedSubtopic(null); setUnclassified(true); setOffset(0); }}
            className={`w-full flex items-center gap-2 px-4 py-3 text-left border-b border-gray-100 ${unclassified ? 'bg-amber-50 text-amber-800' : 'hover:bg-gray-50 text-gray-700'}`}
          >
            <AlertTriangle size={15} className="shrink-0" />
            <span className="text-sm font-semibold">AI Questions — Needs Classification</span>
          </button>

          <div className="p-2">
            {tree.map(exam => (
              <div key={String(exam.id ?? 'none')}>
                <button
                  onClick={() => toggle(setExpandedExamTypes, String(exam.id ?? 'none'))}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left"
                >
                  {expandedExamTypes[String(exam.id ?? 'none')] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <BookOpen size={15} className="text-violet-500 shrink-0" />
                  <span className="text-sm font-semibold text-gray-800 truncate">{exam.name}</span>
                </button>

                {expandedExamTypes[String(exam.id ?? 'none')] && (
                  <div className="ml-5 border-l border-gray-100 pl-2">
                    {exam.subjects.map(subject => (
                      <div key={subject.id}>
                        <button
                          onClick={() => toggle(setExpandedSubjects, String(subject.id))}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-left"
                        >
                          {expandedSubjects[String(subject.id)] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <BookOpen size={14} className="text-blue-500 shrink-0" />
                          <span className="text-sm text-gray-700 truncate">{subject.name}</span>
                        </button>

                        {expandedSubjects[String(subject.id)] && (
                          <div className="ml-5 border-l border-gray-100 pl-2">
                            {subject.topics.map(topic => (
                              <div key={topic.id}>
                                <button
                                  onClick={() => toggle(setExpandedTopics, String(topic.id))}
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-left"
                                >
                                  {expandedTopics[String(topic.id)] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  <Folder size={13} className="text-amber-500 shrink-0" />
                                  <span className="text-sm text-gray-700 truncate">{topic.name}</span>
                                </button>

                                {expandedTopics[String(topic.id)] && (
                                  <div className="ml-5 border-l border-gray-100 pl-2">
                                    {topic.subtopics.map(st => (
                                      <button
                                        key={st.id}
                                        onClick={() => { setUnclassified(false); setSelectedSubtopic(st); setOffset(0); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left ${selectedSubtopic?.id === st.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}
                                      >
                                        <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                                        <span className="text-sm truncate">{st.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="bg-white border border-gray-100 rounded-2xl shadow-sm min-h-[520px]">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {unclassified ? 'AI Questions — Needs Classification' : selectedSubtopic ? selectedSubtopic.name : 'Select a subtopic'}
                </h2>
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
            <div className="flex items-center justify-center h-80 text-sm text-gray-400">Click through the tree to open a subtopic.</div>
          ) : questionsLoading ? (
            <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : questions.length === 0 ? (
            <div className="flex items-center justify-center h-80 text-sm text-gray-400 px-6 text-center">
              {unclassified ? 'No unclassified AI questions remain.' : 'No questions are currently in this subtopic.'}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {questions.map(q => (
                  <div key={q.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-relaxed">{q.question_text}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-[11px] text-gray-400">{q.type || 'question'}</span>
                          <span className="text-[11px] text-gray-500">{q.exam_type_name || 'No exam type'} → {q.subject_name || 'No subject'}</span>
                          {q.topic_name && <span className="text-[11px] text-gray-400">→ {q.topic_name}</span>}
                          {q.subtopic_name && <span className="text-[11px] text-gray-400">→ {q.subtopic_name}</span>}
                          {q.status === 'approved' || q.status === 'active'
                            ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={11} /> Approved</span>
                            : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"><Clock size={11} /> Pending review</span>}
                        </div>
                      </div>
                      {unclassified && q.is_ai_generated && (
                        <button
                          onClick={() => beginAssign(q)}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700"
                        >
                          <MoveRight size={13} /> Assign subtopic
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {Math.ceil(total / PAGE_SIZE) > 1 && (
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)} · {total} questions</span>
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
              <select value={assignSubject} onChange={e => { setAssignSubject(e.target.value); setAssignTopic(''); setAssignSubtopic(''); }} className="w-full border rounded-lg px-3 py-2.5 text-sm">
                <option value="">Subject…</option>
                {subjectOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={assignTopic} onChange={e => { setAssignTopic(e.target.value); setAssignSubtopic(''); }} disabled={!assignSubject} className="w-full border rounded-lg px-3 py-2.5 text-sm disabled:bg-gray-50">
                <option value="">Topic…</option>
                {topicOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={assignSubtopic} onChange={e => setAssignSubtopic(e.target.value)} disabled={!assignTopic} className="w-full border rounded-lg px-3 py-2.5 text-sm disabled:bg-gray-50">
                <option value="">Subtopic…</option>
                {subtopicOptions.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button onClick={() => setAssigning(null)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
              <button disabled={!assignSubtopic || saving} onClick={saveClassification} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold disabled:opacity-40">
                {saving ? 'Saving…' : 'Assign & send to review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
