// server/middleware/rateLimiter.js
// ─────────────────────────────────────────────────────────────────────────────
// Rate limiters for the AISchoolonair API.
//
// STREAMING LIMITER (2026-06-16):
//   Video routes get their own per-user limiter with a generous window so that
//   a student watching a lecture doesn't hit the global IP cap. Because many
//   Nigerian schools share a single NAT IP (cyber-cafes, school labs) the
//   global limiter uses IP; the streaming limiter keys on the JWT user ID when
//   available, falling back to IP for unauthenticated requests.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const rateLimit = require('express-rate-limit');

// ── Global limiter — all routes ───────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// ── AI limiter — expensive inference routes ───────────────────────────────────
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

// ── Auth limiter — login / register / password-reset ─────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

// ── Streaming limiter — HLS manifest / segment / key / progress endpoints ────
// Keys on userId (from JWT) when available, so shared NAT IPs don't throttle
// classrooms. A student hitting segments every 6 s generates ~150 requests per
// 15-minute window — well inside the 600 limit for a single viewer.
const streamingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 600,                    // ~150 seg requests × 4 students on same IP
  standardHeaders: true,
  legacyHeaders: false,
  // Use JWT user ID as key when req.user is set (protect runs before this),
  // otherwise fall back to IP. Normalise the IP so IPv6 addresses don't
  // produce inconsistent keys.
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `user:${req.user.id}`;
    const ip = (req.ip || '').replace(/^::ffff:/, '').replace(/%.*$/, '');
    return ip || 'unknown';
  },
  validate: { xForwardedForHeader: false },
  message: { success: false, error: 'Streaming rate limit exceeded. Please wait before retrying.' },
  skip: (req) => {
    // Never throttle admin or teacher roles
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
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `admin:${req.user.id}`;
    const ip = (req.ip || '').replace(/^::ffff:/, '').replace(/%.*$/, '');
    return ip || 'unknown';
  },
  message: { success: false, error: 'Too many admin actions, please slow down and try again.' },
});

module.exports = { globalLimiter, aiLimiter, analyticsLimiter, authLimiter, streamingLimiter, adminActionLimiter };
