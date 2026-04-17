'use strict';

/**
 * Standard API Response Helpers
 * Ensures ALL endpoints return:
 * {
 *   success: boolean,
 *   data: any,
 *   meta?: { total, page, limit },
 *   error?: string
 * }
 */

function success(res, { data = null, meta = null, status = 200 }) {
  const response = { success: true };

  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;

  return res.status(status).json(response);
}

function error(res, { message = 'Something went wrong', status = 500 }) {
  return res.status(status).json({
    success: false,
    error: message,
  });
}

/**
 * Pagination helper
 */
function paginated(res, { data = [], total = 0, page = 1, limit = 20 }) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      total,
      page,
      limit,
    },
  });
}

module.exports = {
  success,
  error,
  paginated,
};
