'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// server/controllers/auth.js
//
// Fixes applied in this revision:
//   R-01  Phone number is now destructured from req.body, validated (E.164),
//         normalised (+digits), and persisted in the INSERT.
//   R-03  Registration uses INSERT … ON CONFLICT (email) DO NOTHING to
//         eliminate the TOCTOU race window.  Postgres error code 23505 is
//         caught and translated to 409 everywhere raw SQL is used.
//   R-04  All email paths now call normaliseEmail() before any DB operation.
//         forgotPassword previously skipped normalisation — fixed.
//   R-05  Password validation delegates to validatePassword() which enforces
//         min 8 chars + at least one letter + at least one digit + max 128.
//         updatePassword applies the same rules for the new password.
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt           = require('bcryptjs');
const crypto           = require('crypto');
const { QueryTypes }   = require('sequelize');
const db               = require('../config/database');
const { generateToken } = require('../utils/jwt');
const {
  normaliseEmail,
  validateEmail,
  validatePassword,
  normalisePhone,
  validatePhone,
  normaliseName,
  validateName,
  sanitisePendingExamBoards,
} = require('../utils/registrationValidators');

// ── Email service (optional — safe no-op if not installed) ───────────────────
const audit      = require('../services/auditLogger');

let sendPasswordResetEmail = () => Promise.resolve();
let sendVerificationEmail  = () => Promise.resolve();
try {
  const emailService        = require('../services/emailService');
  sendPasswordResetEmail    = emailService.sendPasswordResetEmail  || sendPasswordResetEmail;
  sendVerificationEmail     = emailService.sendVerificationEmail   || sendVerificationEmail;
} catch {}

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeUser(row) {
  const {
    password,
    reset_password_token, reset_password_expires,
    verification_token,   verification_token_expires,
    ...safe
  } = row;
  return safe;
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Translate a Postgres unique-violation (23505) into a clean 409 response.
 * Returns true if the error was handled, false otherwise.
 */
function handleUniqueViolation(err, res) {
  if (err.parent?.code === '23505' || err.original?.code === '23505' || err.message?.includes('23505')) {
    res.status(409).json({ success: false, error: 'An account with that email already exists' });
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    // ── 1. Extract & normalise ─────────────────────────────────────────────
    const rawEmail    = normaliseEmail(req.body.email);
    const password    = req.body.password;
    const first_name  = normaliseName(req.body.first_name || req.body.firstName || '');
    const last_name   = normaliseName(req.body.last_name  || req.body.lastName  || first_name);
    const rawPhone    = req.body.phone;                    // R-01: read phone
    const pendingExamBoards = sanitisePendingExamBoards(req.body.pendingExamBoards);

    // ── 2. Validate ────────────────────────────────────────────────────────
    const emailCheck = validateEmail(rawEmail);
    if (!emailCheck.valid) {
      return res.status(400).json({ success: false, error: emailCheck.error });
    }

    const passCheck = validatePassword(password);          // R-05
    if (!passCheck.valid) {
      return res.status(400).json({ success: false, error: passCheck.error });
    }

    // Phone is required on the frontend — validate & normalise (R-01)
    const phoneCheck = validatePhone(rawPhone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ success: false, error: phoneCheck.error });
    }
    const phone = normalisePhone(rawPhone);                // "+<digits>"

    const fnCheck = validateName(first_name, 'First name');
    if (!fnCheck.valid) {
      return res.status(400).json({ success: false, error: fnCheck.error });
    }

    // ── 3. Hash password ───────────────────────────────────────────────────
    const salt           = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const verificationToken        = randomToken();
    const verificationTokenExpires = new Date(Date.now() + 86400000); // 24 h

    // ── 4. INSERT … ON CONFLICT — eliminates TOCTOU race window (R-03) ────
    //
    // ON CONFLICT (email) DO NOTHING returns 0 rows when the email already
    // exists.  We check for that and return 409 cleanly without leaking any
    // Postgres error detail.  The unique index on users.email ensures the
    // second concurrent INSERT also gets 0 rows rather than a constraint
    // error (or, if both hit simultaneously, the loser gets the 23505 error
    // which is caught below and translated to 409 as a belt-and-suspenders).
    const rows = await db.query(
      `INSERT INTO users
         (email, password, first_name, last_name, role,
          phone,
          verification_token, verification_token_expires,
          is_active, is_verified, subscription_status,
          subscription_expires_at,
          pending_exam_board_ids,
          created_at, updated_at)
       VALUES
         (:email, :password, :first_name, :last_name, 'student',
          :phone,
          :verificationToken, :verificationTokenExpires,
          true, false, 'free_trial',
          NOW() + INTERVAL '14 days',
          :pendingIds::integer[],
          NOW(), NOW())
       ON CONFLICT (email) DO NOTHING
       RETURNING
         id, email, first_name, last_name, role, phone,
         is_active, is_verified, subscription_status,
         onboarding_complete, xp_points, study_streak_days,
         pending_exam_board_ids,
         created_at`,
      {
        replacements: {
          email:                   rawEmail,
          password:                hashedPassword,
          first_name,
          last_name,
          phone,                                           // R-01
          verificationToken,
          verificationTokenExpires,
          pendingIds: pendingExamBoards.length
            ? `{${pendingExamBoards.join(',')}}`
            : '{}',
        },
        type: QueryTypes.SELECT,
      }
    );

    // 0 rows ⟹ email already existed — ON CONFLICT suppressed the insert
    if (!rows || rows.length === 0) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists' });
    }

    const user  = safeUser(rows[0]);
    const token = generateToken({ id: user.id, role: user.role });

    // Fire verification email (non-blocking — does not delay the response)
    setImmediate(() =>
      sendVerificationEmail({
        email:      user.email,
        first_name: user.first_name,
        token:      verificationToken,
      }).catch(() => {})
    );

    return res.status(201).json({ success: true, token, user });

  } catch (err) {
    console.error('[register]', err.message);
    if (handleUniqueViolation(err, res)) return;          // R-03: belt-and-suspenders
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const email    = normaliseEmail(req.body.email);      // R-04
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const rows = await db.query(
      `SELECT
         id, email, password, first_name, last_name, role,
         is_active, is_verified, subscription_status,
         subscription_expires_at, onboarding_complete,
         xp_points, study_streak_days, last_login,
         avatar_url, daily_goal
       FROM users
       WHERE email = :email
       LIMIT 1`,
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
        severity: 'warning',
        metadata: { email: email.toLowerCase().trim(), reason: 'user_not_found' },
      });
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const userRow = rows[0];

    if (!userRow.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    const match = await bcrypt.compare(password, userRow.password);
    if (!match) {
      await audit.log(req, audit.ACTIONS.LOGIN_FAILED, {
        severity: 'warning',
        actorId: userRow.id, actorEmail: userRow.email, actorRole: userRow.role,
        metadata: { email: userRow.email, reason: 'wrong_password' },
      });
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    setImmediate(() =>
      db.query(
        `UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = :id`,
        { replacements: { id: userRow.id }, type: QueryTypes.UPDATE }
      ).catch(() => {})
    );

    const token = generateToken({ id: userRow.id, role: userRow.role });
    const user = safeUser(userRow);

    // Audit successful login (setImmediate so it doesn't delay response)
    setImmediate(() =>
      audit.log(req, audit.ACTIONS.LOGIN, {
        actorId: userRow.id, actorEmail: userRow.email, actorRole: userRow.role,
        metadata: { role: userRow.role },
      }).catch(() => {})
    );

    return res.status(200).json({
      success: true,
      token,
      user
    });

  } catch (err) {
    console.error('[login]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ME
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, email, first_name, last_name, role, avatar_url,
              phone, subscription_status, subscription_expires_at,
              is_verified, onboarding_complete, xp_points,
              study_streak_days, daily_goal, last_login,
              created_at, updated_at
       FROM users WHERE id = :id LIMIT 1`,
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.status(200).json({ success: true, user: safeUser(rows[0]) });

  } catch (err) {
    console.error('[getMe]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
exports.updatePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'current_password and new_password are required' });
    }

    // R-05: apply same policy to new password
    const passCheck = validatePassword(new_password);
    if (!passCheck.valid) {
      return res.status(400).json({ success: false, error: passCheck.error });
    }

    const rows = await db.query(
      `SELECT * FROM users WHERE id = :id LIMIT 1`,
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });

    const match = await bcrypt.compare(current_password, rows[0].password);
    if (!match) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

    const salt   = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(new_password, salt);

    await db.query(
      `UPDATE users SET password = :password, updated_at = NOW() WHERE id = :id`,
      { replacements: { password: hashed, id: req.user.id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('[updatePassword]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const email = normaliseEmail(req.body.email);         // R-04: was missing normalisation
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const rows = await db.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email }, type: QueryTypes.SELECT }  // R-04: now uses normalised value
    );

    // Always return 200 to avoid email enumeration
    if (!rows.length) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query(
      `UPDATE users SET reset_password_token = :token, reset_password_expires = :expires WHERE id = :id`,
      { replacements: { token, expires, id: rows[0].id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[forgotPassword]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ success: false, error: 'token and new_password are required' });
    }

    // R-05: apply complexity rules on reset too
    const passCheck = validatePassword(new_password);
    if (!passCheck.valid) {
      return res.status(400).json({ success: false, error: passCheck.error });
    }

    const rows = await db.query(
      `SELECT id FROM users WHERE reset_password_token = :token AND reset_password_expires > NOW() LIMIT 1`,
      { replacements: { token }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(400).json({ success: false, error: 'Token is invalid or has expired' });

    const salt   = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(new_password, salt);

    await db.query(
      `UPDATE users SET password = :password, reset_password_token = NULL, reset_password_expires = NULL, updated_at = NOW() WHERE id = :id`,
      { replacements: { password: hashed, id: rows[0].id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    console.error('[resetPassword]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY EMAIL
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Verification token is required' });

    const rows = await db.query(
      `SELECT id FROM users WHERE verification_token = :token AND verification_token_expires > NOW() LIMIT 1`,
      { replacements: { token }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(400).json({ success: false, error: 'Token is invalid or has expired' });

    await db.query(
      `UPDATE users SET is_verified = TRUE, verification_token = NULL, verification_token_expires = NULL, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: rows[0].id }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('[verifyEmail]', err.message);
    next(err);
  }
};
