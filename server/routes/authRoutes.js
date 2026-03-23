// server/routes/authRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Authentication routes for the EAC Learning Platform.
//
// Roles: student | teacher | admin
//
// Supported examination boards:
//   Nigerian:     JAMB/UTME, WAEC/NECO (SSCE), Junior WAEC (BECE)
//   Cambridge:    Cambridge A Level, Cambridge O Level, Cambridge Pre IGCSE,
//                 Cambridge Primary
//   Edexcel:      Edexcel A Level, Edexcel International A Level
//   AQA:          AQA A Level
//   International: IELTS, TOEFL, SAT
//   (and any future boards added via the catalog)
//
// FIX v1.1 — loginWithSubscription race condition:
//   Added !res.headersSent guard + 2-second fallback timeout so the login
//   response is ALWAYS delivered, even when the secondary subscription_status
//   DB query hangs or errors. Without this fix, a momentary DB hiccup caused
//   the monkey-patched res.json to silently drop the response, producing
//   intermittent "Server error during login" 500s on the client.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const {
  register,
  login,
  getMe,
  updatePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
} = require('../controllers/auth');
const { protect } = require('../middleware/auth');

// ── Email service (fail-safe — never crashes if not configured) ───────────────
let sendWelcomeEmail = () => Promise.resolve();
try {
  sendWelcomeEmail = require('../services/emailService').sendWelcomeEmail;
} catch { /* emailService not installed — safe no-op */ }

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER WRAPPER
// Delegates to the real register controller, then sends a welcome email
// asynchronously via setImmediate so the HTTP response is never delayed.
// Applies to all roles: student, teacher, admin.
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN WRAPPER
// The auth controller's JWT payload does not include subscription_status.
// This wrapper intercepts the successful login response and injects
// subscription_status directly from the DB before it reaches the client.
//
// This is needed so the frontend (subscriptionGuard, PricingPage, dashboard
// upgrade banners) can render the correct state immediately after login
// without requiring a separate /auth/me refresh.
//
// Applies to all roles — teachers and admins have subscription_status too
// (typically 'active' or null); the guard is needed for students primarily
// but we populate it for all roles for consistency.
//
// ── FIX v1.1 ─────────────────────────────────────────────────────────────────
// Problem: the async DB query inside the monkey-patched res.json had no safety
// net. If sequelize.query() threw synchronously, or the DB was momentarily
// slow, the promise chain would either silently drop the response or call
// originalJson() after Express had already moved on — triggering the dreaded
// "Cannot set headers after they are sent" crash and the client-visible
// "Server error during login" message.
//
// Fix: two guards —
//   1. setTimeout(2000) fallback: always sends the response within 2 seconds
//      even if the DB query never resolves.
//   2. !res.headersSent check before every originalJson() call: prevents
//      double-send crashes if the timeout and the DB resolve in close
//      succession.
// ─────────────────────────────────────────────────────────────────────────────
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const loginWithSubscription = async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Only intercept successful logins where subscription_status is missing
    if (
      body?.success &&
      body?.data?.user &&
      body.data.user.subscription_status == null
    ) {
      const userId = body.data.user.id;

      if (userId) {
        // ── Safety net: always respond within 2 seconds ───────────────────
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
              body.data.user.subscription_status =
                rows[0].subscription_status || 'free';
            }
            // Guard: only call originalJson once
            if (!res.headersSent) originalJson(body);
          })
          .catch(() => {
            clearTimeout(timer);
            // DB query failed — send response without subscription_status
            // rather than leaving the client with no response at all
            if (!res.headersSent) originalJson(body);
          });

        return; // defer to .then() / .catch() above
      }
    }

    // All other cases: failed login, or subscription_status already present
    return originalJson(body);
  };

  return login(req, res, next);
};

// ── Public routes (no auth required) ─────────────────────────────────────────
router.post('/register',        registerWithEmail);
router.post('/login',           loginWithSubscription);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.post('/verify-email',    verifyEmail);

// ── Protected routes (JWT required) ──────────────────────────────────────────
// Accessible by all authenticated roles: student, teacher, admin
router.get('/me',       protect, getMe);
router.put('/password', protect, updatePassword);

module.exports = router;
