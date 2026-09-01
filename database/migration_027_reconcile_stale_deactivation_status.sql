-- migration_027_reconcile_stale_deactivation_status.sql
--
-- One-time data correction for rows written by the assign-exam-type
-- reassignment bug fixed in commit 9e63170 (fix(student-enrollment):
-- make exam-type/subject changes reflect on student portal).
--
-- Before that fix, deactivating a student's subject/board only ever
-- flipped is_active to false and left status = 'approved' untouched.
-- Every student-facing read (my-subjects, my-boards, past papers,
-- topics, subtopics, analytics) filters on status = 'approved', not
-- is_active — so any row written by the old code path is a "zombie":
-- the admin side correctly shows it as removed, but the student portal
-- still shows it, because the column that actually gates visibility
-- was never touched.
--
-- New writes since the fix are correct (both columns set together).
-- This migration only needs to run ONCE, to clean up rows written
-- before the fix existed. Confirmed live: a student reduced from 14 to
-- 9 NECO subjects pre-fix, then had NECO removed entirely post-fix —
-- the 9 that were still active at removal time deactivated correctly;
-- the 5 already-inactive zombie rows from the earlier trim were
-- untouched by that removal (its cascade only updates
-- is_active = true rows) and kept showing on his portal.
--
-- SAFETY MODEL: purely corrective. Only touches rows that are already
-- is_active = false — never flips is_active itself, never touches any
-- currently-active enrollment. A row that's already internally
-- consistent (is_active/status agree) is left alone.

BEGIN;

UPDATE student_subjects
   SET status = 'deactivated'
 WHERE is_active = false
   AND status = 'approved';

UPDATE student_exam_types
   SET status = 'deactivated'
 WHERE is_active = false
   AND status = 'approved';

-- Sanity check before committing
SELECT
  (SELECT COUNT(*) FROM student_subjects   WHERE is_active = false AND status = 'approved') AS should_be_0_subjects,
  (SELECT COUNT(*) FROM student_exam_types WHERE is_active = false AND status = 'approved') AS should_be_0_exam_types;

-- Expect both counts = 0. If they match, COMMIT.
-- COMMIT;
-- ROLLBACK;
