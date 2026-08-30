// client/src/pages/AdminLanguageMasterclass.jsx
// Admin panel for managing Language Masterclass content for any language
// other than English (currently French and German — the two the backend
// has ENABLED_LANGUAGES-gated so far; see languageMasterclassRoutes.js).
// Same UI patterns as AdminEnglishMasterclass.jsx, generalized by
// :language and pointed at /language-masterclass/:language/admin/* —
// those admin routes were built to mirror englishMasterclassRoutes.js's
// admin block exactly for this reason (see that file's header comment
// above the ADMIN ROUTES section).
//
// One real schema difference from English: lang_words has no per-word
// difficulty column — difficulty lives on lang_categories only (a whole
// category is Beginner/Intermediate/Advanced, not individual words within
// it). So the word form here has no Difficulty field, unlike
// AdminEnglishMasterclass's WordModal.

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Plus, Trash2, Pencil, Save, X, Loader2, Sparkles,
  ChevronDown, ChevronRight, BookOpen, AlertCircle,
  CheckCircle2, RefreshCw, ArrowLeft,
} from 'lucide-react';
import { LANGUAGE_META, DIFF_STYLE } from './lang/constants';

// Only languages the backend actually serves admin content for — matches
// ENABLED_LANGUAGES in languageMasterclassRoutes.js minus english (which
// has its own dedicated AdminEnglishMasterclass.jsx already).
const ADMIN_LANGUAGES = ['french', 'german'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

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
function WordModal({ language, word, categoryId, onClose, onSaved, toast }) {
  const isEdit = !!word?.id;
  const meta = LANGUAGE_META[language];
  const [form, setForm] = useState({
    word:             word?.word             || '',
    phonetic:         word?.phonetic         || '',
    definition:       word?.definition       || '',
    example_sentence: word?.example_sentence || '',
  });
  const [saving, setSaving]         = useState(false);
  const [explaining, setExplaining] = useState(false);

  const titleId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Focus trap + Escape-to-close + focus restoration — same pattern as
  // AdminEnglishMasterclass.jsx's WordModal.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;

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
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const aiExplain = async () => {
    if (!form.word.trim()) return;
    setExplaining(true);
    try {
      const r = await api.post(`/language-masterclass/${language}/word-explain`, { word: form.word.trim() });
      const d = r.data || {};
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
        await api.patch(`/language-masterclass/${language}/admin/words/${word.id}`, form);
      } else {
        await api.post(`/language-masterclass/${language}/admin/words`, { ...form, category_id: categoryId });
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ background: meta.accent }}>
          <h3 id={titleId} className="text-white font-bold">{isEdit ? `Edit ${meta.short} Word` : `Add New ${meta.short} Word`}</h3>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Close dialog" className="text-white/70 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Field id="lang-word-field-word" label={`Word * (in ${meta.short})`} value={form.word} onChange={set('word')} placeholder={`e.g. a ${meta.short} word`} />
            </div>
            <button onClick={aiExplain} disabled={explaining || !form.word.trim()}
              aria-label="Let AI fill in the details" title="Let AI fill in the details"
              className="self-end flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 font-semibold px-3 py-2 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors">
              {explaining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI Fill
            </button>
          </div>
          <Field id="lang-word-field-phonetic" label="Phonetic (IPA)" value={form.phonetic} onChange={set('phonetic')} placeholder="e.g. /kjuː/" />
          <Field id="lang-word-field-definition" label="Definition (in English)" value={form.definition} onChange={set('definition')} type="textarea" placeholder="Clear, simple English definition" />
          <Field id="lang-word-field-example" label={`Example Sentence (in ${meta.short})`} value={form.example_sentence} onChange={set('example_sentence')} type="textarea" placeholder="A natural example sentence" />
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
            style={{ background: meta.accent }}>
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
function GenerateWordsPanel({ language, category, onGenerated, toast }) {
  const meta = LANGUAGE_META[language];
  const [count,      setCount]      = useState(10);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await api.post(`/language-masterclass/${language}/admin/generate-words`, {
        category_id:   category.id,
        category_name: category.name,
        difficulty:    category.difficulty,
        count,
      });
      // r.inserted is the hoisted top-level count (apiClient's interceptor
      // hoists it separately from r.data, which is the array of inserted
      // rows) — see apiClient.js. "skipped" isn't a hoisted field, so it's
      // derived here from the requested count instead of relying on a raw
      // response field the interceptor drops.
      const insertedCount = r.inserted ?? (Array.isArray(r.data) ? r.data.length : 0);
      toast(`✅ Generated ${insertedCount} words (${Math.max(0, count - insertedCount)} already existed)`, 'success');
      onGenerated();
    } catch (e) {
      toast(e.message || 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={{ background: meta.accentSoft, border: `1px solid ${meta.accentSoft}` }}>
      <div className="flex items-center gap-2">
        <Sparkles size={16} style={{ color: meta.accent }} className="shrink-0" />
        <div>
          <p className="text-sm font-semibold" style={{ color: meta.accent }}>Generate with AI</p>
          <p className="text-xs text-gray-600">Let Gemini create {meta.short} vocabulary for this category</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select value={count} onChange={e => setCount(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none">
          {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} words</option>)}
        </select>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
          style={{ background: meta.accent }}>
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

// ── Category row with expandable word list ────────────────────────────────────
function CategoryRow({ language, cat, allCategories, onRefresh, toast }) {
  const meta = LANGUAGE_META[language];
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
      const r = await api.get(`/language-masterclass/${language}/admin/words?category_id=${cat.id}`);
      setWords(r.data || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoadingW(false);
    }
  }, [language, cat.id]);

  const toggle = () => {
    if (!expanded) loadWords();
    setExpanded(e => !e);
  };

  const saveCat = async () => {
    const target = editForm.name.trim().toLowerCase();
    const dupe = allCategories.find(c =>
      c.id !== cat.id && c.difficulty === editForm.difficulty && c.name.trim().toLowerCase() === target
    );
    if (dupe) {
      return toast(`A "${editForm.difficulty}" category named "${dupe.name}" already exists.`, 'error');
    }
    setSavingCat(true);
    try {
      await api.patch(`/language-masterclass/${language}/admin/categories/${cat.id}`, editForm);
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
      await api.delete(`/language-masterclass/${language}/admin/categories/${cat.id}`);
      toast('Category deleted.', 'success');
      onRefresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const deleteWord = async (wordId) => {
    setDeleting(wordId);
    try {
      await api.delete(`/language-masterclass/${language}/admin/words/${wordId}`);
      setWords(ws => ws.filter(w => w.id !== wordId));
      toast('Word deleted.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const setE = (k) => (v) => setEditForm(f => ({ ...f, [k]: v }));
  const diffStyle = DIFF_STYLE[cat.difficulty] || DIFF_STYLE.Beginner;

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
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${diffStyle.badge}`}>
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
                className="flex items-center gap-1 text-xs text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                style={{ background: meta.accent }}>
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
          <GenerateWordsPanel language={language} category={cat} onGenerated={loadWords} toast={toast} />

          <div className="flex items-center justify-between mt-4 mb-3">
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Words ({words.length})</h4>
            <button onClick={() => setWordModal('new')}
              className="flex items-center gap-1 text-xs text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
              style={{ background: meta.accent }}>
              <Plus size={11} /> Add Word
            </button>
          </div>

          {loadingW ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-gray-400 mr-2" />
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
          language={language}
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

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminLanguageMasterclass() {
  const { language } = useParams();
  const navigate = useNavigate();
  const meta = LANGUAGE_META[language];

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
    if (!ADMIN_LANGUAGES.includes(language)) return;
    setLoading(true);
    try {
      const r = await api.get(`/language-masterclass/${language}/admin/categories`);
      setCategories(r.data || []);
    } catch (e) {
      showToast(e.message || 'Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    // Reset the "add category" form and its default emoji whenever the
    // language changes, so switching from French to German doesn't leave
    // a stray 🇫🇷 in the icon field.
    setShowAddCat(false);
    setNewCat({ name: '', description: '', difficulty: 'Beginner', icon_emoji: meta?.flag || '📚' });
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCategories]);

  if (!ADMIN_LANGUAGES.includes(language)) {
    return (
      <div className="min-h-screen bg-[#f9f7f4]">
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <AlertCircle className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-600">
            {LANGUAGE_META[language]
              ? `Content management for ${LANGUAGE_META[language].label} isn't available yet.`
              : `"${language}" isn't a language we offer yet.`}
          </p>
          <Link to="/admin/language-masterclass/french" className="text-sm font-semibold text-indigo-600 hover:underline mt-3 inline-block">
            Manage French content instead
          </Link>
        </div>
      </div>
    );
  }

  const addCategory = async () => {
    if (!newCat.name.trim()) return showToast('Category name is required', 'error');
    const target = newCat.name.trim().toLowerCase();
    const dupe = categories.find(c => c.difficulty === newCat.difficulty && c.name.trim().toLowerCase() === target);
    if (dupe) {
      return showToast(`A "${newCat.difficulty}" category named "${dupe.name}" already exists.`, 'error');
    }
    setSavingCat(true);
    try {
      await api.post(`/language-masterclass/${language}/admin/categories`, newCat);
      showToast('Category created!', 'success');
      setNewCat({ name: '', description: '', difficulty: 'Beginner', icon_emoji: meta.flag || '📚' });
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
    <div className="min-h-screen bg-[#f9f7f4]">
      <div className="max-w-3xl mx-auto py-8 px-4">
      <Toast msg={toast.msg} type={toast.type} />

      {/* Page header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: meta.accent }}>
            <span className="text-lg">{meta.flag}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Language Masterclass — {meta.short} Content</h1>
            <p className="text-xs text-gray-500">Manage {meta.short} vocabulary categories and words</p>
          </div>
        </div>
        <button onClick={() => setShowAddCat(s => !s)}
          className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          style={{ background: meta.accent }}>
          <Plus size={15} /> Add Category
        </button>
      </div>

      {/* Language switcher — other admin-managed languages, plus a way
          back to English's dedicated admin page. */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/admin/english-masterclass" className="flex items-center gap-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft size={13} /> English CMS
        </Link>
        <span className="text-gray-300">·</span>
        {ADMIN_LANGUAGES.map(l => (
          <button
            key={l}
            onClick={() => navigate(`/admin/language-masterclass/${l}`)}
            className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${
              l === language ? 'text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
            style={l === language ? { background: LANGUAGE_META[l].accent } : undefined}
          >
            {LANGUAGE_META[l].flag} {LANGUAGE_META[l].short}
          </button>
        ))}
      </div>

      {/* Add Category form */}
      {showAddCat && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-5" style={{ border: `1px solid ${meta.accentSoft}` }}>
          <h3 className="text-sm font-bold text-gray-800 mb-4">New {meta.short} Category</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Name *" value={newCat.name} onChange={setNC('name')} placeholder={`e.g. ${meta.short} Idioms`} />
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label="Icon Emoji" value={newCat.icon_emoji} onChange={setNC('icon_emoji')} placeholder={meta.flag} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Description" value={newCat.description} onChange={setNC('description')} type="textarea" placeholder="What will students learn?" />
            <Field label="Difficulty" value={newCat.difficulty} onChange={setNC('difficulty')} type="select" />
          </div>
          <div className="flex gap-3">
            <button onClick={addCategory} disabled={savingCat}
              className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              style={{ background: meta.accent }}>
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

      {/* Category list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-gray-400 mr-2" />
          <span className="text-gray-400 text-sm">Loading…</span>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No categories yet.</p>
          <p className="text-sm mt-1">Click "Add Category" to create the first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map(cat => (
            <CategoryRow key={cat.id} language={language} cat={cat} allCategories={categories} onRefresh={loadCategories} toast={showToast} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
