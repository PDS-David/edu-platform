-- migration_school_tenancy.sql
--
-- FIRST SLICE of school multi-tenancy for AISchoolOnair.
--
-- SAFETY MODEL: everything here is purely ADDITIVE.
--   - One new table (schools). Does not touch any existing table.
--   - One new nullable column on users (school_id). Existing rows get NULL,
--     which means every current standalone teacher/student/admin account is
--     completely unaffected — no existing query filters on this column, so
--     nothing in the live app changes behavior until code is written that
--     explicitly reads it.
--   - One new enum value on enum_users_role ('school_admin'). Postgres
--     allows adding enum values without touching existing rows.
--
-- WHAT THIS MIGRATION DOES NOT DO (deliberately, for this first slice):
--   - Does NOT scope any existing query by school_id.
--   - Does NOT change how teachers/students/classes currently work.
--   - Does NOT touch subjects, questions, classes, or any content table.
--
-- Run this the same way as every other migration this session: inside a
-- transaction, with a sanity-check SELECT before COMMIT, against a database
-- you have just taken a fresh pg_dump backup of. Test on staging first if
-- a staging database exists.

BEGIN;

-- 1. New role value — additive, does not affect existing 'student'/'teacher'/'admin' rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_users_role' AND e.enumlabel = 'school_admin'
  ) THEN
    ALTER TYPE enum_users_role ADD VALUE 'school_admin';
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. New schools table
CREATE TABLE IF NOT EXISTS schools (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  join_code     VARCHAR(20)  NOT NULL UNIQUE,   -- students/teachers join with this, same pattern as classes.join_code
  address       TEXT,
  contact_email VARCHAR(255),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_by    UUID         REFERENCES users(id) ON DELETE SET NULL, -- the school_admin who registered it
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schools_join_code ON schools(join_code);

-- 3. Nullable school_id on users — NULL means "not part of a school tenant",
--    which is the default and current state for every existing account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id) WHERE school_id IS NOT NULL;

-- Sanity check before committing — confirm nothing existing was disturbed
SELECT
  (SELECT COUNT(*) FROM users) AS total_users_unchanged_count,
  (SELECT COUNT(*) FROM users WHERE school_id IS NOT NULL) AS users_assigned_to_school_should_be_0,
  (SELECT COUNT(*) FROM schools) AS schools_should_be_0;

-- Expect: users_assigned_to_school_should_be_0 = 0, schools_should_be_0 = 0.
-- If both are 0, nothing existing changed and the new structures are ready.
-- COMMIT;
-- ROLLBACK;
