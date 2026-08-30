'use strict';
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Repo-wide regression guard: `= ANY(:namedParam)` with a plain JS array
// passed as a Sequelize NAMED replacement.
//
// This is the same root cause as the 2026-06-18 onboarding crash covered by
// onboarding-preferences.test.js (one call site, in server/routes/users.js).
// On 2026-08-27 the identical pattern was found independently broken in SIX more
// places across the codebase (notificationsRoutes.js, curriculumRoutes.js x3,
// questionsRoutes.js, teacherRoutes.js, memoryService.js, quizGenerator.js)
// plus two dev tools and a test file — none of which onboarding-preferences's
// narrowly-scoped test could have caught, since it only inspects
// server/routes/users.js's PATCH /preferences handler.
//
// Root cause (verified directly against Sequelize 6.35's replacement engine,
// not assumed): a named replacement whose value is a JS array is rendered as
// a parenthesized, comma-separated value list — e.g. ('a', 'b') — which is
// exactly the shape `IN (:param)` expects. `ANY(:param)` needs an actual
// array expression instead, so the substituted SQL is either a genuine parse
// error (2+ elements: `ANY('a', 'b')`), a malformed-array-literal error
// (1 element: `ANY('a')`), or empty parens (0 elements: `ANY()`) — broken in
// every case. `IN (:param)` is the correct, already-idiomatic replacement
// used throughout the rest of this codebase (see server/routes/users.js's
// own documented fix).
//
// This test scans every route/service/tool source file under server/ (this
// tests/ directory excluded, since its own fixture strings would self-match)
// for the anti-pattern, ignoring comments. It exists so that a future
// query — anywhere in the codebase — written with `ANY(:name)` fails CI
// immediately instead of shipping and failing silently in production days or
// weeks later (several of the six 2026-08-27 instances had their errors
// caught and swallowed, so nothing crashed — the query just always returned
// empty/zero and nobody noticed).
// ─────────────────────────────────────────────────────────────────────────────

const SCAN_ROOT = path.join(__dirname, '..'); // server/
const SCAN_DIRS = ['routes', 'services', 'tools', 'controllers'];
const ANTI_PATTERN = /ANY\s*\(\s*:[a-zA-Z_]\w*/;

function listJsFilesRecursive(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(listJsFilesRecursive(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src) {
  return src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('No Sequelize named-replacement ANY(:param) anti-pattern (repo-wide)', () => {
  const filesToScan = SCAN_DIRS
    .map((d) => path.join(SCAN_ROOT, d))
    .filter((d) => fs.existsSync(d))
    .flatMap(listJsFilesRecursive);

  test('scan actually found source files to check (sanity check the scan itself works)', () => {
    expect(filesToScan.length).toBeGreaterThan(10);
  });

  test.each(filesToScan.map((f) => [path.relative(SCAN_ROOT, f), f]))(
    '%s does not use ANY(:namedParam) in an active query',
    (_relPath, fullPath) => {
      const codeOnly = stripComments(fs.readFileSync(fullPath, 'utf8'));
      expect(codeOnly).not.toMatch(ANTI_PATTERN);
    }
  );
});
