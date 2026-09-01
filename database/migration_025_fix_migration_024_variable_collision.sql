-- migration_025_fix_migration_024_variable_collision.sql
--
-- migration_024 crashed on its very first statement with:
--   ERROR: record "con" is not assigned yet
--   DETAIL: The tuple structure of a not-yet-assigned record is indeterminate.
--
-- ROOT CAUSE: migration_024's PL/pgSQL loop declared its record variable as
-- `con` (`DECLARE con RECORD;` / `FOR con IN SELECT ...`), and the driving
-- SELECT inside that same loop also referenced `pg_constraint` via a table
-- alias also named `con` (`FROM pg_constraint con`). Inside a PL/pgSQL FOR
-- loop, an identifier like `con.conname` is resolved against the OUTER
-- PL/pgSQL variable first, not the SQL alias in the query being evaluated to
-- populate that same variable -- so `con.conname`/`con.conkey` inside the
-- SELECT tried to read fields off the loop variable before it had been
-- assigned a first row, which is exactly the reported error. The query never
-- returned a row, so the loop body never ran, so nothing was ever dropped --
-- confirmed against a live query showing both pre-existing constraints
-- (chk_ss_source, student_subjects_enrollment_source_check) are still
-- exactly as they were before migration_024 was attempted. Nothing was
-- damaged by the failed attempt.
--
-- FIX: rename the loop variable to something that cannot collide with any
-- table alias in its own driving query (constraint_rec). Everything else --
-- the goal, dynamically discovering every check constraint on this column
-- regardless of name or origin, the final 4-value allowed list -- is
-- unchanged from migration_024's intent, which was correct; only the
-- variable name was broken.
--
-- SAFETY: cannot invalidate any existing row -- every row already satisfies
-- the narrower list, which remains a subset of the final widened one.
-- Wrapped in an explicit transaction with a sanity check before COMMIT,
-- matching every other migration in this repo -- migration_024 itself
-- skipped this, which is exactly why last time's failure left things
-- ambiguous. Not skipping it again.
--
-- Take a fresh backup first. Run the export and pg_dump as ONE line, not
-- two -- last attempt got mangled by copy-paste into separate commands:
--   export DATABASE_URL=$(grep -oP '(?<=^DATABASE_URL=).*' api.env) && pg_dump "$DATABASE_URL" --no-owner --no-acl -f backup_$(date +%Y%m%d_%H%M).sql

BEGIN;

DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  FOR constraint_rec IN
    SELECT DISTINCT con.conname
    FROM pg_constraint con
    JOIN pg_class rel      ON rel.oid = con.conrelid
    JOIN pg_attribute att  ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'student_subjects'
      AND att.attname = 'enrollment_source'
      AND con.contype = 'c'  -- check constraints only
  LOOP
    EXECUTE format('ALTER TABLE student_subjects DROP CONSTRAINT %I', constraint_rec.conname);
    RAISE NOTICE 'Dropped stale enrollment_source check constraint: %', constraint_rec.conname;
  END LOOP;
END $$;

ALTER TABLE student_subjects
  ADD CONSTRAINT chk_ss_source
  CHECK (enrollment_source IN ('explicit', 'auto_enrolled', 'cascade', 'admin_assigned'));

-- Sanity check before committing.
SELECT con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  JOIN pg_class rel     ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
 WHERE rel.relname = 'student_subjects' AND att.attname = 'enrollment_source'
   AND con.contype = 'c';

-- Expect EXACTLY ONE row: chk_ss_source, allowing all 4 values
-- ('explicit', 'auto_enrolled', 'cascade', 'admin_assigned'). If so, COMMIT.
-- If you see more than one row, or the wrong values, ROLLBACK and tell me.

-- COMMIT;
-- ROLLBACK;
