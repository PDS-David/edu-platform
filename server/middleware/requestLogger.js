// server/middleware/requestLogger.js
// ─────────────────────────────────────────────────────────────────────────────
// HTTP request logger middleware.
//
// Logs one structured line per completed request:
//   { method, path, status, duration_ms, requestId, userId? }
//
// Skips /health — high-frequency health-check polls bloat the log with noise.
//
// Uses the 'finish' event on res so the status code is always final.
// Must be mounted AFTER requestId middleware so req.requestId is available.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const logger = require('../config/logger');

module.exports = function requestLogger(req, res, next) {
  if (req.path === '/health') return next();

  const startedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const status   = res.statusCode;
    const level    = status >= 500 ? 'error'
                   : status >= 400 ? 'warn'
                   : 'http';

    logger[level](`${req.method} ${req.path} ${status}`, {
      requestId:   req.requestId,
      method:      req.method,
      path:        req.path,
      status,
      duration_ms: duration,
      ...(req.user?.id && { userId: req.user.id }),
    });
  });

  next();
};
