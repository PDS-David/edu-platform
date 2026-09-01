import { useState, useEffect, useCallback, useRef } from "react";
import apiClient from "../services/apiClient";

// cache
let _examTypesCache = null;
let _subjectCache = {};
const _inFlight = new Set();

export function useCatalog() {
  const [examTypes, setExamTypes] = useState(_examTypesCache || []);
  const [loadingTypes, setLoadingTypes] = useState(_examTypesCache === null);
  // BUG FIX: the exam-types fetch below used to swallow any failure
  // completely — no error state exposed to callers, not even a
  // console.error — so a failed or empty /catalog/types request left
  // AssignExamTypeModal.jsx's Step 1 rendering nothing at all below the
  // header: no spinner (loadingTypes correctly flips to false), no error,
  // no "nothing here" message. From the user's side this looked like a
  // completely broken, empty modal with zero indication of what went
  // wrong. Now exposed as `typesError` so callers can actually show
  // something.
  const [typesError, setTypesError] = useState(null);
  const [subjectCache, setSubjectCache] = useState({ ..._subjectCache });

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ─────────────────────────────────────────────
  // LOAD EXAM TYPES
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (_examTypesCache) {
      setExamTypes(_examTypesCache);
      setLoadingTypes(false);
      return;
    }

    (async () => {
      try {
        const res = await apiClient.get("/catalog/types");

        // apiClient already normalizes => res.data
        const list = res?.data || [];

        _examTypesCache = list;

        if (mounted.current) {
          setExamTypes(list);
          setLoadingTypes(false);
          setTypesError(null);
        }
      } catch (err) {
        console.error('[useCatalog] failed to load /catalog/types:', err?.response?.data?.error || err.message);
        _examTypesCache = null; // don't cache a failure as "confirmed empty" — retry next mount
        if (mounted.current) {
          setExamTypes([]);
          setLoadingTypes(false);
          setTypesError(err?.response?.data?.error || err.message || 'Could not load exam types.');
        }
      }
    })();
  }, []);

  // ─────────────────────────────────────────────
  // LOAD SUBJECTS FOR EXAM TYPE
  // ─────────────────────────────────────────────
  const fetchSubjectsForType = useCallback(async (typeId) => {
    if (!typeId) return [];

    if (_subjectCache[typeId]?.length) {
      return _subjectCache[typeId];
    }

    if (_inFlight.has(typeId)) return [];

    _inFlight.add(typeId);

    try {
      const res = await apiClient.get(
        `/catalog/types/${typeId}/subjects`
      );

      const subjects = res?.data || [];

      if (subjects.length > 0) {
        _subjectCache[typeId] = subjects;

        setSubjectCache((c) => ({
          ...c,
          [typeId]: subjects,
        }));
      }

      return subjects;
    } finally {
      _inFlight.delete(typeId);
    }
  }, []);

  // ─────────────────────────────────────────────
  // INVALIDATE CACHE
  // ─────────────────────────────────────────────
  const invalidateCache = useCallback((typeId) => {
    if (typeId) {
      delete _subjectCache[typeId];

      setSubjectCache((c) => {
        const copy = { ...c };
        delete copy[typeId];
        return copy;
      });
    } else {
      _examTypesCache = null;
      _subjectCache = {};

      setExamTypes([]);
      setSubjectCache({});
    }
  }, []);

  return {
    examTypes,
    loadingTypes,
    typesError,
    subjectCache,
    fetchSubjectsForType,
    invalidateCache,
  };
}
