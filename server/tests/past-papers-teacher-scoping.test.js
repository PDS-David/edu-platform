'use strict';
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Regression coverage for the 2026-08-27 "teachers see past papers that don't
// belong to them" complaint from tenant-school users.
//
// Root cause: GET /api/past-papers already restricted STUDENTS to their own
// enrolled exam board(s) + registered subject(s) (see the exam-type-mismatch
// fix comment on that route), but applied NO restriction at all to teachers —
// a teacher assigned only e.g. Mathematics could browse every subject's past
// papers platform-wide, same as an unauthenticated visitor.
//
// Fix: scope a teacher to their teacher_subjects assignments (the same table
// school_admins use to assign subjects to teachers — schoolRoutes.js POST
// /me/teachers/:id/subjects, and the same table resourceRoutes.js already
// uses to scope resource uploads), applied to both the listing (GET /) and
// the direct-download endpoint (GET /:id/download) — mirroring exactly how
// the existing student restriction covers both.
//
// Deliberately NOT fail-closed like the student check: a teacher with zero
// teacher_subjects rows (not yet migrated onto the subject-assignment
// feature, which shipped the same day as this fix) keeps seeing everything,
// so this doesn't lock out every existing teacher the moment it ships.
//
// These tests assert against the route source directly, matching the
// existing convention in onboarding-preferences.test.js and
// access-control.test.js, since this repo has no Sequelize/DB mocking
// harness set up for live-query tests.
// ─────────────────────────────────────────────────────────────────────────────

const SRC_PATH = path.join(__dirname, '../routes/pastPaperRoutes.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

// Isolate the GET / listing handler and the GET /:id/download handler bodies.
const listMatch = src.match(
  /router\.get\(\s*['"`]\/['"`][\s\S]*?\n\}\);\s*\n/
);
const downloadMatch = src.match(
  /router\.get\(\s*['"`]\/:id\/download['"`][\s\S]*?\n\}\);\s*\n/
);
const listSrc     = listMatch ? listMatch[0] : '';
const downloadSrc = downloadMatch ? downloadMatch[0] : '';

describe('GET /api/past-papers — teacher subject scoping regression', () => {
  test('listing handler exists and is found in pastPaperRoutes.js', () => {
    expect(listSrc.length).toBeGreaterThan(0);
  });

  test('download handler exists and is found in pastPaperRoutes.js', () => {
    expect(downloadSrc.length).toBeGreaterThan(0);
  });

  test('listing checks req.user.role === \'teacher\'', () => {
    expect(listSrc).toMatch(/req\.user\?\.role\s*===\s*['"`]teacher['"`]/);
  });

  test('listing queries teacher_subjects scoped to the calling teacher and is_active', () => {
    expect(listSrc).toMatch(
      /FROM teacher_subjects WHERE teacher_id\s*=\s*:teacherId AND is_active\s*=\s*true/
    );
  });

  test('listing does NOT hard-fail-closed for a teacher with no assignments (opt-in only)', () => {
    // The student branch fails closed (`return res.json({ success: true, data: [] })`
    // when boardCodes/subjectIds are empty). The teacher branch must NOT do
    // the equivalent for an empty teacherSubjectIds — it should just skip
    // adding the filter condition, not return early.
    const teacherBranchMatch = listSrc.match(
      /if \(req\.user\?\.role === ['"`]teacher['"`]\) \{[\s\S]*?\n {4}\}/
    );
    expect(teacherBranchMatch).not.toBeNull();
    expect(teacherBranchMatch[0]).not.toMatch(/return res\.json/);
  });

  test('download handler checks req.user.role === \'teacher\'', () => {
    expect(downloadSrc).toMatch(/req\.user\?\.role\s*===\s*['"`]teacher['"`]/);
  });

  test('download handler rejects a teacher whose assigned subjects don\'t include this paper\'s subject', () => {
    expect(downloadSrc).toMatch(/status\(403\)/);
    expect(downloadSrc).toMatch(/not available for your assigned subject/i);
  });

  test('neither handler uses the broken ANY(:param) pattern for the new teacher_subjects queries', () => {
    const codeOnly = (listSrc + downloadSrc)
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/ANY\s*\(\s*:teacherSubjectIds/i);
  });
});
