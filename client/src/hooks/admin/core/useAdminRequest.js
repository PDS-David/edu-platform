import { useState, useCallback } from 'react';

/**
 * Standard request wrapper:
 * - works with apiClient normalized response
 * - returns ONLY payload in data
 */
const useAdminRequest = () => {
  const [loading, setLoading] = useState(false);

  const request = useCallback(async (fn) => {
    setLoading(true);
    try {
      const res = await fn();

      return {
        ok: true,
        data: res.data,   // ✅ FIX: extract ONCE here
        meta: res.meta || null,
      };
    } catch (err) {
      return {
        ok: false,
        error: err?.message || 'Request failed', // ✅ FIX
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { request, loading };
};

export default useAdminRequest;
