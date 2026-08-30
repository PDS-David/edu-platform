-- migration_022_deactivate_leftover_gce_al_board.sql
--
-- Cleanup following confirmation (2026-08-30, live query) that migration_017
-- (board 14 "A-LEVELS" -> board 21 CAMBAL) and migration_021 (board 15
-- "Cambridge" -> board 21 CAMBAL) already ran successfully at some point
-- before this migration was written -- CAMBAL correctly shows 17 active
-- subjects (including Business Studies, id 210) and 4 active students, and
-- an orphan check (subjects/student_exam_types referencing a nonexistent
-- exam_board_id) returned zero rows both ways. Boards 14, 15, 23 (AQAAL),
-- and 24 (EDXAL) no longer exist in exam_boards at all -- confirmed already
-- empty at the time, safely removed via the Admin dashboard's own delete
-- flow (server/routes/catalogRoutes.js DELETE /types/:id then
-- /types/:id/permanent).
--
-- What's left: board 5 (code=GCE_AL, name="GCE A' Levels") is still
-- present and still is_active=true, but every one of its 17 subjects is
-- is_active=false, and it has 0 active students (confirmed live,
-- 2026-08-30). This is the same board migration_016/018 originally
-- intended to remove for being a confusing near-duplicate of CAMBAL's
-- name -- those two migrations assumed it had 0 subjects (true as of
-- 2026-08-28) and were never actually run before this board somehow
-- ended up with 17 (all inactive) subjects and got reactivated as a board
-- sometime after that. However it got here, it is fully unused today: an
-- orphan check already confirmed nothing references it or its subjects in
-- a way that would break if it disappeared, and none of its subjects are
-- even active, so it cannot be assigned to anyone through the app UI
-- either.
--
-- SAFETY MODEL: this DEACTIVATES only (is_active = false on the board;
-- its subjects are already inactive and are left untouched, not
-- re-verified/re-set here since they're confirmed already false). Not a
-- hard delete -- reversible, matches migration_016's original approach for
-- this exact board, and consistent with this repo's general preference to
-- deactivate first and hard-delete only later, separately, once truly
-- confirmed safe (as was done by hand via the Admin UI for boards 14/15/
-- 23/24). If a permanent delete is wanted later, the Admin dashboard's
-- own "Delete exam type" -> "Delete permanently" flow can be used on this
-- board once it shows as deactivated, the same way it was already used on
-- the other four.
--
-- Guarded to be a no-op if already deactivated, and to STOP (via the
-- pre-check) if the live data no longer matches what was just confirmed --
-- i.e. if it now has any active subject or active student, do not
-- proceed as written.
--
-- Run inside a transaction, sanity-check before COMMIT, against a
-- database you've just pg_dump'd -- same as every migration in this repo.

BEGIN;

-- Re-confirm board 5 is still fully unused right now -- if either of these
-- is non-zero, STOP and ROLLBACK; something has changed since 2026-08-30
-- and this migration must not proceed as written.
SELECT
  (SELECT COUNT(*) FROM subjects WHERE exam_board_id = 5 AND is_active = true) AS board_5_active_subjects_should_be_0,
  (SELECT COUNT(*) FROM student_exam_types WHERE exam_board_id = 5 AND is_active = true) AS board_5_active_students_should_be_0;

UPDATE exam_boards SET is_active = false, updated_at = NOW()
 WHERE id = 5 AND is_active = true;

-- Sanity check before committing.
SELECT id, code, name, is_active FROM exam_boards WHERE id = 5;
-- Expect: is_active = f. If so, COMMIT. If board_5_active_subjects_should_be_0
-- or board_5_active_students_should_be_0 above were non-zero, ROLLBACK instead
-- and report back rather than proceeding.

-- COMMIT;
-- ROLLBACK;
