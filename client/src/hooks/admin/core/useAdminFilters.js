import { useState } from 'react';

const useAdminFilters = (initial = {}) => {
  const [filters, setFilters] = useState(initial);

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(initial);

  return {
    filters,
    setFilter,
    resetFilters,
  };
};

export default useAdminFilters;
