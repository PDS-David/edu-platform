-- migration_023_widen_enrollment_source_constraint.sql
--
-- FIXES A LIVE BUG: school admins get "Could not assign exam type" on every
-- attempt (confirmed via server log, not guessed):
--
--   [schools] POST /students/:studentId/assign-exam-type new row for
--   relation "student_subjects" violates check constraint "chk_ss_source"
--
-- ROOT CAUSE: student_subjects.chk_ss_source (added by
-- server/scripts/run_enrollment_approval_migration.js, STEP 7) only allows
-- ('explicit','auto_enrolled','cascade') for enrollment_source. Phase 3's
-- work (server/constants/enrollmentConstants.js) later added a fourth
-- application-level value, 'admin_assigned', for exactly this endpoint
-- (POST /api/schools/students/:studentId/assign-exam-type) — but the
-- database constraint itself was never widened to match. Every admin-
-- assignment attempt has been failing on this constraint since Phase 3
-- shipped.
--
-- SAFETY MODEL: widens an existing CHECK constraint to allow one additional
-- already-in-use application value. Cannot invalidate any existing row —
-- every row currently satisfies the narrower constraint, which is a subset
-- of the wider one. Unlike a native Postgres ENUM type (see
-- migration_009's ALTER TYPE ADD VALUE restrictions), a CHECK constraint
-- can be dropped and re-added as plain, fully transaction-safe DDL — no
-- special restrictions apply here.
--
-- Also confirmed (read-only check, no migration needed): student_exam_types
-- has no enrollment_source column or constraint at all — only chk_set_status
-- (status IN ('pending','approved','rejected','deactivated')), which already
-- matches ENROLLMENT_STATUS's full value set with no drift. Not affected by
-- this bug.

BEGIN;

ALTER TABLE student_subjects DROP CONSTRAINT IF EXISTS chk_ss_source;

ALTER TABLE student_subjects
  ADD CONSTRAINT chk_ss_source
  CHECK (enrollment_source IN ('explicit', 'auto_enrolled', 'cascade', 'admin_assigned'));

COMMIT;

-- Sanity check to run manually after this migration — confirm the
-- constraint now allows the new value and every existing row still passes:
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conname = 'chk_ss_source';
--
-- Expect: CHECK (enrollment_source = ANY (ARRAY['explicit'::text,
-- 'auto_enrolled'::text, 'cascade'::text, 'admin_assigned'::text]))
