/**
 * useCatalog.js  (src/hooks/useCatalog.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook providing:
 *   • examTypes            – all active exam types from /catalog/types
 *   • fetchSubjectsForType – fetches subjects per type (caches NON-EMPTY results only)
 *   • subjectCache         – { [typeId]: Subject[] }
 *   • loadingTypes / loadingSubject
 *   • invalidateCache      – call after adding/editing subjects in CatalogPanel
 *
 * Cache rules:
 *   - Exam types: cached for the browser session (set once, never stale)
 *   - Subjects:   cached ONLY when the API returns ≥1 subjects.
 *                 Empty results are NOT cached — adding a subject and then
 *                 re-selecting the same exam type always triggers a fresh fetch.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';

// ── Module-level store (survives re-renders and re-mounts) ────────────────────
let _examTypesCache = null;       // null = not yet fetched; [] = fetched but empty
let _subjectCache   = {};         // { [typeId]: Subject[] }  — only non-empty arrays
const _inFlight     = new Set();  // typeIds currently being fetched (dedup guard)

// ─────────────────────────────────────────────────────────────────────────────
export function useCatalog() {
  const [examTypes,      setExamTypes]      = useState(_examTypesCache || []);
  const [loadingTypes,   setLoadingTypes]   = useState(_examTypesCache === null);
  const [subjectCache,   setSubjectCache]   = useState({ ..._subjectCache });
  const [loadingSubject, setLoadingSubject] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Fetch exam types once per session ──────────────────────────────────────
  useEffect(() => {
    if (_examTypesCache !== null) {
      setExamTypes(_examTypesCache);
      setLoadingTypes(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res  = await api.get('/catalog/types');
        const list = res?.success ? (res.data || []) : [];
        _examTypesCache = list;
        if (!cancelled && mounted.current) {
          setExamTypes(list);
          setLoadingTypes(false);
        }
      } catch {
        if (!_examTypesCache) _examTypesCache = [];
        if (!cancelled && mounted.current) setLoadingTypes(false);
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch subjects for a given typeId ─────────────────────────────────────
  // KEY RULE: only serve from cache if cached array is NON-EMPTY.
  // Empty results are never cached so that after an admin adds a subject in
  // Catalog Management the next modal open always gets fresh data.
  const fetchSubjectsForType = useCallback(async (typeId) => {
    if (!typeId) return [];

    // Serve from cache only if we have real subjects stored
    if (_subjectCache[typeId] && _subjectCache[typeId].length > 0) {
      setSubjectCache(c => ({ ...c, [typeId]: _subjectCache[typeId] }));
      return _subjectCache[typeId];
    }

    // Deduplicate concurrent calls for the same typeId
    if (_inFlight.has(typeId)) return [];

    _inFlight.add(typeId);
    if (mounted.current) setLoadingSubject(true);

    try {
      const res      = await api.get(`/catalog/types/${typeId}/subjects`);
      const subjects = res?.success ? (res.data || []) : [];

      // Only cache non-empty results
      if (subjects.length > 0) {
        _subjectCache[typeId] = subjects;
        if (mounted.current) setSubjectCache(c => ({ ...c, [typeId]: subjects }));
      }

      return subjects;
    } catch {
      return [];
    } finally {
      _inFlight.delete(typeId);
      if (mounted.current) setLoadingSubject(false);
    }
  }, []);

  // ── Invalidate cache ───────────────────────────────────────────────────────
  // invalidateCache(typeId)  — bust one type's subject cache
  // invalidateCache()        — full reset (exam types + all subjects)
  const invalidateCache = useCallback((typeId) => {
    if (typeId !== undefined) {
      delete _subjectCache[typeId];
      setSubjectCache(c => {
        const next = { ...c };
        delete next[typeId];
        return next;
      });
    } else {
      _examTypesCache = null;
      _subjectCache   = {};
      setExamTypes([]);
      setSubjectCache({});
      setLoadingTypes(true);
    }
  }, []);

  // ── Force re-fetch exam types (for manual Refresh button) ─────────────────
  const refreshExamTypes = useCallback(async () => {
    _examTypesCache = null;
    if (mounted.current) setLoadingTypes(true);
    try {
      const res  = await api.get('/catalog/types');
      const list = res?.success ? (res.data || []) : [];
      _examTypesCache = list;
      if (mounted.current) { setExamTypes(list); setLoadingTypes(false); }
    } catch {
      _examTypesCache = [];
      if (mounted.current) setLoadingTypes(false);
    }
  }, []);

  return {
    examTypes,
    loadingTypes,
    subjectCache,
    loadingSubject,
    fetchSubjectsForType,
    invalidateCache,
    refreshExamTypes,
    getSubjects: (typeId) => _subjectCache[typeId] || [],
  };
}
