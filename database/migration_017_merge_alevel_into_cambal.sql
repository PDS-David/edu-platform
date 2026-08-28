-- migration_017_merge_alevel_into_cambal.sql
--
-- Completes Prompt 2 (board 5 vs 14 vs 21 naming confusion). Per explicit
-- decision: board 14 (code=ALEVEL, name="A-LEVELS") merges into board 21
-- (code=CAMBAL, name="Cambridge GCE A' Level") rather than being renamed
-- to a name that would collide with 21's existing name.
--
-- CONFIRMED SAFE, SIMPLE CASE (2026-08-28): board 21 has ZERO subjects of
-- its own (SELECT ... WHERE exam_board_id = 21 returned 0 rows). This
-- means there is no competing subject catalog to reconcile by name --
-- board 14's 17 existing subject rows can be re-pointed to belong to
-- board 21 directly (ownership change only), rather than needing a
-- harder name-matched merge. Every existing reference to those subject
-- IDs (topics, resources, questions, quiz_attempts, notes, analytics,
-- etc. -- subjects.id is referenced across ~24 route files) keeps working
-- untouched, since the subject rows themselves don't change identity.
--
-- student_exam_types has UNIQUE(student_id, exam_board_id) (confirmed via
-- schema definition) -- the student-move step is guarded with NOT EXISTS
-- so it cannot violate that constraint, in the unlikely case any of
-- board 14's 3 students already also has a board-21 row.
--
-- SAFETY MODEL:
--   - Step 1 (subjects): simple UPDATE, no competing rows possible since
--     board 21 has none today. Idempotent (WHERE exam_board_id = 14 is a
--     no-op once already moved).
--   - Step 2 (students): guarded UPDATE, cannot violate the unique
--     constraint. Idempotent.
--   - Step 3 (board 14): deactivated (is_active = false), NOT deleted --
--     reversible, and consistent with how migration_016 handled board 5.
--   - Does not touch board 5 (already deactivated by migration_016).
--   - Does not rename or alter board 21 itself.
--
-- Run inside a transaction, sanity-check before COMMIT, against a
-- database you've just pg_dump'd.

BEGIN;

-- Re-confirm board 21 still has zero subjects right now -- if this
-- returns non-zero, STOP and ROLLBACK; the "simple case" assumption no
-- longer holds and this migration must not proceed as written.
SELECT COUNT(*) AS board_21_subjects_should_be_0
  FROM subjects WHERE exam_board_id = 21;

-- Step 1: move board 14's subjects to board 21.
UPDATE subjects SET exam_board_id = 21, updated_at = NOW()
 WHERE exam_board_id = 14;

-- Step 2: move board 14's students to board 21 (guarded against the
-- unique constraint).
UPDATE student_exam_types SET exam_board_id = 21
 WHERE exam_board_id = 14
   AND NOT EXISTS (
     SELECT 1 FROM student_exam_types set2
      WHERE set2.student_id = student_exam_types.student_id
        AND set2.exam_board_id = 21
   );

-- Step 3: deactivate the now-empty board 14 (reversible, not deleted).
UPDATE exam_boards SET is_active = false, updated_at = NOW()
 WHERE id = 14;

-- Sanity checks before committing.
SELECT COUNT(*) AS board_14_subjects_remaining_should_be_0
  FROM subjects WHERE exam_board_id = 14;
SELECT COUNT(*) AS board_14_students_remaining_should_be_0
  FROM student_exam_types WHERE exam_board_id = 14;
SELECT COUNT(*) AS board_21_subjects_should_be_17
  FROM subjects WHERE exam_board_id = 21;
SELECT COUNT(*) AS board_21_active_students_should_be_3
  FROM student_exam_types WHERE exam_board_id = 21 AND is_active = true;
SELECT id, code, name, is_active FROM exam_boards WHERE id IN (5, 14, 21);

-- COMMIT;
-- ROLLBACK;
