'use strict';

// controllers/auth.js
//
// Handles all authentication operations.
// Called by routes/authRoutes.js.
//
// Exports:
//   register        POST /api/auth/register
//   login           POST /api/auth/login
//   getMe           GET  /api/auth/me        (protected)
//   updatePassword  PUT  /api/auth/password  (protected)
//   forgotPassword  POST /api/auth/forgot-password
//   resetPassword   POST /api/auth/reset-password
//   verifyEmail     POST /api/auth/verify-email

const bcrypt     = require('bcryptjs');
const crypto     = require('crypto');
const { QueryTypes } = require('sequelize');
const db         = require('../config/database');
const { generateToken } = require('../utils/jwt');

// ── Email service (optional — graceful no-op if not installed) ────────────────
let sendPasswordResetEmail = () => Promise.resolve();
let sendVerificationEmail  = () => Promise.resolve();
try {
  const emailService        = require('../services/emailService');
  sendPasswordResetEmail    = emailService.sendPasswordResetEmail  || sendPasswordResetEmail;
  sendVerificationEmail     = emailService.sendVerificationEmail   || sendVerificationEmail;
} catch { /* emailService not available */ }

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the safe user object that is returned in every auth response. */
function safeUser(row) {
  const {
    password,
    reset_password_token, reset_password_expires,
    verification_token,   verification_token_expires,
    ...safe
  } = row;
  return safe;
}

/** Generate a cryptographically random hex token. */
function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// =============================================================================
// register
// POST /api/auth/register
// Body: { email, password, first_name, last_name, role? }
//
// Response shape (must match what authRoutes.js registerWithEmail reads):
//   { success: true, token, data: { user: { email, first_name, role, ... } } }
// =============================================================================
exports.register = async (req, res, next) => {
  try {
    const { email, password, role = 'student' } = req.body;
    // Accept both camelCase (frontend) and snake_case (API clients)
    const first_name = (req.body.first_name || req.body.firstName || '').trim();
    const last_name  = (req.body.last_name  || req.body.lastName  || first_name).trim();
    // Exam board IDs selected during registration (stored as pending until onboarding)
    const pendingExamBoards = req.body.pendingExamBoards || req.body.pending_exam_boards || [];

    // ── Validation ────────────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    // Block admin self-registration
    if (email.toLowerCase().trim() === 'admin@aischoolonair.com') {
      return res.status(403).json({ success: false, error: 'This email address cannot be used for registration.' });
    }

    const allowedRoles = ['student', 'teacher'];
    const assignedRole = allowedRoles.includes(role) ? role : 'student';

    // ── Duplicate check ───────────────────────────────────────────────────────
    const existing = await db.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: email.toLowerCase().trim() }, type: QueryTypes.SELECT }
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists' });
    }

    // ── Hash password ─────────────────────────────────────────────────────────
    const salt           = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ── Verification token ────────────────────────────────────────────────────
    const verificationToken        = randomToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

    // ── Insert user ───────────────────────────────────────────────────────────
    // pendingExamBoards contains exam_board IDs (UUIDs) chosen during registration.
    // Stored as pending_exam_board_ids so OnboardingPage can filter subjects by board.
    const pendingIds = Array.isArray(pendingExamBoards) && pendingExamBoards.length > 0
      ? pendingExamBoards
      : [];

    const rows = await db.query(
      `INSERT INTO users
         (email, password, first_name, last_name, role,
          verification_token, verification_token_expires,
          is_active, is_verified, subscription_status,
          subscription_expires_at,
          pending_exam_board_ids,
          created_at, updated_at)
       VALUES
         (:email, :password, :first_name, :last_name, :role,
          :verificationToken, :verificationTokenExpires,
          true, false, 'free_trial',
          NOW() + INTERVAL '14 days',
          :pendingIds::uuid[],
          NOW(), NOW())
       RETURNING
         id, email, first_name, last_name, role,
         is_active, is_verified, subscription_status,
         onboarding_complete, xp_points, study_streak_days,
         pending_exam_board_ids,
         created_at`,
      {
        replacements: {
          email:                    email.toLowerCase().trim(),
          password:                 hashedPassword,
          first_name:               first_name.trim(),
          last_name:                last_name.trim(),
          role:                     assignedRole,
          verificationToken,
          verificationTokenExpires,
          pendingIds:               pendingIds.length > 0 ? `{${pendingIds.join(',')}}` : '{}',
        },
        type: QueryTypes.SELECT,
      }
    );

    const user  = rows[0];
    const token = generateToken({ id: user.id, role: user.role });

    // Send verification email non-blocking (fire and forget)
    setImmediate(() =>
      sendVerificationEmail({
        email:      user.email,
        first_name: user.first_name,
        token:      verificationToken,
      }).catch(() => {})
    );

    return res.status(201).json({
      success: true,
      token,
      data: { user: safeUser(user) },
    });
  } catch (err) {
    console.error('[register]', err.message);
    next(err);
  }
};

// =============================================================================
// login
// POST /api/auth/login
// Body: { email, password }
//
// Response shape (must match what authRoutes.js loginWithSubscription reads):
//   { success: true, token, data: { user: { id, ..., subscription_status? } } }
// =============================================================================
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Fetch user WITH password (excluded by default scope)
    const rows = await db.query(
      `SELECT
         id, email, password, first_name, last_name, role,
         is_active, is_verified, subscription_status, subscription_expires_at,
         onboarding_complete, xp_points, study_streak_days, last_login,
         avatar_url, daily_goal
       FROM users
       WHERE email = :email
       LIMIT 1`,
      { replacements: { email: email.toLowerCase().trim() }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      // Return same message for both "not found" and "wrong password" to prevent
      // user enumeration attacks
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated. Please contact support.' });
    }

    // ── Verify password ───────────────────────────────────────────────────────
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // ── Update last_login (non-blocking) ──────────────────────────────────────
    setImmediate(() =>
      db.query(
        `UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = :id`,
        { replacements: { id: user.id }, type: QueryTypes.UPDATE }
      ).catch(() => {})
    );

    const token = generateToken({ id: user.id, role: user.role });

    return res.status(200).json({
      success: true,
      token,
      data: { user: safeUser(user) },
    });
  } catch (err) {
    console.error('[login]', err.message);
    next(err);
  }
};

// =============================================================================
// getMe
// GET /api/auth/me  (protected — req.user already set by middleware)
// =============================================================================
exports.getMe = async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT
         id, email, first_name, last_name, role,
         is_active, is_verified, subscription_status, subscription_expires_at,
         onboarding_complete, xp_points, study_streak_days, last_login,
         avatar_url, phone, country, daily_goal,
         preferred_study_days, preferred_study_time,
         pending_exam_board_ids,
         created_at, updated_at
       FROM users
       WHERE id = :id
       LIMIT 1`,
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.status(200).json({ success: true, data: { user: rows[0] } });
  } catch (err) {
    console.error('[getMe]', err.message);
    next(err);
  }
};

// =============================================================================
// updatePassword
// PUT /api/auth/password  (protected)
// Body: { current_password, new_password }
// =============================================================================
exports.updatePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'current_password and new_password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }

    // Fetch current hash
    const rows = await db.query(
      `SELECT id, password FROM users WHERE id = :id LIMIT 1`,
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const match = await bcrypt.compare(current_password, rows[0].password);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const salt        = await bcrypt.genSalt(12);
    const newHash     = await bcrypt.hash(new_password, salt);

    await db.query(
      `UPDATE users SET password = :password, updated_at = NOW() WHERE id = :id`,
      { replacements: { password: newHash, id: req.user.id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[updatePassword]', err.message);
    next(err);
  }
};

// =============================================================================
// forgotPassword
// POST /api/auth/forgot-password
// Body: { email }
//
// Always returns 200 to prevent user enumeration.
// =============================================================================
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const rows = await db.query(
      `SELECT id, email, first_name FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: email.toLowerCase().trim() }, type: QueryTypes.SELECT }
    );

    // Respond 200 regardless — don't reveal whether the email exists
    if (rows.length === 0) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const user    = rows[0];
    const token   = randomToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query(
      `UPDATE users
         SET reset_password_token = :token, reset_password_expires = :expires, updated_at = NOW()
       WHERE id = :id`,
      { replacements: { token, expires, id: user.id }, type: QueryTypes.UPDATE }
    );

    setImmediate(() =>
      sendPasswordResetEmail({
        email:      user.email,
        first_name: user.first_name,
        token,
      }).catch(() => {})
    );

    return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[forgotPassword]', err.message);
    next(err);
  }
};

// =============================================================================
// resetPassword
// POST /api/auth/reset-password
// Body: { token, new_password }
// =============================================================================
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({ success: false, error: 'token and new_password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const rows = await db.query(
      `SELECT id FROM users
       WHERE reset_password_token = :token
         AND reset_password_expires > NOW()
       LIMIT 1`,
      { replacements: { token }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Reset token is invalid or has expired' });
    }

    const salt    = await bcrypt.genSalt(12);
    const hashed  = await bcrypt.hash(new_password, salt);

    await db.query(
      `UPDATE users
         SET password               = :password,
             reset_password_token   = NULL,
             reset_password_expires = NULL,
             updated_at             = NOW()
       WHERE id = :id`,
      { replacements: { password: hashed, id: rows[0].id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('[resetPassword]', err.message);
    next(err);
  }
};

// =============================================================================
// verifyEmail
// POST /api/auth/verify-email
// Body: { token }
// =============================================================================
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Verification token is required' });
    }

    const rows = await db.query(
      `SELECT id FROM users
       WHERE verification_token = :token
         AND verification_token_expires > NOW()
         AND is_verified = false
       LIMIT 1`,
      { replacements: { token }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Verification token is invalid or has expired' });
    }

    await db.query(
      `UPDATE users
         SET is_verified                = true,
             verification_token         = NULL,
             verification_token_expires = NULL,
             updated_at                 = NOW()
       WHERE id = :id`,
      { replacements: { id: rows[0].id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    console.error('[verifyEmail]', err.message);
    next(err);
  }
};
