// server/routes/authRoutes.js
//
// Authentication routes.
//
// Fix v1.1 — loginWithSubscription race condition:
//   Added !res.headersSent guard + 2-second fallback timeout so the login
//   response is ALWAYS delivered even when the secondary subscription_status
//   DB query hangs or errors. Without this fix, a momentary DB hiccup caused
//   the monkey-patched res.json to silently drop the response, producing
//   intermittent "Server error during login" 500s on the client.

const express = require('express');
const router  = express.Router();
const {
  register, login, getMe, updatePassword,
  forgotPassword, resetPassword, verifyEmail,
} = require('../controllers/auth');
const { protect } = require('../middleware/auth');

let sendWelcomeEmail = () => Promise.resolve();
try {
  sendWelcomeEmail = require('../services/emailService').sendWelcomeEmail;
} catch { /* emailService not installed — safe no-op */ }

// Wraps register to send a welcome email after a successful registration.
// Uses setImmediate so the HTTP response is never delayed by email sending.
const registerWithEmail = async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    if (body?.success && body?.data?.user?.email) {
      setImmediate(() =>
        sendWelcomeEmail({
          email:      body.data.user.email,
          first_name: body.data.user.firstName || body.data.user.first_name || '',
          role:       body.data.user.role || 'student',
        }).catch(() => {})
      );
    }
    return originalJson(body);
  };

  return register(req, res, next);
};

// Wraps login to inject subscription_status from the DB into the response.
// This avoids a separate /auth/me call on the frontend after login.
// Two safety guards prevent double-send crashes:
//   1. setTimeout(2000) always sends the response within 2 seconds
//   2. !res.headersSent check prevents calling originalJson() twice
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

const loginWithSubscription = async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    if (body?.success && body?.data?.user && body.data.user.subscription_status == null) {
      const userId = body.data.user.id;

      if (userId) {
        const timer = setTimeout(() => {
          if (!res.headersSent) originalJson(body);
        }, 2000);

        sequelize
          .query(
            `SELECT subscription_status FROM users WHERE id = :id LIMIT 1`,
            { replacements: { id: userId }, type: QueryTypes.SELECT }
          )
          .then(rows => {
            clearTimeout(timer);
            if (rows[0]) {
              body.data.user.subscription_status = rows[0].subscription_status || 'free';
            }
            if (!res.headersSent) originalJson(body);
          })
          .catch(() => {
            clearTimeout(timer);
            if (!res.headersSent) originalJson(body);
          });

        return;
      }
    }

    return originalJson(body);
  };

  return login(req, res, next);
};

// Public routes — no auth required
router.post('/register',        registerWithEmail);
router.post('/login',           loginWithSubscription);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.post('/verify-email',    verifyEmail);

// Protected routes — JWT required
router.get('/me',       protect, getMe);
router.put('/password', protect, updatePassword);

// PUT /api/auth/notifications — save notification preferences
router.put('/notifications', protect, async (req, res) => {
  // Preferences stored client-side (localStorage) for now — just acknowledge
  return res.json({ success: true, message: 'Preferences saved' });
});

// PATCH /api/auth/profile — update name, phone, country
router.patch('/profile', protect, async (req, res) => {
  const { QueryTypes } = require('sequelize');
  const db = require('../config/database');
  const { first_name, last_name, phone, country } = req.body;
  try {
    await db.query(
      ,
      { replacements: { first_name: first_name||'', last_name: last_name||'', phone: phone||null, country: country||null, id: req.user.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
