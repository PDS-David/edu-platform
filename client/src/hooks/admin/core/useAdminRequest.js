import { useState, useCallback } from 'react';

/**
 * Standard request wrapper:
 * - normalizes backend { success, data, error }
 * - prevents duplicated try/catch in domain hooks
 */
const useAdminRequest = () => {
  const [loading, setLoading] = useState(false);

  const request = useCallback(async (fn) => {
    setLoading(true);
    try {
      const res = await fn();
      return { ok: true, data: res };
    } catch (err) {
      return {
        ok: false,
        error: err?.error || err?.message || 'Request failed',
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { request, loading };
};

export default useAdminRequest;
