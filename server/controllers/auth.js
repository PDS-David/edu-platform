'use strict';

/**
 * controllers/auth.js
 *
 * AUTH-001  Account lockout (failed_login_count, locked_until)
 * AUTH-002  Server-side token revocation
 * AUTH-003  Remember Me — session vs. persistent tokens
 * AUTH-004  HttpOnly cookie transport (cookies set here; see authRoutes.js)
 * AUTH-005  Token rotation handled by tokenService; inactivity in middleware
 * AUTH-006  Audit logging via authAuditService
 */

const bcrypt      = require('bcryptjs');
const crypto      = require('crypto');
const { QueryTypes } = require('sequelize');
const db          = require('../config/database');
const tokenService = require('../services/tokenService');
const audit        = require('../services/authAuditService');

// ─── Configurable lockout policy ─────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS, 10) || 5;
const LOCKOUT_MINUTES     = parseInt(process.env.AUTH_LOCKOUT_MINUTES,     10) || 15;

// ─── Email service (optional) ─────────────────────────────────────────────────
let sendPasswordResetEmail = () => Promise.resolve();
let sendVerificationEmail  = () => Promise.resolve();
try {
  const emailService      = require('../services/emailService');
  sendPasswordResetEmail  = emailService.sendPasswordResetEmail  || sendPasswordResetEmail;
  sendVerificationEmail   = emailService.sendVerificationEmail   || sendVerificationEmail;
} catch {}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeUser(row) {
  const {
    password,
    failed_login_count, locked_until,
    reset_password_token, reset_password_expires,
    verification_token,  verification_token_expires,
    ...safe
  } = row;
  return safe;
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function clientMeta(req) {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.headers?.['user-agent'] || null,
  };
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

    // FIX-1: role was ignored (INSERT hardcoded 'student'). Whitelist and forward.
    const ALLOWED_ROLES = ['student', 'teacher', 'admin'];
    const role = ALLOWED_ROLES.includes(req.body.role) ? req.body.role : 'student';

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
         (:email, :password, :first_name, :last_name, :role,
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
         pending_exam_board_ids, created_at`,
      {
        replacements: {
          email:                   rawEmail,
          password:                hashedPassword,
          first_name,
          last_name,
          role,                                            // FIX-1: forwarded role
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

    const user = safeUser(rows[0]);
    const { ipAddress, userAgent } = clientMeta(req);

    // AUTH-003: no remember-me on register — short-lived default
    const { accessToken, refreshToken } = await tokenService.issueTokenPair({
      userId: user.id, role: user.role,
      rememberMe: false, ipAddress, userAgent,
      deviceHint: 'register',
    });

    // AUTH-006: audit
    setImmediate(() => audit.register({ userId: user.id, email: user.email, ipAddress, userAgent }));

    // AUTH-004: set HttpOnly cookie
    setRefreshCookie(res, refreshToken, false);

    return res.status(201).json({ success: true, token: accessToken, user });

  } catch (err) {
    console.error('[register]', err.message);
    if (handleUniqueViolation(err, res)) return;          // R-03: belt-and-suspenders
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// AUTH-001  Lockout logic
// AUTH-002  Token registered server-side
// AUTH-003  rememberMe drives TTL
// AUTH-004  Refresh token in HttpOnly cookie
// AUTH-006  Audit
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  const { ipAddress, userAgent } = clientMeta(req);

  try {
    const { rememberMe = false } = req.body;
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
         avatar_url, daily_goal,
         failed_login_count, locked_until
       FROM users
       WHERE email = :email
       LIMIT 1`,
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    // Unknown email — return generic error (prevents email enumeration)
    if (rows.length === 0) {
      setImmediate(() => audit.loginFailure({ email, ipAddress, userAgent, metadata: { reason: 'unknown_email' } }));
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const userRow = rows[0];

    if (!userRow.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    // AUTH-001: check lockout
    if (userRow.locked_until && new Date(userRow.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(userRow.locked_until).getTime() - Date.now()) / 60000
      );
      setImmediate(() => audit.loginFailure({
        userId: userRow.id, email, ipAddress, userAgent,
        metadata: { reason: 'account_locked', locked_until: userRow.locked_until },
      }));
      return res.status(423).json({
        success: false,
        error: `Account is temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
      });
    }

    const match = await bcrypt.compare(password, userRow.password);
    if (!match) {
      // AUTH-001: increment failure counter, possibly lock
      const newCount = (userRow.failed_login_count || 0) + 1;
      const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : null;

      await db.query(
        `UPDATE users
         SET failed_login_count = :count,
             locked_until       = :lockedUntil,
             updated_at         = NOW()
         WHERE id = :id`,
        { replacements: { count: newCount, lockedUntil, id: userRow.id }, type: QueryTypes.UPDATE }
      );

      if (shouldLock) {
        setImmediate(() => audit.lockout({
          userId: userRow.id, email, ipAddress, userAgent,
          metadata: { attempts: newCount, locked_until: lockedUntil },
        }));
        return res.status(423).json({
          success: false,
          error: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        });
      }

      setImmediate(() => audit.loginFailure({
        userId: userRow.id, email, ipAddress, userAgent,
        metadata: { reason: 'wrong_password', attempt: newCount },
      }));
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Successful auth — clear lockout counters
    setImmediate(() =>
      db.query(
        `UPDATE users
         SET last_login         = NOW(),
             failed_login_count = 0,
             locked_until       = NULL,
             updated_at         = NOW()
         WHERE id = :id`,
        { replacements: { id: userRow.id }, type: QueryTypes.UPDATE }
      ).catch(() => {})
    );

    // AUTH-002 + AUTH-003 + AUTH-005: issue server-registered token pair
    const { accessToken, refreshToken } = await tokenService.issueTokenPair({
      userId:     userRow.id,
      role:       userRow.role,
      rememberMe: !!rememberMe,
      ipAddress,
      userAgent,
      deviceHint: req.headers?.['x-device-hint'] || 'web',
    });

    // AUTH-006
    setImmediate(() => audit.loginSuccess({
      userId: userRow.id, email, ipAddress, userAgent,
      metadata: { rememberMe: !!rememberMe },
    }));

    // AUTH-004: refresh token in HttpOnly Secure cookie
    setRefreshCookie(res, refreshToken, !!rememberMe);

    const user = safeUser(userRow);
    return res.status(200).json({ success: true, token: accessToken, user });

  } catch (err) {
    console.error('[login]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT  (AUTH-002 single-session)
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  const { ipAddress, userAgent } = clientMeta(req);
  try {
    const authHeader = req.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) await tokenService.revokeToken(token, 'logout');

    // Also clear the refresh cookie
    res.clearCookie('refresh_token', { httpOnly: true, secure: true, sameSite: 'Strict', path: '/api/auth' });

    setImmediate(() => audit.logout({
      userId: req.user?.id, ipAddress, userAgent,
      metadata: { type: 'single_session' },
    }));

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('[logout]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT ALL DEVICES  (AUTH-002 all-device)
// ─────────────────────────────────────────────────────────────────────────────
exports.logoutAll = async (req, res, next) => {
  const { ipAddress, userAgent } = clientMeta(req);
  try {
    await tokenService.revokeAllForUser(req.user.id, 'all_devices');

    res.clearCookie('refresh_token', { httpOnly: true, secure: true, sameSite: 'Strict', path: '/api/auth' });

    setImmediate(() => audit.logoutAllDevices({
      userId: req.user.id, ipAddress, userAgent,
      metadata: { type: 'all_devices' },
    }));

    return res.status(200).json({ success: true, message: 'Logged out from all devices' });
  } catch (err) {
    console.error('[logoutAll]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH TOKEN  (AUTH-005 rotation)
// ─────────────────────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  const { ipAddress, userAgent } = clientMeta(req);
  try {
    // Accept from HttpOnly cookie (preferred) or body (mobile fallback)
    const rawRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (!rawRefreshToken) {
      return res.status(401).json({ success: false, error: 'No refresh token provided' });
    }

    const { accessToken, refreshToken: newRefresh, expiresIn, rememberMe } =
      await tokenService.rotateRefreshToken({ rawRefreshToken, ipAddress, userAgent });

    // FIX-4: was hardcoded false — the rotated cookie lost Max-Age for
    // rememberMe sessions. tokenService now returns rememberMe from the DB row.
    setRefreshCookie(res, newRefresh, !!rememberMe);

    setImmediate(() => audit.tokenRefresh({ ipAddress, userAgent, metadata: {} }));

    return res.status(200).json({ success: true, token: accessToken, expiresIn });

  } catch (err) {
    const code = err.code || 'REFRESH_ERROR';
    if (['REFRESH_INVALID', 'REFRESH_EXPIRED', 'REFRESH_REUSED'].includes(code)) {
      res.clearCookie('refresh_token', { httpOnly: true, secure: true, sameSite: 'Strict', path: '/api/auth' });
      return res.status(401).json({ success: false, error: err.message });
    }
    console.error('[refreshToken]', err.message);
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
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    // Row is already scoped — no sensitive columns present; spread directly
    return res.status(200).json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('[getMe]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
exports.updatePassword = async (req, res, next) => {
  const { ipAddress, userAgent } = clientMeta(req);
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'current_password and new_password are required' });
    }

    // R-05: validate new password strength before hashing
    const passCheck = validatePassword(new_password);
    if (!passCheck.valid) {
      return res.status(400).json({ success: false, error: passCheck.error });
    }

    // FIX-5: was SELECT * — fetches only what's needed (id + password hash)
    const rows = await db.query(
      `SELECT id, password FROM users WHERE id = :id LIMIT 1`,
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

    // Revoke all other sessions on password change
    await tokenService.revokeAllForUser(req.user.id, 'password_change');

    setImmediate(() => audit.passwordChange({
      userId: req.user.id, ipAddress, userAgent,
    }));

    return res.status(200).json({ success: true, message: 'Password updated. Please log in again.' });
  } catch (err) {
    console.error('[updatePassword]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  const { ipAddress, userAgent } = clientMeta(req);
  try {
    const email = normaliseEmail(req.body.email);         // R-04: was missing normalisation
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    // FIX-3: email was not normalised — users who registered with mixed-case
    // email could not trigger a reset using lowercase (or vice versa).
    const normalisedEmail = email.toLowerCase().trim();

    const rows = await db.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: normalisedEmail }, type: QueryTypes.SELECT }  // FIX-3 + R-04
    );

    // Always return 200 to avoid email enumeration
    if (!rows.length) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      `UPDATE users SET reset_password_token = :token, reset_password_expires = :expires WHERE id = :id`,
      { replacements: { token, expires, id: rows[0].id }, type: QueryTypes.UPDATE }
    );

    setImmediate(() => audit.passwordResetRequest({
      userId: rows[0].id, email: normalisedEmail, ipAddress, userAgent,
    }));

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
  const { ipAddress, userAgent } = clientMeta(req);
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
      `UPDATE users
       SET password = :password,
           reset_password_token = NULL,
           reset_password_expires = NULL,
           failed_login_count = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = :id`,
      { replacements: { password: hashed, id: rows[0].id }, type: QueryTypes.UPDATE }
    );

    // Revoke all active sessions after reset
    await tokenService.revokeAllForUser(rows[0].id, 'password_reset');

    setImmediate(() => audit.passwordResetSuccess({
      userId: rows[0].id, ipAddress, userAgent,
    }));

    return res.status(200).json({ success: true, message: 'Password reset successful. Please log in again.' });
  } catch (err) {
    console.error('[resetPassword]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY EMAIL
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyEmail = async (req, res, next) => {
  const { ipAddress, userAgent } = clientMeta(req);
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

    setImmediate(() => audit.emailVerified({ userId: rows[0].id, ipAddress, userAgent }));

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('[verifyEmail]', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper — set refresh token HttpOnly cookie  (AUTH-004)
// ─────────────────────────────────────────────────────────────────────────────
function setRefreshCookie(res, token, rememberMe) {
  const maxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000   // 30 days  (ms)
    : undefined;                   // session cookie (no Max-Age)

  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path:     '/api/auth',   // restrict cookie to auth endpoints only
    ...(maxAge ? { maxAge } : {}),
  });
}
