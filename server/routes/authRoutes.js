'use strict';

/**
 * routes/authRoutes.js
 *
 * AUTH-001  lockout errors surfaced from controller
 * AUTH-002  POST /logout, POST /logout-all
 * AUTH-003  rememberMe forwarded to controller
 * AUTH-004  cookie-parser mounted; refresh cookie set by controller
 * AUTH-005  POST /refresh — token rotation
 * AUTH-006  audit wired inside controller
 */

const express      = require('express');
const cookieParser = require('cookie-parser');
const router       = express.Router();

const {
  register, login, logout, logoutAll, refreshToken,
  getMe, updatePassword, forgotPassword, resetPassword, verifyEmail,
} = require('../controllers/auth');

const { protect }     = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  normalisePhone,
  validatePhone,
  normaliseName,
} = require('../utils/registrationValidators');

// Mount cookie-parser only for auth routes (minimise surface area)
router.use(cookieParser());

// ─── Email side-effects ───────────────────────────────────────────────────────
let sendWelcomeEmail = () => Promise.resolve();
try { sendWelcomeEmail = require('../services/emailService').sendWelcomeEmail; } catch {}

const registerWithEmail = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (body?.success && body?.user?.email) {
      setImmediate(() =>
        sendWelcomeEmail({
          email:      body.user.email,
          first_name: body.user.first_name || '',
          role:       body.user.role || 'student',
        }).catch(() => {})
      );
    }
    return originalJson(body);
  };
  return register(req, res, next);
};

// ─── Public routes ────────────────────────────────────────────────────────────
router.post('/register',        authLimiter, registerWithEmail);
router.post('/login',           authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password',  authLimiter, resetPassword);
router.post('/verify-email',    verifyEmail);

// AUTH-005 — refresh (no protect; token may already be expired)
router.post('/refresh', authLimiter, refreshToken);

// ─── Protected routes ─────────────────────────────────────────────────────────
router.get ('/me',              protect, getMe);
router.put ('/password',        protect, updatePassword);

// AUTH-002 — logout
router.post('/logout',          protect, logout);
router.post('/logout-all',      protect, logoutAll);

// PATCH /api/auth/profile — update name, phone, country
// R-01: phone is normalised to E.164 before storing.
// R-04: name fields are trimmed/collapsed.
router.patch('/profile', protect, async (req, res) => {
  const { QueryTypes } = require('sequelize');
  const db = require('../config/database');

  const first_name = normaliseName(req.body.first_name || '');
  const last_name  = normaliseName(req.body.last_name  || '');
  const country    = (req.body.country || '').trim() || null;

  // Phone: validate only if provided; a missing phone leaves the existing DB value intact
  let phone = null;
  if (req.body.phone) {
    const phoneCheck = validatePhone(req.body.phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ success: false, error: phoneCheck.error });
    }
    phone = normalisePhone(req.body.phone);               // R-01: E.164
  }

  try {
    await db.query(
      `UPDATE users SET
         first_name = COALESCE(NULLIF(:first_name,''), first_name),
         last_name  = COALESCE(NULLIF(:last_name,''),  last_name),
         phone      = COALESCE(:phone, phone),
         country    = COALESCE(:country, country),
         updated_at = NOW()
       WHERE id = :id`,
      {
        replacements: {
          first_name: first_name || '',
          last_name:  last_name  || '',
          phone,
          country,
          id: req.user.id,
        },
        type: QueryTypes.UPDATE,
      }
    );
    return res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    console.error('[PATCH /profile]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// Notification preferences (client-side for now)
router.put('/notifications', protect, (_req, res) =>
  res.json({ success: true, message: 'Preferences saved' })
);

// ── POST /api/auth/heartbeat ─────────────────────────────────────────────────
// Called by the client every 5 minutes during long sessions (e.g. quiz timer).
// Touches last_used_at on the auth_tokens row so inactivity TTL doesn't fire.
// Returns 200 with { alive: true } — no user data needed.
router.post('/heartbeat', protect, (req, res) => {
  // protect middleware already called verifyAccessToken which updates last_used_at
  return res.json({ success: true, alive: true });
});

module.exports = router;
