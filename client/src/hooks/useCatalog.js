/**
 * client/src/hooks/useCatalog.js
 */

import { useState, useEffect, useCallback, useRef } from "react";
import api from "../services/api";

// cache
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
    if (_examTypesCache) {
      setExamTypes(_examTypesCache);
      setLoadingTypes(false);
      return;
    }

    (async () => {
      try {
        const res = await api.get("/catalog/types");
        const list = res?.data || [];

        _examTypesCache = list;

        if (mounted.current) {
          setExamTypes(list);
          setLoadingTypes(false);
        }
      } catch {
        _examTypesCache = [];
        setLoadingTypes(false);
      }
    })();
  }, []);

  const fetchSubjectsForType = useCallback(async (typeId) => {
    if (!typeId) return [];

    if (_subjectCache[typeId]?.length) {
      return _subjectCache[typeId];
    }

    if (_inFlight.has(typeId)) return [];

    _inFlight.add(typeId);

    try {
      const res = await api.get(`/catalog/types/${typeId}/subjects`);
      const subjects = res?.data || [];

      if (subjects.length > 0) {
        _subjectCache[typeId] = subjects;
        setSubjectCache((c) => ({ ...c, [typeId]: subjects }));
      }

      return subjects;
    } finally {
      _inFlight.delete(typeId);
    }
  }, []);

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
    subjectCache,
    loadingSubject,
    fetchSubjectsForType,
    invalidateCache,
  };
}
