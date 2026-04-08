// server/middleware/requestId.js
// ─────────────────────────────────────────────────────────────────────────────
// Stamps every incoming request with a unique ID so all log lines produced
// during that request can be correlated in one grep.
//
// Priority:
//   1. Honour X-Request-ID sent by an upstream proxy or load balancer.
//   2. Otherwise generate a new crypto-random UUID.
//
// Sets:
//   req.requestId          — available to every downstream middleware and route
//   res.setHeader(...)     — echoed back to the client so they can report it
//
// Mount order: FIRST middleware in server.js, before everything else.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { randomUUID } = require('crypto');

module.exports = function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  next();
};
