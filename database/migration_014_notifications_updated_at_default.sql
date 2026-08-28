-- migration_014_notifications_updated_at_default.sql
--
-- Fixes: sending a notification via the school-admin "Send Notification"
-- modal (POST /api/notifications) failed with
--   null value in column "updated_at" of relation "notifications"
--   violates not-null constraint
--
-- ROOT CAUSE: the exact same class of drift as migration_012
-- (notifications_created_at_default) — every versioned migration that
-- defines `notifications` gives updated_at a `DEFAULT NOW()` too, but that
-- default was never backfilled onto the live table for the same reason
-- created_at wasn't (CREATE TABLE IF NOT EXISTS is a silent no-op against
-- a pre-existing table). migration_012 fixed created_at in both the
-- schema and every INSERT call site, but updated_at — its sibling column
-- with the identical problem — was missed at the time. Confirmed live via
-- a real "null value in column updated_at" error on
-- server/routes/notificationsRoutes.js's insertOne/insertMany after
-- migration_012 had already shipped.
--
-- server/routes/notificationsRoutes.js and server/routes/teacherRoutes.js
-- have been fixed in code to set updated_at = NOW() explicitly on every
-- insert, alongside created_at (so neither depends on the column default
-- at all going forward). server/routes/adminRoutes.js's own notification
-- endpoint was already unaffected — it checks information_schema at query
-- time and only sends both columns when updated_at actually exists. This
-- migration corrects the schema itself, so any future insert that forgets
-- to set updated_at explicitly doesn't hit the same landmine.
--
-- SAFETY MODEL: identical to migration_012 — purely additive, idempotent,
-- touches no existing rows.
--   - ALTER COLUMN ... SET DEFAULT is a metadata-only change in Postgres;
--     it does not rewrite the table and does not touch any existing row.
--   - Running this twice, or against a table that already has the
--     default, is a harmless no-op (SET DEFAULT to the same value again).
--   - Does not change the NOT NULL constraint, which is correct and
--     should stay as-is.
--
-- Manual run required, same as every migration since migration_007 — not
-- in setupDb.js's auto-run list. Run inside a transaction, with the
-- sanity-check SELECT before COMMIT, against a database you've just
-- pg_dump'd.

BEGIN;

ALTER TABLE notifications
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Sanity check before committing — expect default_should_be_now to show
-- something like "now()" (not NULL/blank).
SELECT column_default AS default_should_be_now
  FROM information_schema.columns
 WHERE table_name = 'notifications'
   AND column_name = 'updated_at';

-- COMMIT;
-- ROLLBACK;
