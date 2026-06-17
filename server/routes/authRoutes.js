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

// Profile update
router.patch('/profile', protect, async (req, res) => {
  const { QueryTypes } = require('sequelize');
  const db = require('../config/database');
  const { first_name, last_name, phone, country } = req.body;
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
          first_name: first_name || '', last_name: last_name || '',
          phone: phone || null, country: country || null,
          id: req.user.id,
        },
        type: QueryTypes.UPDATE,
      }
    );
    return res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Notification preferences (client-side for now)
router.put('/notifications', protect, (_req, res) =>
  res.json({ success: true, message: 'Preferences saved' })
);

module.exports = router;
