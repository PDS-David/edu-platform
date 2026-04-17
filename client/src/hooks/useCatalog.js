/**
 * useCatalog.js  (src/hooks/useCatalog.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook providing:
 *   • examTypes
 *   • fetchSubjectsForType
 *   • subjectCache
 *   • loadingTypes / loadingSubject
 *   • invalidateCache
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import http from '../services/api';

// ── Module-level store ───────────────────────────────────────────────────────
let _examTypesCache = null;
let _subjectCache = {};
const _inFlight = new Set();

export function useCatalog() {
  const [examTypes, setExamTypes] = useState(_examTypesCache || []);
  const [loadingTypes, setLoadingTypes] = useState(_examTypesCache === null);
  const [subjectCache, setSubjectCache] = useState({ ..._subjectCache });
  const [loadingSubject, setLoadingSubject] = useState(false);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
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
        const list = await http.get('/catalog/types');

        _examTypesCache = list || [];

        if (!cancelled && mounted.current) {
          setExamTypes(_examTypesCache);
          setLoadingTypes(false);
        }
      } catch {
        if (!_examTypesCache) _examTypesCache = [];
        if (!cancelled && mounted.current) setLoadingTypes(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSubjectsForType = useCallback(async (typeId) => {
    if (!typeId) return [];

    if (_subjectCache[typeId]?.length > 0) {
      setSubjectCache((c) => ({ ...c, [typeId]: _subjectCache[typeId] }));
      return _subjectCache[typeId];
    }

    if (_inFlight.has(typeId)) return [];

    _inFlight.add(typeId);
    if (mounted.current) setLoadingSubject(true);

    try {
      const subjects = await http.get(
        `/catalog/types/${typeId}/subjects`
      );

      if (subjects?.length > 0) {
        _subjectCache[typeId] = subjects;

        if (mounted.current) {
          setSubjectCache((c) => ({ ...c, [typeId]: subjects }));
        }
      }

      return subjects || [];
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

      setSubjectCache((c) => {
        const next = { ...c };
        delete next[typeId];
        return next;
      });
    } else {
      _examTypesCache = null;
      _subjectCache = {};

      setExamTypes([]);
      setSubjectCache({});
      setLoadingTypes(true);
    }
  }, []);

  const refreshExamTypes = useCallback(async () => {
    _examTypesCache = null;
    if (mounted.current) setLoadingTypes(true);

    try {
      const list = await http.get('/catalog/types');

      _examTypesCache = list || [];

      if (mounted.current) {
        setExamTypes(_examTypesCache);
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
