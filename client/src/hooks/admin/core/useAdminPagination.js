import { useState, useMemo } from 'react';

const useAdminPagination = (initialPage = 1, limit = 20) => {
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(
    () => Math.ceil(total / limit),
    [total, limit]
  );

  const resetPage = () => setPage(1);

  return {
    page,
    setPage,
    resetPage,
    total,
    setTotal,
    totalPages,
    limit,
  };
};

export default useAdminPagination;
