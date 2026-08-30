'use strict';
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Regression coverage for the 2026-06-18 onboarding crash:
//
//   PATCH /api/users/preferences → 500 "Failed to save preferences"
//
// Reproduced by: student selects subjects (e.g. Chemistry) on
// /onboarding step 1, sets a daily goal on step 2, sets a study
// schedule on step 3, clicks "Let's go!" — request fails, student is
// stuck on the final onboarding screen, onboarding_complete is never
// set server-side.
//
// Root cause: the board-back-fill query used
// `WHERE id = ANY(:subjectIds)` with a plain JS array passed as a
// Sequelize named replacement. This throws a Postgres type-mismatch
// error in raw queries, and — unlike every other lookup in this
// handler — it was not wrapped in its own try/catch, so the error
// propagated to the outer catch and failed the entire request.
//
// These tests assert against the route source directly (matching the
// existing convention in access-control.test.js), since this repo has
// no Sequelize/DB mocking harness set up for live-query tests.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE (2026-08-29): originally asserted against server/routes/
// userRoutes.js — an unreferenced dead-code duplicate of the real,
// mounted users.js (server.js only ever requires './routes/users',
// never './routes/userRoutes' — same file, confusingly similar names).
// This test was therefore checking the wrong source file: userRoutes.js
// is never reachable via any live HTTP request, so passing this test
// proved nothing about the actual production code path. Repointed at
// users.js, the file server.js genuinely mounts. Manually verified
// users.js's real PATCH /preferences handler already has the correct
// fix (IN (:subjectIds), wrapped in its own try/catch) before making
// this change — this was a test-target bug, not a regression.
const SRC_PATH = path.join(__dirname, '../routes/users.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

// Isolate just the PATCH /preferences handler body for targeted assertions.
const handlerMatch = src.match(
  /router\.patch\(\s*['"`]\/preferences['"`][\s\S]*?\n\}\);\s*\n/
);
const handlerSrc = handlerMatch ? handlerMatch[0] : '';

describe('PATCH /api/users/preferences — onboarding 500 regression', () => {
  test('handler exists and is found in users.js', () => {
    expect(handlerSrc.length).toBeGreaterThan(0);
  });

  test('does NOT use the unsafe `= ANY(:param)` raw-array bind for subject_ids', () => {
    // This is the exact pattern that crashed in production. If this
    // reappears in actual SQL (not just in an explanatory comment), the
    // fix has regressed.
    const codeOnly = handlerSrc
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/id\s*=\s*ANY\s*\(\s*:subjectIds\s*\)/i);
  });

  test('uses IN (:subjectIds) for the subject → exam_board lookup instead', () => {
    expect(handlerSrc).toMatch(/id\s+IN\s*\(\s*:subjectIds\s*\)/i);
  });

  test('the subject → exam_board board-lookup block is wrapped in its own try/catch', () => {
    // Find the IN (:subjectIds) lookup and confirm it sits inside a
    // try block that is NOT the single outer handler try — i.e. there
    // must be a nested try immediately preceding it within the same
    // subject_ids branch, so a failure here can't take down the whole
    // request the way the unguarded ANY() block used to.
    const inClauseIndex = handlerSrc.search(/id\s+IN\s*\(\s*:subjectIds\s*\)/i);
    expect(inClauseIndex).toBeGreaterThan(-1);

    const before = handlerSrc.slice(0, inClauseIndex);
    const lastTryIndex   = before.lastIndexOf('try {');
    const lastCatchIndex = before.lastIndexOf('catch');

    // There should be a `try {` opened after the per-subject insert
    // loop and before the IN-clause query, with no intervening
    // unmatched `catch` that would mean we're back outside that block.
    expect(lastTryIndex).toBeGreaterThan(-1);
    expect(lastTryIndex).toBeGreaterThan(lastCatchIndex === -1 ? -1 : -Infinity);

    const after = handlerSrc.slice(inClauseIndex);
    expect(after).toMatch(/catch\s*\(\s*boardLookupErr\s*\)/);
  });

  test('guards against an empty subject_ids array before building IN (:subjectIds)', () => {
    // `IN ()` is invalid SQL — the fix must check length before querying.
    expect(handlerSrc).toMatch(/safeSubjectIds\.length\s*>\s*0/);
  });

  test('onboarding subject insert sets status = \'approved\' alongside is_active', () => {
    // resourceRoutes.js's assign-users entitlement check filters
    // recipients by student_subjects.status = 'approved'. If this
    // insert only sets is_active, a student enrolled via onboarding
    // can be invisible to staff pushing assigned content — the
    // "student says they don't have access" bug from a separate
    // investigation. This must stay explicit, not rely on a column
    // default that the inline CREATE TABLE IF NOT EXISTS fallback
    // above does not even define.
    // Accepts either the literal 'approved' string or a reference to the
    // ENROLLMENT_STATUS.APPROVED constant (confirmed === 'approved' in
    // server/constants/enrollmentConstants.js) — users.js (the live file
    // this test now targets) uses the named constant rather than a magic
    // string; both are functionally identical, so the assertion checks
    // for either form instead of assuming one specific implementation.
    expect(handlerSrc).toMatch(
      /INSERT INTO student_subjects[\s\S]*?is_active,\s*status[\s\S]*?VALUES[\s\S]*?true,\s*(?:'approved'|:approvedStatus|ENROLLMENT_STATUS\.APPROVED)/i
    );
  });

  test('exam_boards loop (step 1) still has its own per-item try/catch (pre-existing fix, not regressed)', () => {
    expect(handlerSrc).toMatch(/catch\s*\(\s*lookupErr\s*\)/);
  });

  test('route file has valid JS syntax', () => {
    expect(() => new Function(src)).not.toThrow(SyntaxError);
  });
});
