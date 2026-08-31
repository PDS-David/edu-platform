-- migration_024_remove_duplicate_enrollment_source_constraints.sql
--
-- FIXES A LIVE BUG THAT MIGRATION_023 ONLY PARTIALLY FIXED. Confirmed via a
-- second live log capture, taken AFTER migration_023 had already run
-- successfully:
--
--   [schools] POST /students/:studentId/assign-exam-type new row for
--   relation "student_subjects" violates check constraint
--   "student_subjects_enrollment_source_check"
--
-- The constraint NAME actually changed between the first log capture
-- (chk_ss_source, fixed by migration_023) and this second one
-- (student_subjects_enrollment_source_check) — meaning there were TWO
-- separate CHECK constraints on student_subjects.enrollment_source the
-- whole time, both enforcing the old, narrower value list. Widening one
-- did nothing for the other.
--
-- A full search of every migration file and script in this repository
-- (database/*.sql, server/scripts/*.js) turns up zero references to
-- "student_subjects_enrollment_source_check" anywhere. This constraint
-- was created outside the tracked migration system entirely — most likely
-- a manual ALTER TABLE run directly against the database at some point,
-- never committed anywhere. This means the migration folder cannot be
-- fully trusted as a complete map of this table's actual constraints.
--
-- SAFETY MODEL, deliberately more defensive than migration_023: rather
-- than naming a second known constraint and hoping that's really the only
-- other one, this dynamically finds and drops EVERY check constraint
-- currently attached to student_subjects.enrollment_source, regardless of
-- name or origin, then adds back exactly one canonical constraint. This
-- guards against a third undiscovered duplicate doing the same thing
-- again. Cannot invalidate any existing row for the same reason
-- migration_023 couldn't — every row already satisfies the narrower list,
-- which remains a subset of the final, widened one.

DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT DISTINCT con.conname
    FROM pg_constraint con
    JOIN pg_class rel      ON rel.oid = con.conrelid
    JOIN pg_attribute att  ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'student_subjects'
      AND att.attname = 'enrollment_source'
      AND con.contype = 'c'  -- check constraints only
  LOOP
    EXECUTE format('ALTER TABLE student_subjects DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'Dropped stale enrollment_source check constraint: %', con.conname;
  END LOOP;
END $$;

ALTER TABLE student_subjects
  ADD CONSTRAINT chk_ss_source
  CHECK (enrollment_source IN ('explicit', 'auto_enrolled', 'cascade', 'admin_assigned'));

-- Sanity check to run manually after this migration — confirm exactly ONE
-- check constraint now exists on this column, and it allows all 4 values:
--
-- SELECT con.conname, pg_get_constraintdef(con.oid)
--   FROM pg_constraint con
--   JOIN pg_class rel     ON rel.oid = con.conrelid
--   JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
--  WHERE rel.relname = 'student_subjects' AND att.attname = 'enrollment_source'
--    AND con.contype = 'c';
--
-- Expect exactly one row: chk_ss_source.
