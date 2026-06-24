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
  max: 600,  // raised from 200 — a student doing a quiz fires ~30 req/session
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

// ── Admin-action limiter (R-02) ───────────────────────────────────────────────
// Applied to write operations on admin routes: create-teacher, account
// creation, role changes.  More permissive than authLimiter (an admin
// legitimately batches teacher creation) but still prevents abuse of a
// compromised or malicious admin token.
// Keys on the authenticated user ID so different admins have independent
// budgets; falls back to IP for any unauthenticated slip-through (should not
// happen given protect middleware runs first, but defensive).
const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 50,                     // 50 write actions per 15 min per admin user
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `admin:${req.user.id}`;
    const ip = (req.ip || '').replace(/^::ffff:/, '').replace(/%.*$/, '');
    return ip || 'unknown';
  },
  message: { success: false, error: 'Too many admin actions, please slow down and try again.' },
});

module.exports = { globalLimiter, aiLimiter, analyticsLimiter, authLimiter, streamingLimiter, adminActionLimiter };
