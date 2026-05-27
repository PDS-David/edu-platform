import { useState, useCallback } from 'react';

const useAdminToast = (timeout = 3000) => {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), timeout);
  }, [timeout]);

  const clearToast = useCallback(() => setToast(null), []);

  return { toast, showToast, clearToast };
};

export default useAdminToast;
