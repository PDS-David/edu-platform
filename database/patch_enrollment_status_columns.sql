-- patch_enrollment_status_columns.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- EP-11 remediation: adds the status and enrollment_source columns that the
-- runtime enrollment code depends on but that no prior migration DDL creates.
--
-- BACKGROUND
-- The run_enrollment_approval_migration.js (EP-03 series) adds CHECK constraints
-- chk_set_status, chk_ss_status, chk_ss_source — but assumes the columns already
-- exist.  The table-creation DDL in run_complete_migration.js and
-- migration_004_student_subjects.sql never issued ADD COLUMN for these columns.
-- The production database has them (added out-of-band), but a fresh environment
-- or disaster-recovery run from source would fail at every enrollment INSERT and
-- every status-filtered SELECT.
--
-- WHAT THIS PATCH DOES
--   1. Adds student_subjects.status            (TEXT, DEFAULT 'approved')
--   2. Adds student_subjects.enrollment_source (TEXT, DEFAULT 'explicit')
--   3. Adds student_exam_types.status          (TEXT, DEFAULT 'approved')
--   4. Back-fills NULLs on existing rows (idempotent; no-op if values present)
--   5. Sets NOT NULL after back-fill (idempotent via DO block)
--
-- SAFETY
--   All statements use ADD COLUMN IF NOT EXISTS — safe to run on a database
--   that already has the columns (production).  Re-running produces no change.
--
-- DOES NOT
--   - Add CHECK constraints (those are owned by run_enrollment_approval_migration.js)
--   - Touch any other table
--   - Change any existing data values
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. student_subjects ──────────────────────────────────────────────────────

ALTER TABLE student_subjects
  ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS enrollment_source TEXT DEFAULT 'explicit';

-- Back-fill any NULLs that exist on rows written before this patch.
UPDATE student_subjects
SET status = 'approved'
WHERE status IS NULL;

UPDATE student_subjects
SET enrollment_source = 'explicit'
WHERE enrollment_source IS NULL;

-- Apply NOT NULL now that all rows are populated.
-- Wrapped in a DO block so re-runs are safe (altering a NOT NULL column
-- that is already NOT NULL is a no-op in Postgres, but guarding anyway).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'student_subjects'
      AND column_name  = 'status'
      AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE student_subjects ALTER COLUMN status SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'student_subjects'
      AND column_name  = 'enrollment_source'
      AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE student_subjects ALTER COLUMN enrollment_source SET NOT NULL;
  END IF;
END $$;

-- ── 2. student_exam_types ────────────────────────────────────────────────────

ALTER TABLE student_exam_types
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- Back-fill NULLs.
UPDATE student_exam_types
SET status = 'approved'
WHERE status IS NULL;

-- Apply NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'student_exam_types'
      AND column_name  = 'status'
      AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE student_exam_types ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

-- ── 3. Verification ──────────────────────────────────────────────────────────
-- Run the queries below to confirm after applying this patch:
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   IN ('student_subjects', 'student_exam_types')
--    AND column_name  IN ('status', 'enrollment_source')
--  ORDER BY table_name, column_name;
--
-- Expected: 3 rows, all is_nullable = 'NO', defaults present.
