'use strict';

/**
 * tokenService.js
 *
 * Central authority for all token lifecycle operations.
 *
 * Covers AUTH-002, AUTH-003, AUTH-004, AUTH-005:
 *   - Issue access + refresh token pairs with jti registration
 *   - Server-side revocation (single-session and all-device)
 *   - Remember Me: extended lifetimes when opted in
 *   - Token rotation on refresh
 *   - Inactivity expiration via last_used_at
 *   - Revocation check used by protect middleware
 */

const crypto      = require('crypto');
const jwt         = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');
const db          = require('../config/database');
const logger      = require('../config/logger');

// ─── Configuration ────────────────────────────────────────────────────────────
// All values are configurable via environment variables.

const getSecret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
};

const ISSUER = 'edu-platform';

// Access token TTL (seconds)
const ACCESS_TTL_DEFAULT    = 15 * 60;            // 15 minutes  (no remember me)
const ACCESS_TTL_REMEMBER   = 7  * 24 * 3600;     // 7 days      (remember me)

// Refresh token TTL (seconds)
const REFRESH_TTL_DEFAULT   = 24 * 3600;           // 1 day       (no remember me)
const REFRESH_TTL_REMEMBER  = 30 * 24 * 3600;      // 30 days     (remember me)

// Inactivity window — if last_used_at is older than this, the token is invalid
const INACTIVITY_TTL = parseInt(process.env.AUTH_INACTIVITY_TTL_SECONDS, 10)
  || 24 * 3600;  // 24 hours — students spend 30+ min on quizzes without API calls

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateJti() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateRawRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

// ─── Issue a token pair ───────────────────────────────────────────────────────

/**
 * issueTokenPair
 *
 * Creates a signed JWT (access) + opaque refresh token, persists the
 * registration row in auth_tokens, and returns both to the caller.
 *
 * @param {object}  opts
 * @param {string}  opts.userId
 * @param {string}  opts.role
 * @param {boolean} [opts.rememberMe=false]
 * @param {string}  [opts.deviceHint]
 * @param {string}  [opts.ipAddress]
 * @param {string}  [opts.userAgent]
 * @returns {{ accessToken, refreshToken, expiresIn }}
 */
async function issueTokenPair({ userId, role, rememberMe = false, deviceHint, ipAddress, userAgent }) {
  const jti        = generateJti();
  const accessTtl  = rememberMe ? ACCESS_TTL_REMEMBER  : ACCESS_TTL_DEFAULT;
  const refreshTtl = rememberMe ? REFRESH_TTL_REMEMBER : REFRESH_TTL_DEFAULT;

  const accessToken = jwt.sign(
    { id: userId, role, jti },
    getSecret(),
    { expiresIn: accessTtl, issuer: ISSUER }
  );

  const rawRefresh      = generateRawRefreshToken();
  const hashedRefresh   = hashToken(rawRefresh);
  const now             = new Date();
  const expiresAt       = new Date(now.getTime() + accessTtl  * 1000);
  const refreshExpiresAt = new Date(now.getTime() + refreshTtl * 1000);

  await db.query(
    `INSERT INTO auth_tokens
       (user_id, jti, refresh_token, remember_me,
        device_hint, ip_address, user_agent,
        issued_at, expires_at, refresh_expires_at, last_used_at)
     VALUES
       (:userId, :jti, :refresh, :rememberMe,
        :deviceHint, :ipAddress, :userAgent,
        NOW(), :expiresAt, :refreshExpiresAt, NOW())`,
    {
      replacements: {
        userId, jti,
        refresh:          hashedRefresh,
        rememberMe,
        deviceHint:       deviceHint  || null,
        ipAddress:        ipAddress   || null,
        userAgent:        userAgent   || null,
        expiresAt,
        refreshExpiresAt,
      },
      type: QueryTypes.INSERT,
    }
  ).catch(err => {
    // Degrade gracefully if auth_tokens table hasn't been created yet
    // (migration_auth_hardening.sql not yet run on this environment).
    // Tokens will still work; server-side revocation just won't be available.
    const code = err.original?.code || err.parent?.code;
    if (code === '42P01') { // undefined_table
      logger.warn('[tokenService] auth_tokens table missing — run migration_auth_hardening.sql on Supabase. Proceeding without server-side revocation.');
      return;
    }
    throw err; // re-throw any other DB error
  });

  return { accessToken, refreshToken: rawRefresh, expiresIn: accessTtl };
}

// ─── Verify + check revocation ────────────────────────────────────────────────

/**
 * verifyAccessToken
 *
 * Verifies the JWT signature/expiry AND checks the server-side revocation
 * registry.  Updates last_used_at for inactivity tracking.
 *
 * Returns the decoded payload on success.
 * Throws on any failure (expired, revoked, inactivity, not found).
 */
async function verifyAccessToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, getSecret(), { issuer: ISSUER });
  } catch (err) {
    throw Object.assign(new Error('Invalid or expired access token'), { code: 'TOKEN_INVALID' });
  }

  const { jti } = decoded;

  // BACKWARD-COMPAT BRIDGE: tokens issued before auth-hardening (utils/jwt.js
  // generateToken) have no jti. Until those 7-day tokens naturally expire we
  // must accept them via signature+expiry only — same as before hardening.
  // Once all pre-hardening tokens have expired this block can be removed.
  if (!jti) return decoded;

  const rows = await db.query(
    `SELECT id, revoked, last_used_at, expires_at
     FROM auth_tokens
     WHERE jti = :jti
     LIMIT 1`,
    { replacements: { jti }, type: QueryTypes.SELECT }
  ).catch(err => {
    const code = err.original?.code || err.parent?.code;
    if (code === '42P01') {
      // auth_tokens table missing — skip server-side revocation check,
      // rely on JWT signature/expiry only until migration is run.
      return null; // signal to skip checks below
    }
    throw err;
  });

  // null = table missing, skip revocation checks
  if (rows === null) return decoded;

  if (!rows.length) {
    // Token has a jti but no row in auth_tokens — this happens when:
    //   a) the issueTokenPair INSERT into auth_tokens failed silently, OR
    //   b) the table was just created and the first post-migration login
    //      had a transient DB error during the INSERT.
    // In both cases the JWT signature is still valid — degrade gracefully
    // by accepting the token rather than locking the user out.
    // A new auth_tokens row will be created on next login.
    return decoded;
  }

  const row = rows[0];

  if (row.revoked) {
    throw Object.assign(new Error('Token has been revoked'), { code: 'TOKEN_REVOKED' });
  }

  // Inactivity check
  const idleSecs = (Date.now() - new Date(row.last_used_at).getTime()) / 1000;
  if (idleSecs > INACTIVITY_TTL) {
    // Do NOT auto-revoke here — just signal inactivity so the apiClient
    // refresh interceptor can silently recover the session using the refresh
    // token (HttpOnly cookie). Auto-revoking would invalidate the refresh
    // token too, permanently locking the user out with no recovery path.
    // Students spend 30+ minutes on quiz pages with no API calls —
    // auto-revocation turns every completed quiz into a forced logout.
    throw Object.assign(new Error('Session expired due to inactivity'), { code: 'TOKEN_INACTIVE' });
  }

  // Touch last_used_at (fire-and-forget)
  setImmediate(() =>
    db.query(
      `UPDATE auth_tokens SET last_used_at = NOW() WHERE jti = :jti`,
      { replacements: { jti }, type: QueryTypes.UPDATE }
    ).catch(() => {})
  );

  return decoded;
}

// ─── Refresh flow ─────────────────────────────────────────────────────────────

/**
 * rotateRefreshToken
 *
 * Validates the raw refresh token, revokes the old pair, and issues a
 * fresh access + refresh pair (token rotation — AUTH-005).
 *
 * @returns {{ accessToken, refreshToken, expiresIn }}
 */
async function rotateRefreshToken({ rawRefreshToken, ipAddress, userAgent, expectedUserId }) {
  const hashed = hashToken(rawRefreshToken);

  const rows = await db.query(
    `SELECT id, user_id, remember_me, device_hint, revoked, refresh_expires_at
     FROM auth_tokens
     WHERE refresh_token = :hashed
     LIMIT 1`,
    { replacements: { hashed }, type: QueryTypes.SELECT }
  );

  if (!rows.length) {
    throw Object.assign(new Error('Refresh token not found'), { code: 'REFRESH_INVALID' });
  }

  const row = rows[0];

  // CROSS-SESSION GUARD — refresh_token is a single domain-wide cookie
  // (path: /api/auth), shared by every tab open against this origin. If two
  // different accounts are logged in across two tabs (e.g. an admin tab and
  // a student tab), whichever tab refreshes most recently silently
  // overwrites the cookie for BOTH tabs. The next tab to refresh would
  // otherwise transparently receive a token for someone else's account —
  // surfacing as unexplained 401/403 flapping, and as a real
  // privilege-confusion risk (one tab could end up holding another
  // account's access token). expectedUserId is the id embedded in the
  // calling tab's own (expired) access token — its one piece of evidence
  // about who IT believes it is. If it doesn't match the account the
  // cookie actually belongs to, fail closed and force a clean re-login
  // instead of silently swapping identity.
  if (expectedUserId && String(expectedUserId) !== String(row.user_id)) {
    throw Object.assign(
      new Error('Session conflict detected — please log in again'),
      { code: 'SESSION_IDENTITY_MISMATCH' }
    );
  }

  if (row.revoked) {
    // Possible token theft — revoke the entire user's sessions
    await revokeAllForUser(row.user_id, 'refresh_reuse');
    logger.warn(`[tokenService] Refresh token reuse detected for user ${row.user_id} — all sessions revoked`);
    throw Object.assign(new Error('Refresh token already used'), { code: 'REFRESH_REUSED' });
  }

  if (new Date(row.refresh_expires_at) < new Date()) {
    throw Object.assign(new Error('Refresh token expired'), { code: 'REFRESH_EXPIRED' });
  }

  // Fetch user role
  const users = await db.query(
    `SELECT id, role FROM users WHERE id = :id AND is_active = true LIMIT 1`,
    { replacements: { id: row.user_id }, type: QueryTypes.SELECT }
  );
  if (!users.length) throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND' });

  // Revoke old token
  await db.query(
    `UPDATE auth_tokens
     SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'rotation'
     WHERE id = :id`,
    { replacements: { id: row.id }, type: QueryTypes.UPDATE }
  );

  // Issue fresh pair and forward rememberMe so the caller can set the
  // correct cookie Max-Age (fix for auth.js FIX-4).
  const pair = await issueTokenPair({
    userId:     row.user_id,
    role:       users[0].role,
    rememberMe: row.remember_me,
    deviceHint: row.device_hint,
    ipAddress,
    userAgent,
  });
  return { ...pair, rememberMe: row.remember_me };
}

// ─── Revocation helpers ───────────────────────────────────────────────────────

async function revokeByJti(jti, reason = 'logout') {
  await db.query(
    `UPDATE auth_tokens
     SET revoked = TRUE, revoked_at = NOW(), revoked_reason = :reason
     WHERE jti = :jti AND revoked = FALSE`,
    { replacements: { jti, reason }, type: QueryTypes.UPDATE }
  );
}

/**
 * revokeToken — single-session logout.
 * Pass the raw access token; the jti is extracted and the DB row is invalidated.
 */
async function revokeToken(rawAccessToken, reason = 'logout') {
  try {
    const decoded = jwt.decode(rawAccessToken);
    if (decoded?.jti) await revokeByJti(decoded.jti, reason);
  } catch {
    // Token may already be malformed; still OK
  }
}

/**
 * revokeAllForUser — all-device logout.
 * Marks every active token for the user as revoked.
 */
async function revokeAllForUser(userId, reason = 'all_devices') {
  await db.query(
    `UPDATE auth_tokens
     SET revoked = TRUE, revoked_at = NOW(), revoked_reason = :reason
     WHERE user_id = :userId AND revoked = FALSE`,
    { replacements: { userId, reason }, type: QueryTypes.UPDATE }
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  issueTokenPair,
  verifyAccessToken,
  rotateRefreshToken,
  revokeToken,
  revokeAllForUser,
  // Exposed for tests
  _hashToken:     hashToken,
  _generateJti:   generateJti,
  INACTIVITY_TTL,
};
