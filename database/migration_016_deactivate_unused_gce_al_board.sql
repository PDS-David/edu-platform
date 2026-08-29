-- migration_016_deactivate_unused_gce_al_board.sql
--
-- Part of the fix for the exam-board duplicate-name confusion between
-- exam_board_id=5 (code=GCE_AL, "GCE A' Levels") and exam_board_id=14
-- (code=ALEVEL, "A-LEVELS") that caused the original Business Studies
-- mix-up. Confirmed live (2026-08-28): board 5 has ZERO active students
-- (student_exam_types WHERE exam_board_id=5 AND is_active=true returns no
-- rows), while board 14 has 3, including two at the tenant that reported
-- the original bug. Board 5 is in the canonical seed list
-- (server/scripts/run_complete_migration.js); board 14 is not — but board
-- 14 is the one with real, current usage, so it stays as-is. This
-- migration only removes board 5 from future admin pickers, since it's
-- the one causing confusion while genuinely unused.
--
-- WHY DEACTIVATE, NOT DELETE OR MERGE: deactivating is fully reversible
-- (flip is_active back to true) and touches no existing row's identity or
-- history. Deleting would be irreversible; merging board 5's (nonexistent)
-- history into board 14 is a bigger, riskier operation than what's needed
-- to just stop the picker confusion.
--
-- CASCADE BEHAVIOUR MATCHES EXISTING APP CONVENTION, NOT INVENTED HERE:
-- server/routes/catalogRoutes.js's DELETE /types/:id endpoint (the
-- App Admin UI's own "Delete" action on an exam type, wired in
-- client/src/pages/AdminDashboard.jsx) already deactivates every subject
-- under a board before deactivating the board itself, rather than leaving
-- the board's subjects untouched. This migration replicates that exact
-- same two-step pattern via SQL (for a reviewable, transactional run)
-- instead of exercising the admin UI directly. Confirmed safe: no FK
-- cascade, no row deletion anywhere tied to exam_boards.is_active or
-- subjects.is_active — every consumer of these flags (catalogRoutes.js,
-- schoolRoutes.js, studentRoutes.js, examBoardRoutes.js, courseTools.js,
-- roleMiddleware.js) only ever filters WHERE is_active = true for listing/
-- selection purposes, never as a delete/cascade trigger itself.
--
-- SAFETY MODEL: two UPDATEs, both narrowly scoped by exam_board_id = 5,
-- guarded by is_active = true so this is idempotent (safe to re-run,
-- no-op if already applied). Touches no other board, no other subject,
-- no student/enrollment data at all.
--
-- Run inside a transaction, sanity-check before COMMIT (including a
-- fresh re-check that board 5 genuinely still has zero active students —
-- don't rely solely on the 2026-08-28 figure if time has passed), against
-- a database you've just pg_dump'd.

BEGIN;

-- Re-confirm zero active students on board 5 RIGHT NOW, before touching
-- anything -- if this returns a non-zero count, STOP and ROLLBACK; do not
-- proceed with deactivation.
SELECT COUNT(*) AS board_5_active_students_should_be_0
  FROM student_exam_types WHERE exam_board_id = 5 AND is_active = true;

UPDATE subjects SET is_active = false, updated_at = NOW()
 WHERE exam_board_id = 5 AND is_active = true;

UPDATE exam_boards SET is_active = false, updated_at = NOW()
 WHERE id = 5 AND is_active = true;

-- Sanity check before committing.
SELECT id, code, name, is_active FROM exam_boards WHERE id = 5;
SELECT COUNT(*) AS board_5_subjects_still_active_should_be_0
  FROM subjects WHERE exam_board_id = 5 AND is_active = true;

-- COMMIT;
-- ROLLBACK;
