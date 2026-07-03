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
  registerForEnglishMasterclass,
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
// Standalone English Masterclass registration — independent account creation,
// not layered on top of an AISchoolonair account. Deliberately NOT wrapped in
// registerWithEmail's welcome-email side effect wrapper (separate product,
// separate onboarding — can wire its own email later if wanted).
router.post('/em-register',     authLimiter, registerForEnglishMasterclass);
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

// ── GET /api/auth/notification-preferences ────────────────────────────────────
// S2: load notification prefs from DB so they persist across devices/browsers.
router.get('/notification-preferences', protect, async (req, res) => {
  const { QueryTypes } = require('sequelize');
  const db = require('../config/database');
  try {
    const rows = await db.query(
      `SELECT notification_preferences FROM users WHERE id = :id LIMIT 1`,
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );
    const prefs = rows[0]?.notification_preferences || {
      email_updates: true, weekly_digest: true, new_assignments: true,
    };
    return res.json({ success: true, data: prefs });
  } catch (err) {
    console.error('[GET /auth/notification-preferences]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load preferences' });
  }
});

// ── PATCH /api/auth/notification-preferences ──────────────────────────────────
// S2: save notification prefs to DB so they sync across every device.
router.patch('/notification-preferences', protect, async (req, res) => {
  const { QueryTypes } = require('sequelize');
  const db = require('../config/database');
  const { email_updates, weekly_digest, new_assignments } = req.body;
  const prefs = {
    email_updates:   email_updates   !== undefined ? !!email_updates   : true,
    weekly_digest:   weekly_digest   !== undefined ? !!weekly_digest   : true,
    new_assignments: new_assignments !== undefined ? !!new_assignments : true,
  };
  try {
    await db.query(
      `UPDATE users SET notification_preferences = :prefs, updated_at = NOW() WHERE id = :id`,
      { replacements: { prefs: JSON.stringify(prefs), id: req.user.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, data: prefs, message: 'Preferences saved' });
  } catch (err) {
    console.error('[PATCH /auth/notification-preferences]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save preferences' });
  }
});


// PATCH /api/auth/email — change email address (requires password confirmation)
router.patch('/email', protect, async (req, res) => {
  const { QueryTypes } = require('sequelize');
  const db      = require('../config/database');
  const bcrypt  = require('bcryptjs');

  try {
    const { new_email, current_password } = req.body;
    if (!new_email || !current_password) {
      return res.status(400).json({ success: false, error: 'new_email and current_password are required' });
    }

    const normEmail = new_email.toLowerCase().trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(normEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    // Check not already taken
    const taken = await db.query(
      'SELECT id FROM users WHERE email = :email AND id != :id LIMIT 1',
      { replacements: { email: normEmail, id: req.user.id }, type: QueryTypes.SELECT }
    );
    if (taken.length) {
      return res.status(409).json({ success: false, error: 'That email address is already in use' });
    }

    // Verify current password
    const rows = await db.query(
      'SELECT password FROM users WHERE id = :id LIMIT 1',
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });

    const match = await bcrypt.compare(current_password, rows[0].password);
    if (!match) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

    await db.query(
      'UPDATE users SET email = :email, is_verified = false, updated_at = NOW() WHERE id = :id',
      { replacements: { email: normEmail, id: req.user.id }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true, message: 'Email updated successfully', email: normEmail });
  } catch (err) {
    console.error('[PATCH /auth/email]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update email' });
  }
});

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
// Called by the client every 12 minutes during long sessions (e.g. quiz timer).
// Issues a fresh access token (new JWT) so the 15-min TTL doesn't expire
// mid-session. protect middleware has already verified the current token and
// updated last_used_at; we just need to sign a new JWT with the same identity.
router.post('/heartbeat', protect, async (req, res) => {
  try {
    const tokenService = require('../services/tokenService');
    const pair = await tokenService.issueTokenPair({
      userId:     req.user.id,
      role:       req.user.role,
      rememberMe: false,        // short-lived is fine; we'll refresh again in 12 min
      deviceHint: req.headers['user-agent']?.slice(0, 64),
      ipAddress:  req.ip,
      userAgent:  req.headers['user-agent']?.slice(0, 255),
    });
    return res.json({ success: true, alive: true, token: pair.accessToken });
  } catch (err) {
    // Non-fatal — if token issuance fails, just return alive:true without
    // a new token; the existing token will expire naturally and the refresh
    // interceptor will handle it on the next real request.
    return res.json({ success: true, alive: true });
  }
});

// ── POST /api/auth/avatar — upload / replace profile photo ───────────────────
// Accepts a single image file (JPEG/PNG/WebP/GIF, max 5 MB).
// Saves it under server/uploads/avatars/<userId>.<ext> and updates
// users.avatar_url so the change is immediately reflected everywhere.
router.post('/avatar', protect, async (req, res) => {
  const { createUploadMiddleware } = require('../middleware/uploadSecurity');
  const path = require('path');
  const fs   = require('fs');
  const { QueryTypes } = require('sequelize');
  const db   = require('../config/database');

  const uploader = createUploadMiddleware({
    maxSizeMB:    5,
    allowedTypes: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    maxFiles:     1,
  });

  uploader.single('avatar')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided.' });
    }

    try {
      // Save to disk
      const avatarsDir = path.join(__dirname, '../uploads/avatars');
      if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

      const ext     = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const filename = `${req.user.id}${ext}`;
      const filepath = path.join(avatarsDir, filename);

      // Delete any previous avatar for this user (different extension)
      for (const e of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
        const old = path.join(avatarsDir, `${req.user.id}${e}`);
        if (old !== filepath && fs.existsSync(old)) fs.unlinkSync(old);
      }

      fs.writeFileSync(filepath, req.file.buffer);

      const avatarUrl = `/uploads/avatars/${filename}`;
      await db.query(
        `UPDATE users SET avatar_url = :avatarUrl, updated_at = NOW() WHERE id = :id`,
        { replacements: { avatarUrl, id: req.user.id }, type: QueryTypes.UPDATE }
      );

      return res.json({ success: true, avatar_url: avatarUrl });
    } catch (e) {
      console.error('[POST /auth/avatar]', e.message);
      return res.status(500).json({ success: false, error: 'Failed to save avatar.' });
    }
  });
});

module.exports = router;
