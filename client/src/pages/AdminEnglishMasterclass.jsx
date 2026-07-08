// client/src/pages/AdminEnglishMasterclass.jsx
// Admin panel for managing English Masterclass content:
// categories, words, and AI word-list generation.

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import api from '../services/apiClient';
import {
  Plus, Trash2, Pencil, Save, X, Loader2, Sparkles,
  ChevronDown, ChevronRight, BookOpen, AlertCircle,
  CheckCircle2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { DIFFICULTY_LEVELS, DIFFICULTY_STYLES } from './em/constants';

const DIFFICULTIES = DIFFICULTY_LEVELS;
// Combined badge classes, built from the shared style tokens so this panel
// stays visually consistent with the student-facing DiffBadge/LevelSection.
const DIFF_COLORS = Object.fromEntries(
  DIFFICULTY_LEVELS.map(d => [d, `${DIFFICULTY_STYLES[d].badgeBg} ${DIFFICULTY_STYLES[d].badgeText}`])
);

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}
    >
      {type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
      {msg}
    </div>
  );
}

// ── Inline editable field ────────────────────────────────────────────────────
function Field({ id, label, value, onChange, type = 'text', placeholder, autoFocus }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea id={fieldId} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={2} autoFocus={autoFocus}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
      ) : type === 'select' ? (
        <select id={fieldId} value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
        </select>
      ) : (
        <input id={fieldId} type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      )}
    </div>
  );
}

// ── Add / Edit Word Modal ────────────────────────────────────────────────────
function WordModal({ word, categoryId, onClose, onSaved, toast }) {
  const isEdit = !!word?.id;
  const [form, setForm] = useState({
    word:             word?.word             || '',
    phonetic:         word?.phonetic         || '',
    definition:       word?.definition       || '',
    example_sentence: word?.example_sentence || '',
    difficulty:       word?.difficulty       || 'Beginner',
  });
  const [saving, setSaving]       = useState(false);
  const [explaining, setExplaining] = useState(false);

  const titleId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Focus trap + Escape-to-close + focus restoration
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;

    // Focus the first focusable element inside the dialog on open
    const focusables = () =>
      dialogRef.current
        ? Array.from(
            dialogRef.current.querySelectorAll(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          ).filter(el => !el.disabled && el.offsetParent !== null)
        : [];

    const firstFocusable = focusables()[0];
    (firstFocusable || closeButtonRef.current)?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const elements = focusables();
        if (elements.length === 0) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Return focus to whatever triggered the modal
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const aiExplain = async () => {
    if (!form.word.trim()) return;
    setExplaining(true);
    try {
      const r = await api.post('/english-masterclass/word-explain', { word: form.word.trim() });
      const d = r.data;
      setForm(f => ({
        ...f,
        phonetic:         d.phonetic         || f.phonetic,
        definition:       d.definition       || f.definition,
        example_sentence: d.example_sentence || f.example_sentence,
      }));
      toast('AI filled in the details!', 'success');
    } catch (e) {
      toast(e.message || 'AI explain failed', 'error');
    } finally {
      setExplaining(false);
    }
  };

  const handleSave = async () => {
    if (!form.word.trim()) return toast('Word is required', 'error');
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/english-masterclass/admin/words/${word.id}`, form);
      } else {
        await api.post('/english-masterclass/admin/words', { ...form, category_id: categoryId });
      }
      toast(isEdit ? 'Word updated!' : 'Word added!', 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-purple-600">
          <h3 id={titleId} className="text-white font-bold">{isEdit ? 'Edit Word' : 'Add New Word'}</h3>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Close dialog" className="text-white/70 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Field id="word-field-word" label="Word *" value={form.word} onChange={set('word')} placeholder="e.g. queue" />
            </div>
            <button onClick={aiExplain} disabled={explaining || !form.word.trim()}
              aria-label="Let AI fill in the details" title="Let AI fill in the details"
              className="self-end flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 font-semibold px-3 py-2 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors">
              {explaining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI Fill
            </button>
          </div>
          <Field id="word-field-phonetic" label="Phonetic (IPA)" value={form.phonetic} onChange={set('phonetic')} placeholder="e.g. /kjuː/" />
          <Field id="word-field-definition" label="Definition" value={form.definition} onChange={set('definition')} type="textarea" placeholder="Clear, simple English definition" />
          <Field id="word-field-example" label="Example Sentence" value={form.example_sentence} onChange={set('example_sentence')} type="textarea" placeholder="A natural example sentence" />
          <Field id="word-field-difficulty" label="Difficulty" value={form.difficulty} onChange={set('difficulty')} type="select" />
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Update' : 'Add Word'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI Generate Words panel ──────────────────────────────────────────────────
function GenerateWordsPanel({ category, onGenerated, toast }) {
  const [count,      setCount]      = useState(10);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await api.post('/english-masterclass/admin/generate-words', {
        category_id:   category.id,
        category_name: category.name,
        difficulty:    category.difficulty,
        count,
      });
      toast(`✅ Generated ${r.data.inserted} words (${r.data.skipped} already existed)`, 'success');
      onGenerated();
    } catch (e) {
      toast(e.message || 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-indigo-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-indigo-800">Generate with AI</p>
          <p className="text-xs text-indigo-600">Let Gemini create English vocabulary for this category</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select value={count} onChange={e => setCount(Number(e.target.value))}
          className="border border-indigo-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none">
          {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} words</option>)}
        </select>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

// ── Category row with expandable word list ────────────────────────────────────
function CategoryRow({ cat, allCategories, onRefresh, toast }) {
  const [expanded, setExpanded]   = useState(false);
  const [words, setWords]         = useState([]);
  const [loadingW, setLoadingW]   = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editForm, setEditForm]   = useState({ name: cat.name, description: cat.description, difficulty: cat.difficulty, icon_emoji: cat.icon_emoji });
  const [savingCat, setSavingCat] = useState(false);
  const [wordModal, setWordModal] = useState(null); // null | 'new' | {word object for edit}
  const [deleting, setDeleting]   = useState(null);
  const wordsRegionId = useId();

  const loadWords = useCallback(async () => {
    setLoadingW(true);
    try {
      const r = await api.get(`/english-masterclass/admin/words?category_id=${cat.id}`);
      setWords(r.data || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoadingW(false);
    }
  }, [cat.id]);

  const toggle = () => {
    if (!expanded) loadWords();
    setExpanded(e => !e);
  };

  const saveCat = async () => {
    const dupe = findDuplicate(allCategories, editForm.name, editForm.difficulty, cat.id);
    if (dupe) {
      return toast(`A "${editForm.difficulty}" category named "${dupe.name}" already exists.`, 'error');
    }
    setSavingCat(true);
    try {
      await api.patch(`/english-masterclass/admin/categories/${cat.id}`, editForm);
      toast('Category updated!', 'success');
      setEditing(false);
      onRefresh();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSavingCat(false);
    }
  };

  const deleteCat = async () => {
    if (!window.confirm(`Delete category "${cat.name}" and all its words? This cannot be undone.`)) return;
    try {
      await api.delete(`/english-masterclass/admin/categories/${cat.id}`);
      toast('Category deleted.', 'success');
      onRefresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const deleteWord = async (wordId) => {
    setDeleting(wordId);
    try {
      await api.delete(`/english-masterclass/admin/words/${wordId}`);
      setWords(ws => ws.filter(w => w.id !== wordId));
      toast('Word deleted.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const setE = (k) => (v) => setEditForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Category header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={toggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          aria-expanded={expanded}
          aria-controls={wordsRegionId}
        >
          <span className="text-xl shrink-0">{cat.icon_emoji || '📚'}</span>
          {!editing ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 truncate">{cat.name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${DIFF_COLORS[cat.difficulty]}`}>
                  {cat.difficulty}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate">{cat.description}</p>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
              <Field label="Name" value={editForm.name} onChange={setE('name')} />
              <Field label="Icon" value={editForm.icon_emoji} onChange={setE('icon_emoji')} />
              <Field label="Description" value={editForm.description} onChange={setE('description')} type="textarea" />
              <Field label="Difficulty" value={editForm.difficulty} onChange={setE('difficulty')} type="select" />
            </div>
          )}
          {!editing && (
            <span className="text-xs text-gray-400 shrink-0">{cat.word_count} words</span>
          )}
          {!editing && (expanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />)}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button onClick={saveCat} disabled={savingCat}
                className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {savingCat ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors" title="Edit">
                <Pencil size={14} />
              </button>
              <button onClick={deleteCat} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded words section */}
      {expanded && (
        <div id={wordsRegionId} className="border-t border-gray-100 px-5 py-4 bg-gray-50">
          <GenerateWordsPanel category={cat} onGenerated={loadWords} toast={toast} />

          <div className="flex items-center justify-between mt-4 mb-3">
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Words ({words.length})</h4>
            <button onClick={() => setWordModal('new')}
              className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
              <Plus size={11} /> Add Word
            </button>
          </div>

          {loadingW ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-indigo-400 mr-2" />
              <span className="text-sm text-gray-400">Loading words…</span>
            </div>
          ) : words.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              No words yet. Add manually or generate with AI above.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {words.map(w => (
                <div key={w.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{w.word}</span>
                      {w.phonetic && <span className="text-xs text-gray-400 italic">{w.phonetic}</span>}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DIFF_COLORS[w.difficulty]}`}>
                        {w.difficulty}
                      </span>
                    </div>
                    {w.definition && <p className="text-xs text-gray-600 mt-0.5 truncate">{w.definition}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setWordModal(w)} title="Edit word"
                      className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteWord(w.id)} disabled={deleting === w.id}
                      title="Delete word"
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40">
                      {deleting === w.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Word modal */}
      {wordModal && (
        <WordModal
          word={wordModal === 'new' ? null : wordModal}
          categoryId={cat.id}
          onClose={() => setWordModal(null)}
          onSaved={loadWords}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Duplicate-category helpers ───────────────────────────────────────────────
// Client-side guard so an admin gets an immediate, friendly warning instead
// of a round-trip to the server's 409 (see englishMasterclassRoutes.js).
// Case/whitespace-insensitive on name, matched within the same difficulty.
function findDuplicate(categories, name, difficulty, excludeId) {
  const target = name.trim().toLowerCase();
  return categories.find(c =>
    c.id !== excludeId &&
    c.difficulty === difficulty &&
    c.name.trim().toLowerCase() === target
  );
}

// Groups categories by (name, difficulty) and returns only the groups with
// more than one row — i.e. leftover duplicates from the em_categories bug
// that haven't been cleaned up yet (see server/scripts/dedupe_em_categories.js).
function findDuplicateGroups(categories) {
  const groups = new Map();
  for (const c of categories) {
    const key = `${c.name.trim().toLowerCase()}__${c.difficulty}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.values()].filter(g => g.length > 1);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminEnglishMasterclass() {
  const [categories,   setCategories]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showAddCat,   setShowAddCat]   = useState(false);
  const [newCat,       setNewCat]       = useState({ name: '', description: '', difficulty: 'Beginner', icon_emoji: '📚' });
  const [savingCat,    setSavingCat]    = useState(false);
  const [toast,        setToast]        = useState({ msg: '', type: 'success' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  };

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/english-masterclass/admin/categories');
      setCategories(r.data || []);
    } catch (e) {
      showToast(e.message || 'Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const duplicateGroups = findDuplicateGroups(categories);

  const addCategory = async () => {
    if (!newCat.name.trim()) return showToast('Category name is required', 'error');
    const dupe = findDuplicate(categories, newCat.name, newCat.difficulty);
    if (dupe) {
      return showToast(`A "${newCat.difficulty}" category named "${dupe.name}" already exists.`, 'error');
    }
    setSavingCat(true);
    try {
      await api.post('/english-masterclass/admin/categories', newCat);
      showToast('Category created!', 'success');
      setNewCat({ name: '', description: '', difficulty: 'Beginner', icon_emoji: '📚' });
      setShowAddCat(false);
      loadCategories();
    } catch (e) {
      showToast(e.message || 'Failed to create', 'error');
    } finally {
      setSavingCat(false);
    }
  };

  const setNC = (k) => (v) => setNewCat(f => ({ ...f, [k]: v }));

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <Toast msg={toast.msg} type={toast.type} />

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <span className="text-lg">🎓</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">English Masterclass</h1>
            <p className="text-xs text-gray-500">Manage vocabulary categories and words</p>
          </div>
        </div>
        <button onClick={() => setShowAddCat(s => !s)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
          <Plus size={15} /> Add Category
        </button>
      </div>

      {/* Add Category form */}
      {showAddCat && (
        <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-5 mb-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">New Category</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Name *" value={newCat.name} onChange={setNC('name')} placeholder="e.g. English Idioms" />
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Icon Emoji" value={newCat.icon_emoji} onChange={setNC('icon_emoji')} placeholder="📚" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Description" value={newCat.description} onChange={setNC('description')} type="textarea" placeholder="What will students learn?" />
            <Field label="Difficulty" value={newCat.difficulty} onChange={setNC('difficulty')} type="select" />
          </div>
          <div className="flex gap-3">
            <button onClick={addCategory} disabled={savingCat}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors">
              {savingCat ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Category
            </button>
            <button onClick={() => setShowAddCat(false)}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {!loading && (
        <div className="flex items-center gap-4 mb-5 text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{categories.length} categories</span>
          <span>·</span>
          <span>{categories.reduce((s, c) => s + (c.word_count || 0), 0)} total words</span>
          <button onClick={loadCategories} className="ml-auto flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      )}

      {/* Duplicate-category warning — leftover from the em_categories bug;
          run server/scripts/dedupe_em_categories.js to clean these up. */}
      {!loading && duplicateGroups.length > 0 && (
        <div className="flex items-start gap-2 mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              {duplicateGroups.length} duplicate categor{duplicateGroups.length === 1 ? 'y' : 'ies'} detected
              ({duplicateGroups.reduce((s, g) => s + g.length, 0)} rows total).
            </p>
            <p className="text-amber-700 mt-0.5">
              These are leftover from a fixed data bug. Run{' '}
              <code className="bg-amber-100 px-1 rounded">node server/scripts/dedupe_em_categories.js --apply</code>{' '}
              on the server to merge them (student progress is preserved).
            </p>
          </div>
        </div>
      )}

      {/* Category list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-indigo-400 mr-2" />
          <span className="text-gray-400 text-sm">Loading…</span>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No categories yet.</p>
          <p className="text-sm mt-1">Click "Add Category" to create the first one, or run the migration to seed default data.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map(cat => (
            <CategoryRow key={cat.id} cat={cat} allCategories={categories} onRefresh={loadCategories} toast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}
