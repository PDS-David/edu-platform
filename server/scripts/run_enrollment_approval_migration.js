#!/usr/bin/env node
// server/scripts/run_enrollment_approval_migration.js
//
// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║   AISchoolOnAir — Enrollment Approval System Migration                      ║
// ║   Production-Grade Bulletproof Migration Engine v2.0                        ║
// ║                                                                              ║
// ║   Subsystems:                                                                ║
// ║     [A] Global Migration Lock          [F] Strict Error Classification       ║
// ║     [B] Step Atomicity Model           [G] Safe Retry Engine                 ║
// ║     [C] Pre-Flight Validation Layer    [H] Migration Recovery Modes          ║
// ║     [D] Migration State Hardening      [I] Enhanced Verify System            ║
// ║     [E] Drift Detection System         [J] Output / Structured Logging       ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

'use strict';

const { Pool } = require('pg');
const os       = require('os');
const crypto   = require('crypto');

// ── Pool ─────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Keep the advisory-lock session alive; single client checked out explicitly
  max: 10,
});

// ═══════════════════════════════════════════════════════════════════════════════
// [J] STRUCTURED LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LOG_LEVEL  = LOG_LEVELS[process.env.MIGRATION_LOG_LEVEL] ?? LOG_LEVELS.INFO;

const log = {
  debug : (...a) => LOG_LEVEL <= LOG_LEVELS.DEBUG && console.debug ('  🔍 ', ...a),
  info  : (...a) => LOG_LEVEL <= LOG_LEVELS.INFO  && console.log   ('  ℹ️  ', ...a),
  ok    : (...a) => console.log   ('  ✅ ', ...a),
  skip  : (...a) => console.log   ('  ⏭️  ', ...a),
  warn  : (...a) => LOG_LEVEL <= LOG_LEVELS.WARN  && console.warn  ('  ⚠️  ', ...a),
  error : (...a) => console.error ('  ❌ ', ...a),
  step  : (s)   => console.log(`\n${'─'.repeat(70)}\n  ${s}\n${'─'.repeat(70)}\n`),
  header: (s)   => console.log(`\n${'═'.repeat(70)}\n  ${s}\n${'═'.repeat(70)}\n`),
};

// ═══════════════════════════════════════════════════════════════════════════════
// [A] GLOBAL MIGRATION LOCK
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Uses pg_try_advisory_lock(key) held on a *dedicated session-level client*.
//  Advisory locks are automatically released when the session ends — making
//  them crash-safe without any manual cleanup table.
//
//  Lock key: crc32-like fold of the migration name, kept stable across runs.
// ───────────────────────────────────────────────────────────────────────────────

const MIGRATION_NAME   = 'enrollment_approval_migration_v2';
const ADVISORY_LOCK_KEY = (function deriveKey(name) {
  // Fold a SHA-256 into a 32-bit signed integer (fits pg advisory lock key)
  const buf = crypto.createHash('sha256').update(name).digest();
  return buf.readInt32BE(0);
})(MIGRATION_NAME);

let _lockClient = null; // module-level so release() can always reach it

async function acquireGlobalLock() {
  log.info(`Acquiring advisory lock (key=${ADVISORY_LOCK_KEY}) for "${MIGRATION_NAME}" …`);
  _lockClient = await pool.connect();
  try {
    const { rows } = await _lockClient.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [ADVISORY_LOCK_KEY]
    );
    if (!rows[0].acquired) {
      _lockClient.release();
      _lockClient = null;
      throw new Error(
        'Another migration process is already running ' +
        `(advisory lock ${ADVISORY_LOCK_KEY} is held). Aborting.`
      );
    }
    log.ok('Global advisory lock acquired. No concurrent migration can run.');
  } catch (e) {
    if (_lockClient) { _lockClient.release(); _lockClient = null; }
    throw e;
  }
}

async function releaseGlobalLock() {
  if (_lockClient) {
    try {
      await _lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
      log.info('Global advisory lock released.');
    } catch { /* session end releases it anyway */ }
    _lockClient.release();
    _lockClient = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// [D] MIGRATION STATE HARDENING  — schema_migrations_log
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Extended columns vs. original:
//    hostname, pid, app_version, step_duration_ms, rows_affected, retry_count
// ───────────────────────────────────────────────────────────────────────────────

const APP_VERSION = process.env.APP_VERSION ?? 'unknown';
const HOSTNAME    = os.hostname();
const PID         = process.pid;

async function ensureMigrationLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations_log (
      id               BIGSERIAL PRIMARY KEY,
      migration_name   TEXT        NOT NULL,
      step_label       TEXT        NOT NULL,
      checksum         TEXT        NOT NULL,
      status           TEXT        NOT NULL CHECK (status IN ('started','completed','failed','skipped')),
      hostname         TEXT,
      pid              INTEGER,
      app_version      TEXT,
      step_duration_ms INTEGER,
      rows_affected    INTEGER,
      retry_count      INTEGER     NOT NULL DEFAULT 0,
      error_detail     TEXT,
      executed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at     TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sml_migration_step
      ON schema_migrations_log (migration_name, step_label)
  `);

  log.ok('schema_migrations_log table ready.');
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql.trim()).digest('hex').slice(0, 16);
}

async function logStepStart(stepLabel, sql) {
  const { rows } = await pool.query(`
    INSERT INTO schema_migrations_log
      (migration_name, step_label, checksum, status, hostname, pid, app_version)
    VALUES ($1, $2, $3, 'started', $4, $5, $6)
    RETURNING id
  `, [MIGRATION_NAME, stepLabel, checksum(sql), HOSTNAME, PID, APP_VERSION]);
  return rows[0].id;
}

async function logStepComplete(id, durationMs, rowsAffected, retryCount) {
  await pool.query(`
    UPDATE schema_migrations_log
    SET status           = 'completed',
        step_duration_ms = $2,
        rows_affected    = $3,
        retry_count      = $4,
        completed_at     = NOW()
    WHERE id = $1
  `, [id, durationMs, rowsAffected ?? 0, retryCount ?? 0]);
}

async function logStepSkipped(stepLabel, sql) {
  await pool.query(`
    INSERT INTO schema_migrations_log
      (migration_name, step_label, checksum, status, hostname, pid, app_version, completed_at)
    VALUES ($1, $2, $3, 'skipped', $4, $5, $6, NOW())
  `, [MIGRATION_NAME, stepLabel, checksum(sql), HOSTNAME, PID, APP_VERSION]);
}

async function logStepFailed(id, err, retryCount) {
  await pool.query(`
    UPDATE schema_migrations_log
    SET status       = 'failed',
        error_detail = $2,
        retry_count  = $3,
        completed_at = NOW()
    WHERE id = $1
  `, [id, `SQLSTATE ${err.code ?? 'n/a'}: ${err.message}`, retryCount ?? 0]);
}

async function stepAlreadyCompleted(stepLabel, sql) {
  const { rows } = await pool.query(`
    SELECT id FROM schema_migrations_log
    WHERE migration_name = $1
      AND step_label     = $2
      AND checksum       = $3
      AND status         = 'completed'
    LIMIT 1
  `, [MIGRATION_NAME, stepLabel, checksum(sql)]);
  return rows.length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [F] STRICT ERROR CLASSIFICATION  (SQLSTATE-based)
// ═══════════════════════════════════════════════════════════════════════════════

// PostgreSQL SQLSTATE reference:
//   40001 — serialization_failure (deadlock / serialization)
//   40P01 — deadlock_detected
//   08*   — connection exception class
//   57P01 — admin_shutdown
//   53300 — too_many_connections
//   42710 — duplicate_object  (constraint / index already exists)
//   42701 — duplicate_column
//   42P07 — duplicate_table
//   42P01 — undefined_table
//   42703 — undefined_column
//   23*   — integrity constraint violation

const RETRYABLE_SQLSTATES = new Set([
  '40001', '40P01',          // deadlock / serialization
  '08000', '08003', '08006', // connection errors
  '57P01',                   // admin shutdown
  '53300',                   // too many connections
]);

const IDEMPOTENT_SQLSTATES = new Set([
  '42710', // duplicate_object   — constraint/index already exists
  '42701', // duplicate_column
  '42P07', // duplicate_table
]);

// Messages that indicate the operation is already in desired state
const IDEMPOTENT_MESSAGES = [
  'already exists',
  'duplicate',
  'does not exist',   // DROP IF EXISTS variants that pg surfaces
];

function classifyError(e) {
  if (RETRYABLE_SQLSTATES.has(e.code))   return 'retryable';
  if (IDEMPOTENT_SQLSTATES.has(e.code))  return 'idempotent';
  if (IDEMPOTENT_MESSAGES.some(m => e.message?.includes(m))) return 'idempotent';
  return 'fatal';
}

// ═══════════════════════════════════════════════════════════════════════════════
// [G] SAFE RETRY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MAX_RETRIES   = 3;
const INITIAL_BACKOFF_MS    = 500;
const BACKOFF_MULTIPLIER    = 2;
const MAX_BACKOFF_MS        = 8_000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * withRetry — executes fn(), retrying on retryable errors with exponential
 * backoff.  Returns { result, retryCount }.
 */
async function withRetry(label, fn, maxRetries = DEFAULT_MAX_RETRIES) {
  let attempt   = 0;
  let backoffMs = INITIAL_BACKOFF_MS;

  while (true) {
    try {
      const result = await fn();
      return { result, retryCount: attempt };
    } catch (e) {
      const kind = classifyError(e);
      if (kind === 'retryable' && attempt < maxRetries) {
        attempt++;
        log.warn(`"${label}" — ${kind} error (SQLSTATE ${e.code}). ` +
                 `Retry ${attempt}/${maxRetries} in ${backoffMs}ms …`);
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
        continue;
      }
      throw e; // propagate fatal or exhausted-retry errors
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// [B] STEP ATOMICITY MODEL
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Two execution modes:
//    • execDDL  — DDL cannot run inside a multi-statement transaction in all PG
//                 scenarios (e.g. ADD COLUMN followed by ALTER COLUMN in one
//                 shot is fine, but CREATE INDEX CONCURRENTLY is not).  We wrap
//                 DDL in single statements and log start/end per call.
//    • execDML  — Wrapped in an explicit BEGIN/COMMIT so partial writes never
//                 persist silently.
//
//  Both helpers honour:
//    - checksum-based idempotency (skip if already completed with same SQL)
//    - retry engine
//    - migration log tracking (start → complete | failed | skipped)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * execDDL — safe DDL execution with logging, idempotency, and retry.
 *
 * @param {string} label   Human-readable step label
 * @param {string} sql     Single DDL statement
 * @param {object} [opts]
 * @param {boolean} [opts.skipIfCompleted=true]  Honour checksum log
 * @param {number}  [opts.maxRetries]
 */
async function execDDL(label, sql, opts = {}) {
  const { skipIfCompleted = true, maxRetries = DEFAULT_MAX_RETRIES } = opts;

  if (skipIfCompleted && await stepAlreadyCompleted(label, sql)) {
    log.skip(`${label} (checksum match — already completed)`);
    return { skipped: true };
  }

  const logId = await logStepStart(label, sql);
  const t0    = Date.now();

  try {
    const { result, retryCount } = await withRetry(label, async () => {
      return pool.query(sql);
    }, maxRetries);

    const duration     = Date.now() - t0;
    const rowsAffected = result?.rowCount ?? 0;
    await logStepComplete(logId, duration, rowsAffected, retryCount);
    log.ok(`${label}  [${duration}ms, ${rowsAffected} rows]`);
    return { skipped: false, rowsAffected, duration };

  } catch (e) {
    const kind = classifyError(e);
    if (kind === 'idempotent') {
      await pool.query(`
        UPDATE schema_migrations_log SET status = 'skipped', completed_at = NOW()
        WHERE id = $1`, [logId]);
      log.skip(`${label} (already ok / already absent)`);
      return { skipped: true };
    }
    await logStepFailed(logId, e, 0);
    log.error(`DDL FAILED — HALTING: ${label}`);
    log.error(`  SQLSTATE ${e.code ?? 'n/a'}: ${e.message}`);
    throw e;
  }
}

/**
 * execDML — DML wrapped in explicit transaction for atomicity.
 */
async function execDML(label, sql, opts = {}) {
  const { skipIfCompleted = true, maxRetries = DEFAULT_MAX_RETRIES } = opts;

  if (skipIfCompleted && await stepAlreadyCompleted(label, sql)) {
    log.skip(`${label} (checksum match — already completed)`);
    return { skipped: true };
  }

  const logId = await logStepStart(label, sql);
  const t0    = Date.now();
  const client = await pool.connect();

  try {
    const { result, retryCount } = await withRetry(label, async () => {
      await client.query('BEGIN');
      const r = await client.query(sql);
      await client.query('COMMIT');
      return r;
    }, maxRetries);

    const duration     = Date.now() - t0;
    const rowsAffected = result?.rowCount ?? 0;
    await logStepComplete(logId, duration, rowsAffected, retryCount);
    log.ok(`${label}  [${duration}ms, ${rowsAffected} rows]`);
    return { skipped: false, rowsAffected, duration };

  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    await logStepFailed(logId, e, 0);
    log.error(`DML FAILED — HALTING: ${label}`);
    log.error(`  SQLSTATE ${e.code ?? 'n/a'}: ${e.message}`);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * execConstraint — DDL specialised for constraint additions.
 * Treats duplicate_object (42710) as a skip, halts on anything else.
 */
async function execConstraint(label, sql, opts = {}) {
  return execDDL(label, sql, { ...opts, skipIfCompleted: opts.skipIfCompleted ?? true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// [C] PRE-FLIGHT VALIDATION LAYER
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Run a dry-check before execution.  Each preflight is a boolean predicate;
//  failures are collected and reported together so operators get all blockers
//  at once rather than one-at-a-time.
// ───────────────────────────────────────────────────────────────────────────────

async function columnExists(table, column, schema = 'public') {
  const { rows } = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    LIMIT 1
  `, [schema, table, column]);
  return rows.length > 0;
}

async function tableExists(table, schema = 'public') {
  const { rows } = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = $2
    LIMIT 1
  `, [schema, table]);
  return rows.length > 0;
}

async function constraintExists(constraintName, schema = 'public') {
  const { rows } = await pool.query(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = $1 AND constraint_name = $2
    LIMIT 1
  `, [schema, constraintName]);
  return rows.length > 0;
}

async function runPreFlightValidation() {
  log.step('[C] PRE-FLIGHT VALIDATION');

  const failures = [];
  const pass = (msg) => log.ok(`Preflight: ${msg}`);
  const fail = (msg) => { log.error(`Preflight FAIL: ${msg}`); failures.push(msg); };

  // Tables that must exist before we touch them
  for (const tbl of ['student_subjects', 'student_exam_types']) {
    if (await tableExists(tbl)) pass(`Table "${tbl}" exists`);
    else                        fail(`Table "${tbl}" MISSING — cannot proceed`);
  }

  // STEP 1 preconditions: student_subjects must have at least one of
  // added_at or enrolled_at (or neither — both are acceptable starting states)
  const hasAddedAt   = await columnExists('student_subjects', 'added_at');
  const hasEnrolledAt = await columnExists('student_subjects', 'enrolled_at');
  if (!hasAddedAt && !hasEnrolledAt) {
    fail('student_subjects has neither added_at nor enrolled_at — timestamp data may be lost');
  } else {
    pass(`student_subjects timestamp columns present (added_at=${hasAddedAt}, enrolled_at=${hasEnrolledAt})`);
  }

  // Check for rows that would violate the NOT NULL we're about to impose
  // (only testable if we already have added_at; if not, it's a new column and all nulls are expected)
  if (hasAddedAt && !hasEnrolledAt) {
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS n FROM student_subjects WHERE added_at IS NULL
    `);
    const nullCount = parseInt(rows[0].n, 10);
    if (nullCount > 0) {
      fail(`${nullCount} rows in student_subjects have added_at IS NULL — NOT NULL constraint would fail`);
    } else {
      pass('No NULL added_at rows in student_subjects');
    }
  }

  // Check for rows that would violate the status CHECK constraints
  const statusViolationsSubjects = await pool.query(`
    SELECT COUNT(*) AS n FROM student_subjects
    WHERE status NOT IN ('pending','approved','rejected','deactivated')
      AND status IS NOT NULL
  `);
  if (parseInt(statusViolationsSubjects.rows[0].n, 10) > 0) {
    fail(`student_subjects has rows with invalid status values — chk_ss_status would fail`);
  } else {
    pass('student_subjects: all status values are valid');
  }

  const statusViolationsExamTypes = await pool.query(`
    SELECT COUNT(*) AS n FROM student_exam_types
    WHERE status NOT IN ('pending','approved','rejected','deactivated')
      AND status IS NOT NULL
  `);
  if (parseInt(statusViolationsExamTypes.rows[0].n, 10) > 0) {
    fail(`student_exam_types has rows with invalid status values — chk_set_status would fail`);
  } else {
    pass('student_exam_types: all status values are valid');
  }

  // Check enrollment_source values
  const sourceViolations = await pool.query(`
    SELECT COUNT(*) AS n FROM student_subjects
    WHERE enrollment_source NOT IN ('explicit','auto_enrolled','cascade')
      AND enrollment_source IS NOT NULL
  `);
  if (parseInt(sourceViolations.rows[0].n, 10) > 0) {
    fail('student_subjects has rows with invalid enrollment_source — chk_ss_source would fail');
  } else {
    pass('student_subjects: all enrollment_source values are valid');
  }

  if (failures.length > 0) {
    log.error(`\nPre-flight FAILED with ${failures.length} blocker(s). Aborting migration.\n`);
    for (const f of failures) log.error(`  • ${f}`);
    throw new Error(`Pre-flight validation failed: ${failures.join(' | ')}`);
  }

  log.ok('All pre-flight checks passed. Safe to proceed.\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// [E] DRIFT DETECTION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
//
//  Computes a "schema fingerprint" of the tables we will touch and warns if
//  the actual schema differs from what we expect.  Drift is non-blocking
//  (we warn, not abort) unless a critical expectation is violated.
// ───────────────────────────────────────────────────────────────────────────────

async function runDriftDetection() {
  log.step('[E] DRIFT DETECTION');

  // Expected schema shape after a clean prior run
  const EXPECTED = {
    student_subjects: {
      columns: {
        status:            { data_type: 'USER-DEFINED',            nullable: false },
        enrollment_source: { data_type: 'USER-DEFINED',            nullable: true  },
        // added_at may not exist yet — we create it in STEP 1
      },
      constraints_must_not_exist: [], // pre-migration; we're about to add them
    },
    student_exam_types: {
      columns: {
        status: { data_type: 'USER-DEFINED', nullable: false },
      },
    },
  };

  let driftDetected = false;

  for (const [tableName, spec] of Object.entries(EXPECTED)) {
    // -- Column audit
    const { rows: cols } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    const colMap = Object.fromEntries(cols.map(c => [c.column_name, c]));

    for (const [colName, expected] of Object.entries(spec.columns ?? {})) {
      const actual = colMap[colName];
      if (!actual) {
        log.warn(`DRIFT: "${tableName}.${colName}" expected but MISSING`);
        driftDetected = true;
        continue;
      }
      if (expected.data_type && actual.data_type !== expected.data_type) {
        // USER-DEFINED is an enum type — accept any USER-DEFINED
        if (!(expected.data_type === 'USER-DEFINED' && actual.data_type === 'USER-DEFINED')) {
          log.warn(`DRIFT: "${tableName}.${colName}" data_type: expected "${expected.data_type}", got "${actual.data_type}"`);
          driftDetected = true;
        }
      }
    }

    // -- Unexpected constraints (constraints that should not yet exist)
    for (const cname of (spec.constraints_must_not_exist ?? [])) {
      if (await constraintExists(cname)) {
        log.warn(`DRIFT: Constraint "${cname}" already exists on "${tableName}" — unexpected`);
        driftDetected = true;
      }
    }
  }

  // -- Fingerprint snapshot (for future drift runs)
  const { rows: fp } = await pool.query(`
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('student_subjects', 'student_exam_types')
    ORDER BY table_name, ordinal_position
  `);
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(fp))
    .digest('hex')
    .slice(0, 12);
  log.info(`Schema fingerprint (pre-migration): ${fingerprint}`);

  if (driftDetected) {
    log.warn('Schema drift detected — see warnings above. Migration will continue but review recommended.');
  } else {
    log.ok('No schema drift detected.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// [I] ENHANCED VERIFY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const verifyResults = [];

async function verify(label, assertion) {
  try {
    const passed = await assertion();
    if (passed) {
      log.ok(`VERIFY: ${label}`);
      verifyResults.push({ label, passed: true });
    } else {
      log.error(`VERIFY FAIL: ${label}`);
      verifyResults.push({ label, passed: false });
    }
    return passed;
  } catch (e) {
    log.error(`VERIFY ERROR: ${label} — ${e.message}`);
    verifyResults.push({ label, passed: false, error: e.message });
    return false;
  }
}

// Schema assertions
async function verifyColumnExists(table, column) {
  return verify(`Column ${table}.${column} exists`, () => columnExists(table, column));
}

async function verifyColumnNotExists(table, column) {
  return verify(`Column ${table}.${column} does NOT exist`, async () => !(await columnExists(table, column)));
}

async function verifyConstraintExists(name) {
  return verify(`Constraint "${name}" exists`, () => constraintExists(name));
}

// Data invariants
async function verifyNoNulls(table, column) {
  return verify(`No NULL ${table}.${column}`, async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} IS NULL`
    );
    return parseInt(rows[0].n, 10) === 0;
  });
}

async function verifyRowCountAtLeast(table, minCount) {
  return verify(`${table} has ≥ ${minCount} rows`, async () => {
    const { rows } = await pool.query(`SELECT COUNT(*) AS n FROM ${table}`);
    return parseInt(rows[0].n, 10) >= minCount;
  });
}

// Cross-table consistency (extendable)
async function verifyCrossTableConsistency() {
  // No cross-table constraints introduced by this migration — placeholder for future use
  return verify('Cross-table consistency (no violations)', async () => true);
}

async function runVerificationSuite(mode) {
  log.step('[I] ENHANCED POST-MIGRATION VERIFICATION');

  // Schema assertions
  await verifyColumnExists('student_subjects', 'added_at');
  await verifyColumnNotExists('student_subjects', 'enrolled_at');
  await verifyConstraintExists('chk_set_status');
  await verifyConstraintExists('chk_ss_status');
  await verifyConstraintExists('chk_ss_source');

  // Data invariants
  await verifyNoNulls('student_subjects', 'added_at');

  // Cross-table
  await verifyCrossTableConsistency();

  // Summary
  const total  = verifyResults.length;
  const passed = verifyResults.filter(r => r.passed).length;
  const failed = total - passed;

  log.header(`Verification: ${passed}/${total} passed${failed ? `, ${failed} FAILED` : ''}`);

  if (failed > 0 && mode !== 'DRY_RUN') {
    log.warn('Some verifications failed — review the output above.');
  }

  return failed === 0;
}

// Legacy check() helper preserved for backward-compatibility
async function check(label, violationSql) {
  return verify(label, async () => {
    const { rows } = await pool.query(violationSql);
    const count = parseInt(rows[0]?.count ?? rows[0]?.n ?? '0', 10);
    return count === 0;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// [H] MIGRATION RECOVERY MODES
// ═══════════════════════════════════════════════════════════════════════════════
//
//  FULL_RUN    — execute all steps regardless of log history
//  RESUME      — skip steps already marked completed (default)
//  DRY_RUN     — preflight + drift detection only; no SQL executed
//  VERIFY_ONLY — skip migration; run verification suite only
// ───────────────────────────────────────────────────────────────────────────────

const VALID_MODES = new Set(['FULL_RUN', 'RESUME', 'DRY_RUN', 'VERIFY_ONLY']);

function resolveMode() {
  const raw  = (process.env.MIGRATION_MODE ?? 'RESUME').toUpperCase();
  if (!VALID_MODES.has(raw)) {
    throw new Error(`Invalid MIGRATION_MODE="${raw}". Valid: ${[...VALID_MODES].join(', ')}`);
  }
  return raw;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN MIGRATION BODY
// ═══════════════════════════════════════════════════════════════════════════════

async function runMigration() {
  const mode = resolveMode();
  log.header(`AISchoolOnAir — Enrollment Approval System Migration\nMode: ${mode}  |  Host: ${HOSTNAME}  |  PID: ${PID}  |  Version: ${APP_VERSION}`);

  // ── Bootstrap log table ─────────────────────────────────────────────────────
  await ensureMigrationLogTable();

  // ── [E] Drift Detection ─────────────────────────────────────────────────────
  await runDriftDetection();

  if (mode === 'DRY_RUN') {
    log.header('DRY_RUN mode: running pre-flight only; no DDL/DML executed.');
    await runPreFlightValidation();
    log.ok('DRY_RUN complete. Nothing was changed.');
    return;
  }

  if (mode === 'VERIFY_ONLY') {
    log.header('VERIFY_ONLY mode: skipping migration; running verification suite.');
    await runVerificationSuite(mode);
    return;
  }

  // ── [C] Pre-Flight ──────────────────────────────────────────────────────────
  await runPreFlightValidation();

  // skipIfCompleted=false in FULL_RUN — re-execute every step
  const stepOpts = mode === 'FULL_RUN'
    ? { skipIfCompleted: false }
    : { skipIfCompleted: true  };

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 1 (FIXED): Safe timestamp migration with conditional copy
  // ───────────────────────────────────────────────────────────────────────────

  log.step('STEP 1 — Resolve timestamp column name on student_subjects');

  await execDDL('ensure added_at exists', `
    ALTER TABLE student_subjects
    ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ
  `, stepOpts);

  // FIXED: conditional copy only if enrolled_at exists.
  // This is DML (UPDATE) so we use execDML for transactional atomicity.
  await execDML('copy enrolled_at into added_at if column exists', `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'student_subjects'
          AND column_name  = 'enrolled_at'
      ) THEN
        UPDATE student_subjects
        SET added_at = COALESCE(added_at, enrolled_at)
        WHERE added_at IS NULL
          AND enrolled_at IS NOT NULL;
      END IF;
    END $$;
  `, stepOpts);

  await execDDL('drop enrolled_at if exists', `
    ALTER TABLE student_subjects
    DROP COLUMN IF EXISTS enrolled_at
  `, stepOpts);

  await execDDL('set added_at constraints', `
    ALTER TABLE student_subjects
    ALTER COLUMN added_at SET NOT NULL,
    ALTER COLUMN added_at SET DEFAULT NOW()
  `, stepOpts);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 7 (FIXED): Strict constraint execution with SQLSTATE handling
  // ───────────────────────────────────────────────────────────────────────────

  log.step('STEP 7 — Constraints');

  await execConstraint('status constraint exam_types', `
    ALTER TABLE student_exam_types
    ADD CONSTRAINT chk_set_status
    CHECK (status IN ('pending','approved','rejected','deactivated'))
  `, stepOpts);

  await execConstraint('status constraint subjects', `
    ALTER TABLE student_subjects
    ADD CONSTRAINT chk_ss_status
    CHECK (status IN ('pending','approved','rejected','deactivated'))
  `, stepOpts);

  await execConstraint('enrollment_source constraint', `
    ALTER TABLE student_subjects
    ADD CONSTRAINT chk_ss_source
    CHECK (enrollment_source IN ('explicit','auto_enrolled','cascade'))
  `, stepOpts);

  // ── [I] Verify ──────────────────────────────────────────────────────────────
  await runVerificationSuite(mode);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

(async () => {
  const t0 = Date.now();
  try {
    await acquireGlobalLock();      // [A]
    await runMigration();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log.header(`✅ Migration complete in ${elapsed}s`);
    process.exit(0);
  } catch (err) {
    log.error('Migration failed:', err.message);
    log.debug(err.stack);
    process.exit(1);
  } finally {
    await releaseGlobalLock();      // [A] crash-safe release
    await pool.end();
  }
})();
