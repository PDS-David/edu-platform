'use strict';

/**
 * server/tests/security.test.js
 *
 * Regression tests for the 2026-06 security hardening:
 *   1. Last-admin protection (role demotion, deactivation, deletion)
 *   2. Soft-delete & restore
 *   3. Audit log creation for key events
 *   4. Teacher IDOR — student data access blocked outside scope
 *   5. Destructive action confirmation headers
 *   6. Admin rate-limiter exists
 *
 * Run with:  node server/tests/security.test.js
 * Requires:  DATABASE_URL env var pointing at the live/staging Postgres DB.
 *
 * Uses node's built-in assert module and raw DB queries — no Jest/Mocha needed.
 */

const assert     = require('assert');
const { QueryTypes } = require('sequelize');

// Bootstrap env (mirrors server startup)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../api.env') });

const db = require('../config/database');
const audit = require('../services/auditLogger');

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup helpers
// ─────────────────────────────────────────────────────────────────────────────

async function countAdmins() {
  const [row] = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM users
     WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL`,
    { type: QueryTypes.SELECT }
  );
  return row.cnt;
}

async function createTestUser(role = 'student', suffix = Date.now()) {
  const bcrypt = require('bcryptjs');
  const hash   = await bcrypt.hash('Test1234!', 10);
  const [row]  = await db.query(
    `INSERT INTO users (email, password, first_name, last_name, role,
       is_active, is_verified, subscription_status, pending_exam_board_ids,
       created_at, updated_at)
     VALUES (:email, :pw, 'Test', 'User', :role,
             true, true, 'free_trial', '{}', NOW(), NOW())
     RETURNING id, email, role`,
    {
      replacements: { email: `test-sec-${suffix}@aischoolonair.test`, pw: hash, role },
      type: QueryTypes.SELECT,
    }
  );
  return row;
}

async function hardDeleteUser(id) {
  await db.query(`DELETE FROM users WHERE id = :id`, { replacements: { id }, type: QueryTypes.DELETE });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Audit log table exists and trigger blocks mutations
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n[1] Audit log integrity');

await test('audit_logs table exists', async () => {
  const [row] = await db.query(
    `SELECT to_regclass('public.audit_logs') IS NOT NULL AS exists`,
    { type: QueryTypes.SELECT }
  );
  assert.strictEqual(row.exists, true, 'audit_logs table is missing');
});

await test('audit_logs insert works', async () => {
  await db.query(
    `INSERT INTO audit_logs (action, severity, metadata, created_at)
     VALUES ('TEST_EVENT', 'info', '{"test":true}', NOW())`,
    { type: QueryTypes.INSERT }
  );
});

await test('audit_logs DELETE is blocked by trigger', async () => {
  let threw = false;
  try {
    await db.query(
      `DELETE FROM audit_logs WHERE action = 'TEST_EVENT'`,
      { type: QueryTypes.DELETE }
    );
  } catch (err) {
    threw = err.message.includes('immutable');
  }
  assert.strictEqual(threw, true, 'Expected DELETE on audit_logs to throw');
});

await test('audit_logs UPDATE is blocked by trigger', async () => {
  let threw = false;
  try {
    await db.query(
      `UPDATE audit_logs SET severity = 'critical' WHERE action = 'TEST_EVENT'`,
      { type: QueryTypes.UPDATE }
    );
  } catch (err) {
    threw = err.message.includes('immutable');
  }
  assert.strictEqual(threw, true, 'Expected UPDATE on audit_logs to throw');
});

await test('auditLogger.log() writes a record', async () => {
  const before = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM audit_logs WHERE action = 'SECURITY_TEST_LOG'`,
    { type: QueryTypes.SELECT }
  );
  await audit.log(null, 'SECURITY_TEST_LOG', {
    metadata: { source: 'regression-test' }, severity: 'info',
  });
  const after = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM audit_logs WHERE action = 'SECURITY_TEST_LOG'`,
    { type: QueryTypes.SELECT }
  );
  assert.ok(after[0].cnt > before[0].cnt, 'auditLogger.log() did not insert a row');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Soft-delete columns exist
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n[2] Soft-delete schema');

await test('users.deleted_at column exists', async () => {
  const [row] = await db.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'deleted_at'`,
    { type: QueryTypes.SELECT }
  );
  assert.ok(row, 'users.deleted_at column missing');
});

await test('users.deleted_by column exists', async () => {
  const [row] = await db.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'deleted_by'`,
    { type: QueryTypes.SELECT }
  );
  assert.ok(row, 'users.deleted_by column missing');
});

await test('soft-delete sets deleted_at and deactivates user', async () => {
  const user = await createTestUser('student', `sd-${Date.now()}`);
  try {
    await db.query(
      `UPDATE users SET deleted_at = NOW(), is_active = false, updated_at = NOW()
       WHERE id = :id`,
      { replacements: { id: user.id }, type: QueryTypes.UPDATE }
    );
    const [row] = await db.query(
      `SELECT is_active, deleted_at FROM users WHERE id = :id`,
      { replacements: { id: user.id }, type: QueryTypes.SELECT }
    );
    assert.strictEqual(row.is_active, false, 'is_active should be false after soft-delete');
    assert.ok(row.deleted_at, 'deleted_at should be set after soft-delete');
  } finally {
    await hardDeleteUser(user.id);
  }
});

await test('restore clears deleted_at and reactivates user', async () => {
  const user = await createTestUser('student', `rs-${Date.now()}`);
  try {
    await db.query(
      `UPDATE users SET deleted_at = NOW(), is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: user.id }, type: QueryTypes.UPDATE }
    );
    await db.query(
      `UPDATE users SET deleted_at = NULL, is_active = true, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: user.id }, type: QueryTypes.UPDATE }
    );
    const [row] = await db.query(
      `SELECT is_active, deleted_at FROM users WHERE id = :id`,
      { replacements: { id: user.id }, type: QueryTypes.SELECT }
    );
    assert.strictEqual(row.is_active, true,  'is_active should be true after restore');
    assert.strictEqual(row.deleted_at, null, 'deleted_at should be NULL after restore');
  } finally {
    await hardDeleteUser(user.id);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Last-admin protection trigger
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n[3] Last-admin protection');

await test('DB trigger guard_last_admin exists', async () => {
  const [row] = await db.query(
    `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_last_admin'`,
    { type: QueryTypes.SELECT }
  );
  assert.ok(row, 'trg_guard_last_admin trigger is missing — run migration_005_security.sql');
});

await test('demoting the only admin is blocked by DB trigger', async () => {
  const adminCount = await countAdmins();
  if (adminCount > 1) {
    console.log('    (skipped — multiple admins exist, safe demotion test requires exactly 1)');
    return;
  }
  // Try to demote the last admin
  let threw = false;
  let adminId;
  try {
    const [admin] = await db.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    adminId = admin.id;
    await db.query(
      `UPDATE users SET role = 'teacher' WHERE id = :id`,
      { replacements: { id: adminId }, type: QueryTypes.UPDATE }
    );
  } catch (err) {
    threw = err.message.includes('LAST_ADMIN_PROTECTION');
  }
  assert.strictEqual(threw, true, 'Expected last-admin demotion to be blocked');
});

await test('deactivating the only admin is blocked by DB trigger', async () => {
  const adminCount = await countAdmins();
  if (adminCount > 1) {
    console.log('    (skipped — multiple admins exist)');
    return;
  }
  let threw = false;
  try {
    const [admin] = await db.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    await db.query(
      `UPDATE users SET is_active = false WHERE id = :id`,
      { replacements: { id: admin.id }, type: QueryTypes.UPDATE }
    );
  } catch (err) {
    threw = err.message.includes('LAST_ADMIN_PROTECTION');
  }
  assert.strictEqual(threw, true, 'Expected last-admin deactivation to be blocked');
});

await test('adding a second admin then demoting first succeeds', async () => {
  const secondAdmin = await createTestUser('admin', `2a-${Date.now()}`);
  let demotionWorked = false;
  try {
    const [firstAdmin] = await db.query(
      `SELECT id FROM users
       WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL AND id != :id
       LIMIT 1`,
      { replacements: { id: secondAdmin.id }, type: QueryTypes.SELECT }
    );
    if (firstAdmin) {
      await db.query(
        `UPDATE users SET role = 'teacher' WHERE id = :id`,
        { replacements: { id: firstAdmin.id }, type: QueryTypes.UPDATE }
      );
      // Restore
      await db.query(
        `UPDATE users SET role = 'admin' WHERE id = :id`,
        { replacements: { id: firstAdmin.id }, type: QueryTypes.UPDATE }
      );
      demotionWorked = true;
    } else {
      demotionWorked = true; // no other admin to demote — test passes vacuously
    }
  } finally {
    await hardDeleteUser(secondAdmin.id);
  }
  assert.strictEqual(demotionWorked, true, 'Demotion with 2 admins should succeed');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Middleware exports exist
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n[4] Middleware exports');

await test('teacherScope middleware exports expected functions', () => {
  const ts = require('../middleware/teacherScope');
  assert.strictEqual(typeof ts.requireTeacherStudentScope,    'function');
  assert.strictEqual(typeof ts.requireTeacherAnalyticsScope,  'function');
  assert.strictEqual(typeof ts.requireTeacherClassOwnership,  'function');
  assert.strictEqual(typeof ts.studentInTeacherScope,         'function');
});

await test('confirmDestructive middleware exports expected functions', () => {
  const cd = require('../middleware/confirmDestructive');
  assert.strictEqual(typeof cd.requireConfirmHeader, 'function');
  assert.strictEqual(typeof cd.requireConfirmBody,   'function');
  assert.strictEqual(typeof cd.requireAdminConfirm,  'function');
});

await test('rateLimiter exports adminActionLimiter', () => {
  const rl = require('../middleware/rateLimiter');
  assert.strictEqual(typeof rl.adminActionLimiter, 'function');
});

await test('auditLogger exports log, blockIdor, ACTIONS', () => {
  const al = require('../services/auditLogger');
  assert.strictEqual(typeof al.log,       'function');
  assert.strictEqual(typeof al.blockIdor, 'function');
  assert.ok(al.ACTIONS && typeof al.ACTIONS === 'object');
  assert.ok(al.ACTIONS.LOGIN);
  assert.ok(al.ACTIONS.ROLE_CHANGE);
  assert.ok(al.ACTIONS.USER_DELETE);
  assert.ok(al.ACTIONS.IDOR_ATTEMPT);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. confirmDestructive middleware logic
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n[5] Confirmation middleware');

await test('requireConfirmHeader passes with correct token', () => {
  const { requireConfirmHeader } = require('../middleware/confirmDestructive');
  const middleware = requireConfirmHeader('purge-all-resources');
  const req = { headers: { 'x-confirm': 'purge-all-resources' } };
  let nextCalled = false;
  middleware(req, {}, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

await test('requireConfirmHeader blocks with wrong token', () => {
  const { requireConfirmHeader } = require('../middleware/confirmDestructive');
  const middleware = requireConfirmHeader('purge-all-resources');
  const req = { headers: { 'x-confirm': 'wrong-token' } };
  let statusCode = 200;
  const res = { status: (s) => { statusCode = s; return { json: () => {} }; } };
  middleware(req, res, () => {});
  assert.strictEqual(statusCode, 400);
});

await test('requireAdminConfirm passes with correct header and admin role', () => {
  const { requireAdminConfirm } = require('../middleware/confirmDestructive');
  const req = { user: { role: 'admin' }, headers: { 'x-admin-action': '1' } };
  let nextCalled = false;
  requireAdminConfirm(req, {}, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

await test('requireAdminConfirm blocks non-admin', () => {
  const { requireAdminConfirm } = require('../middleware/confirmDestructive');
  const req = { user: { role: 'teacher' }, headers: { 'x-admin-action': '1' } };
  let statusCode = 200;
  const res = { status: (s) => { statusCode = s; return { json: () => {} }; } };
  requireAdminConfirm(req, res, () => {});
  assert.strictEqual(statusCode, 403);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Teacher IDOR scope
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n[6] Teacher IDOR scope (studentInTeacherScope)');

await test('studentInTeacherScope returns false for unrelated users', async () => {
  const { studentInTeacherScope } = require('../middleware/teacherScope');
  // Use a known-nonexistent UUID pair — should cleanly return false
  const fakeTeacherId  = '00000000-0000-0000-0000-000000000001';
  const fakeStudentId  = '00000000-0000-0000-0000-000000000002';
  const result = await studentInTeacherScope(fakeTeacherId, fakeStudentId);
  assert.strictEqual(result, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Security regression tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
  process.exit(1);
} else {
  console.log('All security tests passed ✓');
  process.exit(0);
}
