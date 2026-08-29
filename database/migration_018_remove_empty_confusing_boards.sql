-- migration_018_remove_empty_confusing_boards.sql
--
-- Per explicit decision (2026-08-28, prompted by exam_boards audit query):
-- three boards are removed entirely as duplicative/confusing, with no
-- students or subjects to reconcile:
--
--   id=5  code=GCE_AL  "GCE A' Levels" -- already deactivated by
--                                         migration_016 (is_active=false),
--                                         0 subjects, 0 students then and
--                                         now. "There's no such thing as
--                                         GCE A' Levels" (explicit decision)
--                                         -- fully removing it, not just
--                                         leaving it deactivated.
--   id=23 code=AQAAL   "AQA A Level"   -- 0 subjects, 0 students. Not part
--                                         of what the platform actually
--                                         offers (explicit decision).
--   id=24 code=EDXAL   "Edexcel A Level" -- same: 0 subjects, 0 students,
--                                         not part of what's offered.
--
-- SAFETY MODEL: this is a genuine hard DELETE (not a deactivation like
-- migration_016/017 used) because, unlike those, there is nothing to lose --
-- zero subjects, zero students, zero downstream references of any kind.
-- Each DELETE is preceded by a re-check inside the transaction that the
-- board still has 0 subjects and 0 (any status, not just active)
-- student_exam_types rows right now -- if that's no longer true, STOP and
-- ROLLBACK; do not proceed on stale data from 2026-08-28.
--
-- exam_boards has no other inbound FK besides subjects.exam_board_id and
-- student_exam_types.exam_board_id (confirmed via schema definition in
-- server/scripts/run_complete_migration.js) -- with both at zero for all
-- three boards, the DELETE is unconstrained.
--
-- Run inside a transaction, sanity-check before COMMIT, against a database
-- you've just pg_dump'd.

BEGIN;

-- Re-confirm all three boards are still empty right now. Any non-zero
-- value here means STOP and ROLLBACK -- do not proceed.
SELECT
  (SELECT COUNT(*) FROM subjects WHERE exam_board_id = 5)             AS board5_subjects_should_be_0,
  (SELECT COUNT(*) FROM student_exam_types WHERE exam_board_id = 5)   AS board5_students_should_be_0,
  (SELECT COUNT(*) FROM subjects WHERE exam_board_id = 23)            AS board23_subjects_should_be_0,
  (SELECT COUNT(*) FROM student_exam_types WHERE exam_board_id = 23)  AS board23_students_should_be_0,
  (SELECT COUNT(*) FROM subjects WHERE exam_board_id = 24)            AS board24_subjects_should_be_0,
  (SELECT COUNT(*) FROM student_exam_types WHERE exam_board_id = 24)  AS board24_students_should_be_0;

DELETE FROM exam_boards WHERE id IN (5, 23, 24);

-- Sanity check before committing.
SELECT id, code, name FROM exam_boards WHERE id IN (5, 23, 24);
-- Expect: 0 rows.

-- COMMIT;
-- ROLLBACK;
