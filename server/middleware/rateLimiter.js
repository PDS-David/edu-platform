'use strict';

/**
 * server/middleware/rateLimiter.js
 *
 * Rate limiters for AISchoolOnair.
 * Added: adminActionLimiter — tight window for admin write operations.
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

// ── Global limiter ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// ── AI limiter ────────────────────────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'AI request limit exceeded' },
});

// ── Analytics limiter ─────────────────────────────────────────────────────────
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// ── Auth limiter ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

// ── Streaming limiter ─────────────────────────────────────────────────────────
// Keys on userId (JWT) so shared NAT IPs (Nigerian school labs) don't throttle
// entire classrooms. Falls back to IP for unauthenticated requests.
const streamingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `user:${req.user.id}`;
    return ipKeyGenerator(req);
  },
  message: { success: false, error: 'Streaming rate limit exceeded. Please wait before retrying.' },
  skip: (req) => {
    const role = req.user?.role;
    return role === 'admin' || role === 'teacher';
  },
});

// ── Admin action limiter ──────────────────────────────────────────────────────
// 30 write/destructive operations per admin per 15-minute window.
// Keys on user ID so one admin hitting the limit does not affect others.
const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `admin:${req.user?.id || ipKeyGenerator(req)}`,
  message: {
    success: false,
    error: 'Admin action rate limit exceeded. Too many changes in a short period.',
    code: 'ADMIN_RATE_LIMIT',
  },
  skip: () => false,
});

module.exports = {
  globalLimiter,
  aiLimiter,
  analyticsLimiter,
  authLimiter,
  streamingLimiter,
  adminActionLimiter,
};
