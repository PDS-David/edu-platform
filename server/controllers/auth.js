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
const jwt         = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');
const db          = require('../config/database');
const tokenService = require('../services/tokenService');
const audit        = require('../services/authAuditService');
// BUG FIX (phone-registration-nigeria-only): this file used to define its own
// local normalisePhone() that assumed any number starting with '0' must be
// Nigerian and rewrote it to +234 — silently corrupting any other country's
// local-format number (many countries use the same leading-0 domestic
// dialing convention, e.g. UK, India, South Africa, Kenya...). In practice
// this specific branch was rarely hit via the registration form itself
// (RegisterPage.jsx always prepends a real dial code first), but it was a
// landmine for any other caller, and simply wrong regardless. Use the
// existing correct, country-agnostic implementation (strip digits, prepend
// '+', no country assumptions) instead of maintaining a second, buggy copy.
const { normalisePhone } = require('../utils/registrationValidators');

// ─── Configurable lockout policy ─────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS, 10) || 5;
const LOCKOUT_MINUTES     = parseInt(process.env.AUTH_LOCKOUT_MINUTES,     10) || 15;


// ─── Input normalisation & validation helpers ─────────────────────────────────

function normaliseEmail(raw) {
  return (raw || '').toLowerCase().trim();
}

function normaliseName(raw) {
  return (raw || '').trim();
}

function sanitisePendingExamBoards(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(id => Number.isInteger(Number(id))).map(Number);
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) ? { valid: true } : { valid: false, error: 'Invalid email address' };
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  return { valid: true };
}

function validateName(name, label = 'Name') {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: `${label} is required` };
  }
  return { valid: true };
}

function validatePhone(raw) {
  if (!raw) return { valid: true };
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { valid: false, error: 'Invalid phone number' };
  }
  return { valid: true };
}

// ─── Email service (optional) ─────────────────────────────────────────────────
let sendPasswordResetEmail = () => Promise.resolve();
let sendVerificationEmail  = () => Promise.resolve();
try {
  const emailService      = require('../services/emailService');
  sendPasswordResetEmail  = emailService.sendPasswordResetEmail  || sendPasswordResetEmail;
  sendVerificationEmail   = emailService.sendVerificationEmail   || sendVerificationEmail;
} catch {}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Async because it needs one extra query to attach registeredLanguages —
// every existing call site below is already inside an async handler and
// already awaits other queries, so this doesn't change call-site shape
// beyond adding `await`. Centralized here (rather than repeating the query
// at all 5 call sites) so every response that returns a user object —
// login, register, getMe, refresh — stays consistent by construction.
async function safeUser(row) {
  const {
    password,
    failed_login_count, locked_until,
    reset_password_token, reset_password_expires,
    verification_token,  verification_token_expires,
    ...safe
  } = row;
  try {
    const regs = await db.query(
      `SELECT language FROM user_language_registrations WHERE user_id = :id`,
      { replacements: { id: row.id }, type: QueryTypes.SELECT }
    );
    safe.registeredLanguages = regs.map((r) => r.language);
  } catch {
    safe.registeredLanguages = [];
  }
  // Single access gate for standalone users -- see middleware/auth.js for
  // the identical computation on req.user. Registering for any ONE
  // language unlocks all 8, per Da's confirmed decision, so this is just
  // "has at least one row," not language-specific.
  safe.hasLanguageMasterclass = safe.registeredLanguages.length > 0;
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
    // BUG FIX (phone-registration-country-not-captured): the country picker
    // next to the phone field was only ever used to prefix the dial code —
    // the actual country choice was discarded, even though users.country
    // already exists as a column (populated only via the later profile-
    // update route, never at registration). Capture it here too.
    const country     = (req.body.country || '').trim().slice(0, 100) || null;
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
          phone, country,
          verification_token, verification_token_expires,
          is_active, is_verified, subscription_status,
          subscription_expires_at,
          pending_exam_board_ids,
          created_at, updated_at)
       VALUES
         (:email, :password, :first_name, :last_name, 'student',
          :phone, :country,
          :verificationToken, :verificationTokenExpires,
          true, false, 'free_trial',
          NOW() + INTERVAL '14 days',
          :pendingIds::integer[],
          NOW(), NOW())
       ON CONFLICT (email) DO NOTHING
       RETURNING
         id, email, first_name, last_name, role, phone, country,
         is_active, is_verified, subscription_status,
         onboarding_complete, xp_points, study_streak_days,
         pending_exam_board_ids, created_at`,
      {
        replacements: {
          email:                   rawEmail,
          password:                hashedPassword,
          first_name,
          last_name,
          phone,                                           // R-01
          country,
          verificationToken,
          verificationTokenExpires,
          pendingIds: pendingExamBoards.length
            ? `{${pendingExamBoards.join(',')}}`
            : '{}',
        },
        type: QueryTypes.SELECT,
      }
    );

    const user = await safeUser(rows[0]);
    const { ipAddress, userAgent } = clientMeta(req);

    // AUTH-003: no remember-me on register — short-lived default
    const { accessToken, refreshToken, expiresIn } = await tokenService.issueTokenPair({
      userId: user.id, role: user.role,
      rememberMe: false, ipAddress, userAgent,
      deviceHint: 'register',
    });

    // AUTH-006: audit
    setImmediate(() => audit.register({ userId: user.id, email: user.email, ipAddress, userAgent }));

    // BUG FIX (verification-email-never-sent): verificationToken was
    // generated and correctly stored on the user row above, but the actual
    // email that delivers the link to the user was never sent — sendVerificationEmail
    // was imported but never called anywhere in this file. That meant no
    // user who registered ever received a verification email at all, so
    // even after fixing the link-handling bug on the frontend
    // (VerifyEmailPage.jsx), there was never anything for them to click.
    // Fire-and-forget, same pattern as the audit call above — a slow or
    // failing email provider must never block or fail registration itself.
    setImmediate(() => {
      sendVerificationEmail({ email: user.email, first_name: user.first_name, token: verificationToken })
        .catch(err => console.error('[register] verification email failed:', err.message));
    });

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
// REGISTER — English Masterclass (standalone pathway)
//
// Deliberately NOT "register for AISchoolonair, then add EM on top." This
// creates an account and grants EM access in the same step — no dependency
// on already having (or being sent to create) an AISchoolonair account.
// Shares the `users` table as an implementation detail only; nothing in
// this flow requires, checks, or references AISchoolonair registration.
// ─────────────────────────────────────────────────────────────────────────────
exports.registerForEnglishMasterclass = async (req, res, next) => {
  try {
    const rawEmail   = normaliseEmail(req.body.email);
    const password   = req.body.password;
    const first_name = normaliseName(req.body.first_name || req.body.firstName || '');
    const last_name  = normaliseName(req.body.last_name  || req.body.lastName  || first_name);

    const emailCheck = validateEmail(rawEmail);
    if (!emailCheck.valid) {
      return res.status(400).json({ success: false, error: emailCheck.error });
    }
    const passCheck = validatePassword(password);
    if (!passCheck.valid) {
      return res.status(400).json({ success: false, error: passCheck.error });
    }
    const fnCheck = validateName(first_name, 'First name');
    if (!fnCheck.valid) {
      return res.status(400).json({ success: false, error: fnCheck.error });
    }

    // Optional school affiliation at signup — lets a tenant school's student
    // get English Masterclass access tied to their school from the start,
    // instead of only via an AISchoolonair account that separately joined a
    // school. Same join_code a school hands out for AISchoolonair works here
    // too, since it's the same schools table either way. If a code is
    // provided but doesn't resolve, this is a clear 400 rather than a silent
    // "registered anyway with no school" — someone who typed a code on
    // purpose would want to know it didn't work, not find out later.
    let schoolId = null;
    let resolvedSchool = null;
    const rawJoinCode = (req.body.join_code || '').trim().toUpperCase();
    if (rawJoinCode) {
      const schoolRows = await db.query(
        `SELECT id, name, logo_url, enable_em, enable_aischoolonair FROM schools WHERE join_code = :code AND is_active = true`,
        { replacements: { code: rawJoinCode }, type: QueryTypes.SELECT }
      );
      if (!schoolRows.length) {
        return res.status(400).json({ success: false, error: 'That school join code was not recognised.' });
      }
      // Distinct from "not recognised" on purpose: the code is real, but this
      // school registered for AISchoolonair only, not English Masterclass.
      // Telling them their school doesn't offer EM is more useful (and less
      // confusing) than pretending the code doesn't exist.
      if (!schoolRows[0].enable_em) {
        return res.status(400).json({
          success: false,
          error: `${schoolRows[0].name} has not been registered for English Masterclass. Contact your school admin or App Admin.`,
        });
      }
      schoolId = schoolRows[0].id;
      resolvedSchool = schoolRows[0];
    }

    const salt           = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verificationToken        = randomToken();
    const verificationTokenExpires = new Date(Date.now() + 86400000);

    // Same ON CONFLICT DO NOTHING pattern as /register (R-03) — no phone
    // required (EM has no phone-based flows), em_registered_at set to NOW()
    // in the same INSERT so registering IS the EM registration, in one step.
    const rows = await db.query(
      `INSERT INTO users
         (email, password, first_name, last_name, role,
          verification_token, verification_token_expires,
          is_active, is_verified, subscription_status,
          em_registered_at, school_id,
          created_at, updated_at)
       VALUES
         (:email, :password, :first_name, :last_name, 'student',
          :verificationToken, :verificationTokenExpires,
          true, false, 'free_trial',
          NOW(), :schoolId,
          NOW(), NOW())
       ON CONFLICT (email) DO NOTHING
       RETURNING
         id, email, first_name, last_name, role,
         is_active, is_verified, subscription_status,
         onboarding_complete, xp_points, study_streak_days,
         em_registered_at, school_id, created_at`,
      {
        replacements: {
          email: rawEmail, password: hashedPassword, first_name, last_name,
          verificationToken, verificationTokenExpires, schoolId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (!rows.length) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists' });
    }

    // Dual-write into the 8-language join table so this standalone student's
    // English Masterclass registration also unlocks the other 7 languages,
    // via req.user.hasLanguageMasterclass (>0 rows here), the same way a
    // standalone user registering for any other language does. Without
    // this, a brand-new EM signup would be a former/current English
    // Masterclass student who is nonetheless blocked from every other
    // language until they separately register again -- exactly the gap Da
    // flagged. Must happen before safeUser() below, which reads this same
    // table to compute hasLanguageMasterclass for the response.
    try {
      await db.query(
        `INSERT INTO user_language_registrations (user_id, language, registered_at)
         SELECT id, 'english', em_registered_at FROM users WHERE id = :id
         ON CONFLICT (user_id, language) DO NOTHING`,
        { replacements: { id: rows[0].id } }
      );
    } catch (langRegErr) {
      console.error('[EM signup] user_language_registrations dual-write failed:', langRegErr.message);
    }

    const user = await safeUser(rows[0]);
    if (resolvedSchool) {
      let enabledLanguages = [];
      try {
        const langRows = await db.query(
          `SELECT language FROM school_enabled_languages WHERE school_id = :id`,
          { replacements: { id: resolvedSchool.id }, type: QueryTypes.SELECT }
        );
        enabledLanguages = langRows.map((r) => r.language);
      } catch { /* fail open, matches login/getMe's equivalent block */ }
      user.school = { id: resolvedSchool.id, name: resolvedSchool.name, logo_url: resolvedSchool.logo_url, enable_aischoolonair: resolvedSchool.enable_aischoolonair, enable_em: resolvedSchool.enable_em, enabledLanguages, hasLanguageMasterclass: !!resolvedSchool.enable_em };
    }
    const { ipAddress, userAgent } = clientMeta(req);

    const { accessToken, refreshToken } = await tokenService.issueTokenPair({
      userId: user.id, role: user.role,
      rememberMe: false, ipAddress, userAgent,
      deviceHint: 'em-register',
    });

    setImmediate(() => audit.register({ userId: user.id, email: user.email, ipAddress, userAgent }));

    // Same fix as exports.register — the token was generated and stored
    // correctly above but was never actually emailed.
    setImmediate(() => {
      sendVerificationEmail({ email: user.email, first_name: user.first_name, token: verificationToken })
        .catch(err => console.error('[registerForEnglishMasterclass] verification email failed:', err.message));
    });

    setRefreshCookie(res, refreshToken, false);

    return res.status(201).json({ success: true, token: accessToken, user });

  } catch (err) {
    console.error('[registerForEnglishMasterclass]', err.message);
    if (handleUniqueViolation(err, res)) return;
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
    const { password, rememberMe = false } = req.body;
    const email = normaliseEmail(req.body.email);         // FIX-3 normalise on login too

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const rows = await db.query(
      `SELECT
         id, email, password, first_name, last_name, role, school_id,
         is_active, is_verified, subscription_status,
         subscription_expires_at, onboarding_complete,
         xp_points, study_streak_days, last_login,
         avatar_url, daily_goal, em_registered_at,
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

    // ── Tenant-school "closed door" gate — enforced at the login boundary ──
    // Credentials being correct is not enough for a tenant-school account:
    // their school must have been granted AT LEAST ONE learning product
    // (AISchoolonair and/or English Masterclass) to log in at all. This is
    // checked here, BEFORE a token is ever issued, so a school with neither
    // product enabled sees a clear, immediate rejection right at the login
    // screen — not a successful login followed by a confusing 403 once
    // they're already inside a dashboard.
    //
    // This USED to be a portal-specific check (the landing page had two
    // separate login forms — /login sent portal='aischoolonair', /em/login
    // sent portal='em' — and each required ONLY that one product to be
    // enabled). There is now a single login for everyone: which product(s)
    // an account can actually use is decided AFTER authenticating, by
    // getPostAuthRedirect() on the client (straight to the one enabled
    // product, or a chooser screen if the school has granted both) — not by
    // which login form a visitor happened to use. So the gate here only
    // needs to reject a school with NEITHER product enabled; it no longer
    // cares which one specifically was intended.
    //
    // school_admin is fully exempt, regardless of product flags — same
    // principle as the /api/schools exemption in middleware/auth.js and the
    // client-side route guards (PrivateRoute, EMPrivateRoute): they manage
    // their school's roster/settings/reports regardless of which content
    // product is toggled on.
    let school = null;
    if (userRow.school_id) {
      const schoolRows = await db.query(
        `SELECT id, name, logo_url, is_active, enable_aischoolonair, enable_em FROM schools WHERE id = :id LIMIT 1`,
        { replacements: { id: userRow.school_id }, type: QueryTypes.SELECT }
      );
      school = schoolRows[0] || null;

      if (!school || !school.is_active) {
        setImmediate(() => audit.loginFailure({
          userId: userRow.id, email, ipAddress, userAgent,
          metadata: { reason: 'school_inactive' },
        }));
        return res.status(403).json({
          success: false,
          error: 'Your school account is currently inactive. Contact your school admin.',
        });
      }

      if (['student', 'teacher'].includes(userRow.role) && !school.enable_aischoolonair && !school.enable_em) {
        setImmediate(() => audit.loginFailure({
          userId: userRow.id, email, ipAddress, userAgent,
          metadata: { reason: 'no_service_enabled' },
        }));
        return res.status(403).json({
          success: false,
          error: 'Your school has not been registered for any learning platform yet. Contact your school admin or App Admin.',
        });
      }
    }

    // AUTH-002 + AUTH-003 + AUTH-005: issue server-registered token pair
    const { accessToken, refreshToken, expiresIn } = await tokenService.issueTokenPair({
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

    const user = await safeUser(userRow);
    // Surfaced to the client so route guards (e.g. EMPrivateRoute) can show
    // their own closed door immediately on navigation — not just at the
    // login form — without a second round trip. Only present for tenant
    // accounts; omitted (undefined) for standalone users and App Admin.
    if (school) {
      let enabledLanguages = [];
      try {
        const langRows = await db.query(
          `SELECT language FROM school_enabled_languages WHERE school_id = :id`,
          { replacements: { id: school.id }, type: QueryTypes.SELECT }
        );
        enabledLanguages = langRows.map((r) => r.language);
      } catch { /* fail open, same as protect middleware's equivalent block */ }
      user.school = { id: school.id, name: school.name, logo_url: school.logo_url, enable_aischoolonair: school.enable_aischoolonair, enable_em: school.enable_em, enabledLanguages, hasLanguageMasterclass: !!school.enable_em };
    }
    // registeredLanguages: mirrors what `protect` attaches to req.user on
    // every subsequent request — populated here too so it's present from
    // the very first response after login, not just after the next /me call.
    try {
      const regRows = await db.query(
        `SELECT language FROM user_language_registrations WHERE user_id = :id`,
        { replacements: { id: userRow.id }, type: QueryTypes.SELECT }
      );
      user.registeredLanguages = regRows.map((r) => r.language);
    } catch {
      user.registeredLanguages = [];
    }
    // Single access gate for standalone users, same reasoning as safeUser's
    // computation -- recomputed here (rather than trusting safeUser's
    // earlier value) since registeredLanguages was just re-fetched above.
    user.hasLanguageMasterclass = user.registeredLanguages.length > 0;
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

    // The calling tab's own (possibly expired) access token, if it sent one.
    // Decoded WITHOUT verifying signature/expiry — we only need the `id`
    // claim as a same-session sanity check, not as proof of authentication.
    // This lets rotateRefreshToken detect when the shared refresh_token
    // cookie has been overwritten by a *different* logged-in account in
    // another tab, instead of silently handing this tab someone else's
    // session.
    let expectedUserId = null;
    if (req.body?.staleAccessToken) {
      try {
        const decoded = jwt.decode(req.body.staleAccessToken);
        expectedUserId = decoded?.id || null;
      } catch {
        // Malformed token — ignore, fall back to no identity check
      }
    }

    const { accessToken, refreshToken: newRefresh, expiresIn } =
      await tokenService.rotateRefreshToken({ rawRefreshToken, ipAddress, userAgent, expectedUserId });

    // Rotate cookie too
    setRefreshCookie(res, newRefresh, false);  // remember-me handled inside tokenService

    setImmediate(() => audit.tokenRefresh({ ipAddress, userAgent, metadata: {} }));

    return res.status(200).json({ success: true, token: accessToken, expiresIn });

  } catch (err) {
    const code = err.code || 'REFRESH_ERROR';
    if (['REFRESH_INVALID', 'REFRESH_EXPIRED', 'REFRESH_REUSED', 'SESSION_IDENTITY_MISMATCH'].includes(code)) {
      res.clearCookie('refresh_token', { httpOnly: true, secure: true, sameSite: 'Strict', path: '/api/auth' });
      return res.status(401).json({ success: false, error: err.message, code });
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
      `SELECT id, email, first_name, last_name, role, school_id, avatar_url,
              phone, subscription_status, subscription_expires_at,
              is_verified, onboarding_complete, xp_points,
              study_streak_days, daily_goal, last_login,
              em_registered_at, created_at, updated_at
       FROM users WHERE id = :id LIMIT 1`,
      { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    const user = await safeUser(rows[0]);
    // req.school is populated by the `protect` middleware for any
    // student/teacher/school_admin with a school_id — reuse it here rather
    // than a second query, same shape as the login response so client route
    // guards (EMPrivateRoute, etc.) work the same on page refresh as they
    // do right after login.
    if (req.school) {
      user.school = {
        id: rows[0].school_id, name: req.school.name, logo_url: req.school.logo_url,
        enable_aischoolonair: req.school.enable_aischoolonair, enable_em: req.school.enable_em,
        enabledLanguages: req.school.enabledLanguages || [],
        hasLanguageMasterclass: !!req.school.hasLanguageMasterclass,
      };
    }
    // registeredLanguages: populated by `protect` from user_language_registrations.
    // Powers the new /language/:code route guard + StudentDashboard's
    // language dropdown — see LanguageMasterclass.jsx and StudentDashboard.jsx.
    user.registeredLanguages = req.user.registeredLanguages || [];
    // hasLanguageMasterclass: reuse req.user's value (computed once by
    // `protect`) rather than trusting safeUser's own query above to still
    // be in sync -- same reasoning as registeredLanguages just above.
    user.hasLanguageMasterclass = !!req.user.hasLanguageMasterclass;
    return res.status(200).json({ success: true, user });
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

    const rows = await db.query(
      `SELECT id, first_name FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email }, type: QueryTypes.SELECT }  // R-04: now uses normalised value
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
      userId: rows[0].id, email, ipAddress, userAgent,
    }));

    // BUG FIX (reset-email-never-sent): same class of bug as the missing
    // verification email above — the token was generated and correctly
    // stored, and the response below tells the user "a reset link has been
    // sent", but sendPasswordResetEmail was imported and never actually
    // called anywhere in this file. That meant the password reset flow was
    // completely broken end-to-end: no user who requested a reset could
    // ever receive the email needed to act on it, with nothing anywhere
    // (including this reassuring success response) revealing that.
    setImmediate(() => {
      sendPasswordResetEmail({ email, first_name: rows[0].first_name, token })
        .catch(err => console.error('[forgotPassword] reset email failed:', err.message));
    });

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
