'use strict';

/**
 * Standard API Response Helpers
 * Enforces consistent contract across backend
 */

function success(res, data = null, meta = null, status = 200) {
  const response = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(status).json(response);
}

function error(res, message = 'Something went wrong', status = 500, extra = null) {
  const response = {
    success: false,
    error: message,
  };

  if (extra) {
    response.details = extra;
  }

  return res.status(status).json(response);
}

/**
 * Pagination helper
 */
function paginated(res, data, total, page = 1, limit = 20) {
  return success(res, data, {
    total,
    page,
    limit,
  });
}

module.exports = {
  success,
  error,
  paginated,
};
