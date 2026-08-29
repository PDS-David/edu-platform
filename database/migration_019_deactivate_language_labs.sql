-- migration_019_deactivate_language_labs.sql
--
-- Per explicit decision (2026-08-28): the three Language Lab boards are
-- removed from the exam-type list. Confirmed live (2026-08-28): all three
-- have ZERO students, of ANY status, ever -- not just currently active
-- (student_exam_types WHERE exam_board_id IN (10,11,12) returns no rows at
-- all, any status). No student enrollment or student data exists to lose.
--
--   id=10 code=LANG_EN "Language Lab – English"  (8 subjects)
--   id=11 code=LANG_FR "Language Lab – French"   (8 subjects)
--   id=12 code=LANG_YO "Language Lab – Yoruba"   (8 subjects)
--
-- WHY DEACTIVATE, NOT DELETE: unlike migration_018's three boards (which
-- had zero subjects too, so a hard delete had nothing to reconcile), these
-- three have 24 subject rows combined that may have teacher-created
-- content attached (topics, notes, resources, questions) even with zero
-- student enrollment. Deactivating preserves that content and is fully
-- reversible; deleting would not be. Matches the exact cascade pattern
-- migration_016 already used for board 5 (deactivate subjects, then the
-- board), which itself matches the app's own existing convention in
-- catalogRoutes.js's DELETE /types/:id.
--
-- SAFETY MODEL: same shape as migration_016 -- narrowly scoped UPDATEs by
-- exam_board_id IN (10,11,12), guarded by is_active = true, idempotent.
-- Touches no other board, no user data.
--
-- Run inside a transaction, sanity-check before COMMIT, against a database
-- you've just pg_dump'd.

BEGIN;

-- Re-confirm zero students of ANY status on all three boards right now --
-- if this returns non-zero, STOP and ROLLBACK.
SELECT COUNT(*) AS lang_lab_students_any_status_should_be_0
  FROM student_exam_types WHERE exam_board_id IN (10, 11, 12);

UPDATE subjects SET is_active = false, updated_at = NOW()
 WHERE exam_board_id IN (10, 11, 12) AND is_active = true;

UPDATE exam_boards SET is_active = false, updated_at = NOW()
 WHERE id IN (10, 11, 12) AND is_active = true;

-- Sanity check before committing.
SELECT id, code, name, is_active FROM exam_boards WHERE id IN (10, 11, 12);
SELECT COUNT(*) AS lang_lab_subjects_still_active_should_be_0
  FROM subjects WHERE exam_board_id IN (10, 11, 12) AND is_active = true;

-- COMMIT;
-- ROLLBACK;
