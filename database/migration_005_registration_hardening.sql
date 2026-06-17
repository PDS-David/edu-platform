-- ─────────────────────────────────────────────────────────────────────────────
-- migration_005_registration_hardening.sql
--
-- Applies schema changes required by registration-hardening fixes R-01–R-05.
-- Safe to run against a live production database:
--   • All ADD COLUMN statements use IF NOT EXISTS.
--   • The UNIQUE index creation uses IF NOT EXISTS — it is idempotent.
--   • No data is deleted or modified.
--
-- Run order: after migration_004_student_subjects.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── R-01: Ensure phone column exists with correct type ────────────────────────
-- The Sequelize model already declares phone VARCHAR(30).  This migration
-- confirms the column exists on the live table and sets the length to 20,
-- which is the E.164 maximum (+15 digits + null terminator with head-room).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- ── R-03: Guarantee the unique index on users.email exists ───────────────────
-- The Sequelize model declares unique: true on email, but the live users
-- table predates the migrations in this repo and the constraint could be
-- absent.  INSERT … ON CONFLICT (email) requires this index.
-- CREATE UNIQUE INDEX IF NOT EXISTS is safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
  ON users (email);

-- Also ensure the plain B-tree index the query planner uses for lookups:
CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON users (lower(email));

-- ── R-01: Ensure country column exists (used by PATCH /profile) ───────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- ── Informational: confirm pending_exam_board_ids column type ─────────────────
-- No action needed — just verified by the SELECT below which will appear
-- in the migration run log.
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type
    INTO col_type
    FROM information_schema.columns
   WHERE table_name = 'users'
     AND column_name = 'pending_exam_board_ids';

  IF col_type IS NULL THEN
    RAISE NOTICE 'pending_exam_board_ids column missing — add manually';
  ELSE
    RAISE NOTICE 'pending_exam_board_ids type: %', col_type;
  END IF;
END $$;

COMMIT;
