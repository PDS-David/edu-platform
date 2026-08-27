-- migration_012_notifications_created_at_default.sql
--
-- Fixes: sending a notification via POST /api/notifications (the admin
-- "Send Notification" modal) failed with
--   null value in column "created_at" of relation "notifications"
--   violates not-null constraint
--
-- ROOT CAUSE: every versioned migration that defines `notifications`
-- (migration_003.sql, and the equivalent block in
-- server/scripts/run_complete_migration.js) gives created_at a
-- `DEFAULT NOW()`. But table creation everywhere is guarded by
-- `CREATE TABLE IF NOT EXISTS`, and setupDb.js's migration runner never
-- ALTERs an existing table to add a missing default. If the live
-- `notifications` table was created before migration_003.sql existed, or
-- by some other ad hoc path, that CREATE is a silent no-op against it and
-- the missing default persists indefinitely — the same class of drift as
-- the EP-15 schema-canonicalization findings. server/routes/notificationsRoutes.js
-- has been fixed in code to set created_at = NOW() explicitly on every
-- insert (so it no longer depends on this default at all), but the table
-- itself is left with a NOT NULL column that has no default, which is a
-- landmine for any future insert that forgets to set it explicitly (the
-- other three call sites already set it explicitly and were never
-- affected). This migration corrects the schema itself.
--
-- SAFETY MODEL: purely additive, idempotent, and touches no existing rows.
--   - ALTER COLUMN ... SET DEFAULT is a metadata-only change in Postgres;
--     it does not rewrite the table and does not touch any existing row.
--   - Running this twice, or against a table that already has the
--     default, is a harmless no-op (SET DEFAULT to the same value again).
--   - Does not change the NOT NULL constraint, which is correct and
--     should stay as-is.
--
-- Manual run required, same as migration_007/008/009/010/011 — not in
-- setupDb.js's auto-run list. Run inside a transaction, with the
-- sanity-check SELECT before COMMIT, against a database you've just
-- pg_dump'd.

BEGIN;

ALTER TABLE notifications
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Sanity check before committing — expect default_should_be_now to show
-- something like "now()" (not NULL/blank).
SELECT column_default AS default_should_be_now
  FROM information_schema.columns
 WHERE table_name = 'notifications'
   AND column_name = 'created_at';

-- COMMIT;
-- ROLLBACK;
