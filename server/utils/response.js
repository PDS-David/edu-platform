'use strict';

/**
 * Standard API Response Helpers
 * Enforces:
 * {
 *   success: true,
 *   data: ...,
 *   meta?: { total, page, limit }
 * }
 */

function success(res, data = null, meta = null, status = 200) {
  const response = { success: true };

  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;

  return res.status(status).json(response);
}

function error(res, message = 'Server Error', status = 500, extra = null) {
  const response = {
    success: false,
    error: message,
  };

  if (extra) response.meta = extra;

  return res.status(status).json(response);
}

function paginated(res, data, { total = 0, page = 1, limit = 20 } = {}) {
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
