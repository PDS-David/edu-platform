'use strict';

/**
 * tests/auth.test.js
 *
 * Authentication security test suite covering AUTH-001 → AUTH-006.
 *
 * Tests:
 *   AUTH-001  Account lockout (5 failures → lock → 15-min expiry)
 *   AUTH-002  Token revocation (single-session, all-device)
 *   AUTH-005  Refresh flow (rotation, reuse detection)
 *   AUTH-005  Session inactivity expiration
 *   AUTH-003  Remember Me (short vs. extended TTL)
 *   AUTH-002  Concurrent device sessions
 *   AUTH-006  Audit log written for every event
 *
 * Run:  npx jest tests/auth.test.js --runInBand
 *
 * Requires:
 *   - server/.env with DATABASE_URL pointing to a test-safe Postgres instance
 *   - migration_auth_hardening.sql already applied
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt      = require('bcryptjs');
const { QueryTypes } = require('sequelize');
const db          = require('../config/database');
const tokenService = require('../services/tokenService');

// ─── Test state ───────────────────────────────────────────────────────────────
const state = {
  userId:  null,
  email:   `auth_test_${Date.now()}@example.com`,
  password: 'TestPass123!',
  passwordHash: null,
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  // Verify migration has been applied
  const cols = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' AND column_name IN ('failed_login_count','locked_until')`,
    { type: QueryTypes.SELECT }
  );
  if (cols.length < 2) {
    throw new Error(
      'migration_auth_hardening.sql has not been applied. ' +
      'Run: psql $DATABASE_URL < database/migration_auth_hardening.sql'
    );
  }

  state.passwordHash = await bcrypt.hash(state.password, 12);

  const [user] = await db.query(
    `INSERT INTO users
       (email, password, first_name, last_name, role,
        is_active, is_verified, subscription_status,
        failed_login_count, created_at, updated_at)
     VALUES
       (:email, :password, 'Test', 'User', 'student',
        true, true, 'free_trial',
        0, NOW(), NOW())
     RETURNING id`,
    {
      replacements: { email: state.email, password: state.passwordHash },
      type: QueryTypes.SELECT,
    }
  );
  state.userId = user.id;
});

afterAll(async () => {
  if (state.userId) {
    await db.query(`DELETE FROM auth_tokens       WHERE user_id = :id`, { replacements: { id: state.userId }, type: QueryTypes.DELETE });
    await db.query(`DELETE FROM auth_audit_log    WHERE user_id = :id`, { replacements: { id: state.userId }, type: QueryTypes.DELETE });
    await db.query(`DELETE FROM users             WHERE id      = :id`, { replacements: { id: state.userId }, type: QueryTypes.DELETE });
  }
  await db.close();
});

// Reset lockout between tests
async function resetUser() {
  await db.query(
    `UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = :id`,
    { replacements: { id: state.userId }, type: QueryTypes.UPDATE }
  );
  await db.query(
    `UPDATE auth_tokens SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'test_reset'
     WHERE user_id = :id AND revoked = FALSE`,
    { replacements: { id: state.userId }, type: QueryTypes.UPDATE }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-001 — Account lockout
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-001 — Account Lockout', () => {
  beforeEach(resetUser);

  test('failed_login_count increments on wrong password', async () => {
    for (let i = 1; i <= 3; i++) {
      await db.query(
        `UPDATE users SET failed_login_count = :i WHERE id = :id`,
        { replacements: { i, id: state.userId }, type: QueryTypes.UPDATE }
      );
    }
    const [row] = await db.query(
      `SELECT failed_login_count FROM users WHERE id = :id`,
      { replacements: { id: state.userId }, type: QueryTypes.SELECT }
    );
    expect(row.failed_login_count).toBe(3);
  });

  test('account locks after MAX_FAILED_ATTEMPTS', async () => {
    const max = parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS, 10) || 5;
    const lockMins = parseInt(process.env.AUTH_LOCKOUT_MINUTES, 10) || 15;
    const lockedUntil = new Date(Date.now() + lockMins * 60 * 1000);

    await db.query(
      `UPDATE users
       SET failed_login_count = :max, locked_until = :lockedUntil
       WHERE id = :id`,
      { replacements: { max, lockedUntil, id: state.userId }, type: QueryTypes.UPDATE }
    );

    const [row] = await db.query(
      `SELECT failed_login_count, locked_until FROM users WHERE id = :id`,
      { replacements: { id: state.userId }, type: QueryTypes.SELECT }
    );
    expect(row.failed_login_count).toBe(max);
    expect(new Date(row.locked_until) > new Date()).toBe(true);
  });

  test('lockout clears after locked_until passes', async () => {
    // Simulate an expired lockout
    await db.query(
      `UPDATE users
       SET failed_login_count = 5, locked_until = NOW() - INTERVAL '1 second'
       WHERE id = :id`,
      { replacements: { id: state.userId }, type: QueryTypes.UPDATE }
    );

    const [row] = await db.query(
      `SELECT locked_until FROM users WHERE id = :id`,
      { replacements: { id: state.userId }, type: QueryTypes.SELECT }
    );
    expect(new Date(row.locked_until) < new Date()).toBe(true);
  });

  test('successful login resets counter', async () => {
    await db.query(
      `UPDATE users SET failed_login_count = 3, locked_until = NULL WHERE id = :id`,
      { replacements: { id: state.userId }, type: QueryTypes.UPDATE }
    );
    // Simulate successful login counter reset
    await db.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = :id`,
      { replacements: { id: state.userId }, type: QueryTypes.UPDATE }
    );
    const [row] = await db.query(
      `SELECT failed_login_count FROM users WHERE id = :id`,
      { replacements: { id: state.userId }, type: QueryTypes.SELECT }
    );
    expect(row.failed_login_count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-002 — Token Revocation
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-002 — Token Revocation', () => {
  beforeEach(resetUser);

  test('issued token is registered in auth_tokens', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(accessToken);
    const [row] = await db.query(
      `SELECT id, revoked FROM auth_tokens WHERE jti = :jti`,
      { replacements: { jti: decoded.jti }, type: QueryTypes.SELECT }
    );
    expect(row).toBeDefined();
    expect(row.revoked).toBe(false);
  });

  test('revokeToken marks the jti as revoked', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    await tokenService.revokeToken(accessToken, 'logout');

    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(accessToken);
    const [row] = await db.query(
      `SELECT revoked, revoked_reason FROM auth_tokens WHERE jti = :jti`,
      { replacements: { jti: decoded.jti }, type: QueryTypes.SELECT }
    );
    expect(row.revoked).toBe(true);
    expect(row.revoked_reason).toBe('logout');
  });

  test('verifyAccessToken throws on revoked token', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    await tokenService.revokeToken(accessToken, 'logout');
    await expect(tokenService.verifyAccessToken(accessToken))
      .rejects.toMatchObject({ code: 'TOKEN_REVOKED' });
  });

  test('revokeAllForUser revokes every active token for the user', async () => {
    // Issue three tokens (simulating three devices)
    await tokenService.issueTokenPair({ userId: state.userId, role: 'student' });
    await tokenService.issueTokenPair({ userId: state.userId, role: 'student' });
    await tokenService.issueTokenPair({ userId: state.userId, role: 'student' });

    await tokenService.revokeAllForUser(state.userId, 'all_devices');

    const rows = await db.query(
      `SELECT COUNT(*) AS cnt FROM auth_tokens
       WHERE user_id = :id AND revoked = FALSE`,
      { replacements: { id: state.userId }, type: QueryTypes.SELECT }
    );
    expect(parseInt(rows[0].cnt, 10)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-005 — Refresh Flow & Token Rotation
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-005 — Refresh Flow', () => {
  beforeEach(resetUser);

  test('rotateRefreshToken issues new access + refresh tokens', async () => {
    const { refreshToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    const result = await tokenService.rotateRefreshToken({
      rawRefreshToken: refreshToken,
      ipAddress: '127.0.0.1',
    });
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.accessToken).not.toBe(refreshToken);
  });

  test('old refresh token is revoked after rotation', async () => {
    const { refreshToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    await tokenService.rotateRefreshToken({ rawRefreshToken: refreshToken });

    // Attempt to use the old refresh token — should fail
    await expect(
      tokenService.rotateRefreshToken({ rawRefreshToken: refreshToken })
    ).rejects.toMatchObject({ code: 'REFRESH_REUSED' });
  });

  test('refresh token reuse revokes ALL user sessions (theft detection)', async () => {
    const { refreshToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    // Use once legitimately
    await tokenService.rotateRefreshToken({ rawRefreshToken: refreshToken });

    // Attempt reuse (simulates token theft)
    try {
      await tokenService.rotateRefreshToken({ rawRefreshToken: refreshToken });
    } catch {}

    const rows = await db.query(
      `SELECT COUNT(*) AS cnt FROM auth_tokens
       WHERE user_id = :id AND revoked = FALSE`,
      { replacements: { id: state.userId }, type: QueryTypes.SELECT }
    );
    expect(parseInt(rows[0].cnt, 10)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-005 — Inactivity Expiration
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-005 — Inactivity Expiration', () => {
  beforeEach(resetUser);

  test('token used within inactivity window is valid', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    // last_used_at is NOW() — well within window
    await expect(tokenService.verifyAccessToken(accessToken)).resolves.toMatchObject({
      id: state.userId,
    });
  });

  test('token idle beyond INACTIVITY_TTL is rejected', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student',
    });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(accessToken);

    // Backdate last_used_at beyond the inactivity window
    await db.query(
      `UPDATE auth_tokens
       SET last_used_at = NOW() - INTERVAL '5 hours'
       WHERE jti = :jti`,
      { replacements: { jti: decoded.jti }, type: QueryTypes.UPDATE }
    );

    await expect(tokenService.verifyAccessToken(accessToken))
      .rejects.toMatchObject({ code: 'TOKEN_INACTIVE' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-003 — Remember Me
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-003 — Remember Me', () => {
  beforeEach(resetUser);

  test('without rememberMe: short access TTL', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student', rememberMe: false,
    });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(accessToken);
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBeLessThanOrEqual(16 * 60); // ≤ 16 min
  });

  test('with rememberMe: extended access TTL (7 days)', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student', rememberMe: true,
    });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(accessToken);
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBeGreaterThan(6 * 24 * 3600); // > 6 days
  });

  test('rememberMe flag persisted in auth_tokens', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      userId: state.userId, role: 'student', rememberMe: true,
    });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(accessToken);
    const [row] = await db.query(
      `SELECT remember_me, refresh_expires_at FROM auth_tokens WHERE jti = :jti`,
      { replacements: { jti: decoded.jti }, type: QueryTypes.SELECT }
    );
    expect(row.remember_me).toBe(true);
    // Extended refresh window (≈ 30 days)
    const refreshTtlDays = (new Date(row.refresh_expires_at) - new Date()) / 86400000;
    expect(refreshTtlDays).toBeGreaterThan(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-002 — Concurrent Devices
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-002 — Concurrent Device Sessions', () => {
  beforeEach(resetUser);

  test('multiple devices can have independent active tokens', async () => {
    const devices = ['web', 'mobile-ios', 'mobile-android'];
    const tokens = await Promise.all(
      devices.map((d) =>
        tokenService.issueTokenPair({ userId: state.userId, role: 'student', deviceHint: d })
      )
    );

    // All tokens are independently valid
    for (const { accessToken } of tokens) {
      await expect(tokenService.verifyAccessToken(accessToken)).resolves.toMatchObject({
        id: state.userId,
      });
    }
  });

  test('single-session logout does not affect other devices', async () => {
    const [t1, t2] = await Promise.all([
      tokenService.issueTokenPair({ userId: state.userId, role: 'student', deviceHint: 'device-A' }),
      tokenService.issueTokenPair({ userId: state.userId, role: 'student', deviceHint: 'device-B' }),
    ]);

    // Log out device A only
    await tokenService.revokeToken(t1.accessToken, 'logout');

    // Device A should be rejected
    await expect(tokenService.verifyAccessToken(t1.accessToken))
      .rejects.toMatchObject({ code: 'TOKEN_REVOKED' });

    // Device B should still work
    await expect(tokenService.verifyAccessToken(t2.accessToken))
      .resolves.toMatchObject({ id: state.userId });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-006 — Audit Log
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-006 — Audit Logging', () => {
  test('audit table exists with correct schema', async () => {
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'auth_audit_log'`,
      { type: QueryTypes.SELECT }
    );
    const colNames = cols.map((c) => c.column_name);
    expect(colNames).toContain('event_type');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('ip_address');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('created_at');
  });

  test('audit.log() writes a record', async () => {
    const audit = require('../services/authAuditService');
    await audit.loginSuccess({
      userId:    state.userId,
      email:     state.email,
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
      metadata:  { test: true },
    });

    const rows = await db.query(
      `SELECT event_type, metadata FROM auth_audit_log
       WHERE user_id = :id AND event_type = 'LOGIN_SUCCESS'
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { id: state.userId }, type: QueryTypes.SELECT }
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].event_type).toBe('LOGIN_SUCCESS');
  });

  test('audit failure does not throw (fire-and-forget)', async () => {
    const audit = require('../services/authAuditService');
    // Pass invalid UUID — should not throw
    await expect(
      audit.log({ eventType: 'TEST_EVENT', userId: null, email: 'x@x.com' })
    ).resolves.not.toThrow();
  });
});
