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
let _examTypesCache = null;
let _subjectCache   = {};
const _inFlight     = new Set();

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
  }, []);

  const fetchSubjectsForType = useCallback(async (typeId) => {
    if (!typeId) return [];

    if (_subjectCache[typeId] && _subjectCache[typeId].length > 0) {
      setSubjectCache(c => ({ ...c, [typeId]: _subjectCache[typeId] }));
      return _subjectCache[typeId];
    }

    if (_inFlight.has(typeId)) return [];

    _inFlight.add(typeId);
    if (mounted.current) setLoadingSubject(true);

    try {
      const res = await api.get(`/catalog/types/${typeId}/subjects`);
      const subjects = res?.success ? (res.data || []) : [];

      if (subjects.length > 0) {
        _subjectCache[typeId] = subjects;
        if (mounted.current) {
          setSubjectCache(c => ({ ...c, [typeId]: subjects }));
        }
      }

      return subjects;
    } catch {
      return [];
    } finally {
      _inFlight.delete(typeId);
      if (mounted.current) setLoadingSubject(false);
    }
  }, []);

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

  const refreshExamTypes = useCallback(async () => {
    _examTypesCache = null;
    if (mounted.current) setLoadingTypes(true);

    try {
      const res  = await api.get('/catalog/types');
      const list = res?.success ? (res.data || []) : [];
      _examTypesCache = list;

      if (mounted.current) {
        setExamTypes(list);
        setLoadingTypes(false);
      }
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
