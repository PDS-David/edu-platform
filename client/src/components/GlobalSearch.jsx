// client/src/components/GlobalSearch.jsx
// X17 fix: floating search bar for students to find subjects, topics,
// and subtopics by name across the whole platform without navigating
// the hierarchy manually.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import { Search, BookOpen, Layers, FileText, X, Loader2 } from 'lucide-react';

const TYPE_META = {
  subject:  { icon: BookOpen, color: 'text-violet-500', bg: 'bg-violet-50',  label: 'Subject'  },
  topic:    { icon: Layers,   color: 'text-blue-500',   bg: 'bg-blue-50',    label: 'Topic'    },
  subtopic: { icon: FileText, color: 'text-emerald-500',bg: 'bg-emerald-50', label: 'Subtopic' },
};

function buildPath(result) {
  switch (result.type) {
    case 'subject':  return `/student/subject/${result.subject_id}`;
    case 'topic':    return `/student/subject/${result.subject_id}`;
    case 'subtopic': return `/student/subtopic/${result.subtopic_id}`;
    default:         return '/student/dashboard';
  }
}

export default function GlobalSearch({ className = '' }) {
  const navigate = useNavigate();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [active,  setActive]  = useState(-1);
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);
  const wrapRef   = useRef(null);

  // Debounced search
  const doSearch = useCallback((q) => {
    clearTimeout(timerRef.current);
    if (!q || q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await api.get('/subjects/search', { params: { q } });
        setResults(r.data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    doSearch(query);
    setActive(-1);
  }, [query, doSearch]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard: ⌘K / Ctrl+K to open
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleKey = (e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, -1)); }
    if (e.key === 'Enter' && active >= 0) { select(results[active]); }
  };

  const select = (result) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    navigate(buildPath(result));
  };

  const showDropdown = open && (loading || results.length > 0 || (query.length >= 2 && !loading));

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Trigger button (collapsed) */}
      {!open ? (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 transition-colors"
          title="Search (Ctrl+K)"
        >
          <Search size={14} />
          <span className="hidden sm:inline text-xs">Search topics…</span>
          <kbd className="hidden sm:inline text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      ) : (
        <div className="flex items-center gap-2 bg-white border border-blue-300 shadow-md rounded-xl px-3 py-2 w-72">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search subjects, topics, subtopics…"
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
            autoComplete="off"
          />
          {loading
            ? <Loader2 size={13} className="text-gray-400 animate-spin shrink-0" />
            : query
              ? <button onClick={() => { setQuery(''); setResults([]); }} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={13} /></button>
              : <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={13} /></button>
          }
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
          {loading && results.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-400">
              No results found for "{query}"
            </div>
          )}

          {results.length > 0 && (
            <ul>
              {results.map((r, i) => {
                const meta = TYPE_META[r.type] || TYPE_META.subtopic;
                const Icon = meta.icon;
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); select(r); }}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
                        ${i === active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon size={13} className={meta.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                        {(r.subtitle || r.context) && (
                          <p className="text-xs text-gray-400 truncate">
                            {[r.subtitle, r.context].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold ${meta.color} shrink-0 mt-1`}>
                        {meta.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
