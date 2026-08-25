-- migration_007_school_classes.sql
--
-- PHASE 2 of the AISchoolonair phased plan: School-Owned Classes.
--
-- SAFETY MODEL: everything here is purely ADDITIVE, following the same
-- pattern as migration_school_tenancy.sql.
--   - Two new nullable columns on `classes` (school_id, created_by).
--     Existing rows get NULL for both, which is exactly their current
--     (teacher-owned, no school) state — no existing query filters on
--     either column, so nothing in the live app changes behavior until
--     code is written that explicitly reads them.
--   - `classes.teacher_id` loses its NOT NULL constraint. Loosening a
--     constraint cannot invalidate any existing row (every existing class
--     already has a non-null teacher_id) — this only permits *new* classes
--     to be created with teacher_id = NULL going forward, for school-owned
--     classes with no teacher assigned yet.
--
-- WHAT THIS MIGRATION DOES NOT DO (deliberately, for this slice):
--   - Does NOT touch class_memberships, subject_ids, join_code, or any
--     other existing column on classes.
--   - Does NOT change how server/routes/teacherRoutes.js's existing
--     teacher-owned class endpoints work — they never set or read
--     school_id/created_by, so they continue to create/read/update/delete
--     classes with school_id IS NULL exactly as before.
--
-- Run this the same way as every other migration this session: inside a
-- transaction, with a sanity-check SELECT before COMMIT, against a database
-- you have just taken a fresh pg_dump backup of
-- (pg_dump "$DATABASE_URL" --no-owner --no-acl -f backup_$(date +%Y%m%d_%H%M).sql
-- from /opt/aischoolonair; apt install -y postgresql-client first if needed).
-- Test on staging first if a staging database exists.

BEGIN;

-- 1. Nullable school_id on classes — NULL means "teacher-owned, no school",
--    which is the default and current state for every existing class.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- 2. Nullable created_by — tracks which user (typically a school_admin)
--    created a school-owned class. NULL for every existing class, and for
--    any class whose creator was later deleted (ON DELETE SET NULL, so a
--    class is never dropped just because its creator's account is gone).
ALTER TABLE classes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3. Drop teacher_id's NOT NULL constraint. Existing rows are unaffected —
--    every current class already has a non-null teacher_id; this only
--    allows new school-owned classes to omit one.
ALTER TABLE classes ALTER COLUMN teacher_id DROP NOT NULL;

-- 4. Index for the new school-scoped class queries in schoolRoutes.js.
--    Partial (WHERE school_id IS NOT NULL) since the large majority of
--    existing classes will have NULL here and gain nothing from being
--    indexed on it.
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id) WHERE school_id IS NOT NULL;

-- Sanity check before committing — confirm nothing existing was disturbed
-- and no class has accidentally been assigned a school yet.
SELECT
  (SELECT COUNT(*) FROM classes)                          AS total_classes_unchanged_count,
  (SELECT COUNT(*) FROM classes WHERE school_id IS NOT NULL) AS classes_with_school_should_be_0,
  (SELECT COUNT(*) FROM classes WHERE teacher_id IS NULL)     AS classes_without_teacher_should_be_0;

-- Expect: classes_with_school_should_be_0 = 0, classes_without_teacher_should_be_0 = 0,
-- and total_classes_unchanged_count equal to the pre-migration class count.
-- If all three hold, nothing existing changed and the new columns are ready.
-- COMMIT;
-- ROLLBACK;
