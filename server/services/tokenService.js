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
  || 4 * 3600;  // 4 hours

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
  );

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
  if (!jti) throw Object.assign(new Error('Token missing jti'), { code: 'TOKEN_INVALID' });

  const rows = await db.query(
    `SELECT id, revoked, last_used_at, expires_at
     FROM auth_tokens
     WHERE jti = :jti
     LIMIT 1`,
    { replacements: { jti }, type: QueryTypes.SELECT }
  );

  if (!rows.length) {
    throw Object.assign(new Error('Token not registered'), { code: 'TOKEN_INVALID' });
  }

  const row = rows[0];

  if (row.revoked) {
    throw Object.assign(new Error('Token has been revoked'), { code: 'TOKEN_REVOKED' });
  }

  // Inactivity check
  const idleSecs = (Date.now() - new Date(row.last_used_at).getTime()) / 1000;
  if (idleSecs > INACTIVITY_TTL) {
    // Auto-revoke the idle token
    await revokeByJti(jti, 'inactivity');
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
async function rotateRefreshToken({ rawRefreshToken, ipAddress, userAgent }) {
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
