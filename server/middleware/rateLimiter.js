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

// ── Pronunciation-scoring limiter ─────────────────────────────────────────────
// Backstop behind the client-side soft cap (PRON_SESSION_BUDGET in
// PracticeSession.jsx). The client cap is what students actually see and is
// friendly/soft; this is the server-side hard limit in case that's ever
// bypassed (a modified client, direct API calls, etc). Each request is a
// Gemini audio call, so this exists purely for cost control, not UX — hence
// a looser window than the per-session budget. Keyed on user ID so a shared
// school-lab IP doesn't throttle other students.
const pronunciationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 40,                   // generous vs. the ~15/session client soft cap — a student doing 2 sessions in an hour is normal
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `pron:${req.user.id}`;
    return ipKeyGenerator(req);
  },
  message: { success: false, error: "You've done a lot of speaking practice this hour — please try again a bit later." },
});

// ── School-join limiter ───────────────────────────────────────────────────────
// Keyed on the authenticated user's ID, not IP — same reasoning as
// streamingLimiter/pronunciationLimiter: shared school-lab NAT IPs would
// otherwise let one student's join-code attempts throttle the whole lab.
// /api/schools/join runs after `protect`, so req.user.id is always present
// here; the IP fallback below is defensive only, and should not be reachable.
const schoolJoinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // same cadence as authLimiter — join_code entry is a similar low-frequency, mistake-prone action
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `schooljoin:${req.user.id}`;
    return ipKeyGenerator(req);
  },
  message: { success: false, error: 'Too many school-join attempts, please try again later.' },
});

module.exports = { globalLimiter, aiLimiter, analyticsLimiter, authLimiter, streamingLimiter, adminActionLimiter, pronunciationLimiter, schoolJoinLimiter };
