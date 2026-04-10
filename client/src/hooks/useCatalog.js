/**
 * useCatalog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook that provides:
 *   • examTypes  – all active exam types from /catalog/types
 *   • fetchSubjectsForType(typeId) – fetches + caches subjects per type
 *   • subjectCache  – { [typeId]: Subject[] }
 *   • loadingTypes / loadingSubjects
 *
 * Drop this file next to your other hooks (e.g. src/hooks/useCatalog.js).
 * Import it wherever you need exam types or dynamic subject lists.
 *
 * Usage:
 *   const { examTypes, loadingTypes, fetchSubjectsForType, subjectCache } = useCatalog();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ── Module-level cache so re-mounts don't re-fetch ───────────────────────────
let _examTypesCache = null;          // null = not yet fetched
let _subjectCache   = {};            // { [typeId]: Subject[] }
const _pendingTypes    = new Set();  // typeIds currently being fetched

// ─────────────────────────────────────────────────────────────────────────────
export function useCatalog() {
  const [examTypes,      setExamTypes]      = useState(_examTypesCache || []);
  const [loadingTypes,   setLoadingTypes]   = useState(!_examTypesCache);
  const [subjectCache,   setSubjectCache]   = useState({ ..._subjectCache });
  const [loadingSubject, setLoadingSubject] = useState(false); // true while any subject fetch is in flight
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Fetch exam types once (module-level cache) ──────────────────────────────
  useEffect(() => {
    if (_examTypesCache) return; // already fetched

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/catalog/types');
        const list = res?.success ? (res.data || []) : [];
        _examTypesCache = list;
        if (!cancelled && mounted.current) {
          setExamTypes(list);
          setLoadingTypes(false);
        }
      } catch {
        _examTypesCache = _examTypesCache || []; // don't retry on error
        if (!cancelled && mounted.current) setLoadingTypes(false);
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // ── Fetch subjects for a specific exam type (with per-type cache) ───────────
  const fetchSubjectsForType = useCallback(async (typeId) => {
    if (!typeId) return [];

    // Already cached
    if (_subjectCache[typeId]) {
      setSubjectCache(c => ({ ...c, [typeId]: _subjectCache[typeId] }));
      return _subjectCache[typeId];
    }

    // Already in-flight (deduplicate)
    if (_pendingTypes.has(typeId)) return [];

    _pendingTypes.add(typeId);
    if (mounted.current) setLoadingSubject(true);

    try {
      const res = await api.get(`/catalog/types/${typeId}/subjects`);
      const subjects = res?.success ? (res.data || []) : [];
      _subjectCache[typeId] = subjects;
      if (mounted.current) setSubjectCache(c => ({ ...c, [typeId]: subjects }));
      return subjects;
    } catch {
      return [];
    } finally {
      _pendingTypes.delete(typeId);
      if (mounted.current) setLoadingSubject(false);
    }
  }, []);

  // ── Helper: invalidate cache (call after Catalog Management saves) ──────────
  const invalidateCache = useCallback((typeId) => {
    if (typeId) {
      delete _subjectCache[typeId];
      setSubjectCache(c => { const next = { ...c }; delete next[typeId]; return next; });
    } else {
      // full reset
      _examTypesCache = null;
      _subjectCache   = {};
      setExamTypes([]);
      setSubjectCache({});
      setLoadingTypes(true);
    }
  }, []);

  return {
    examTypes,
    loadingTypes,
    subjectCache,
    loadingSubject,
    fetchSubjectsForType,
    invalidateCache,
    /** Convenience: subjects already in cache for a given typeId */
    getSubjects: (typeId) => _subjectCache[typeId] || [],
  };
}
