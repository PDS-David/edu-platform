-- migration_033_syllabus_confirmed_status.sql
--
-- Syllabus-driven topic mapping, Prompt 3 Part 1: adds the 'confirmed'
-- terminal status Prompt 2 didn't anticipate (its own status CHECK only
-- covers 'uploaded'/'processing'/'extracted'/'failed' — confirmed by
-- reading the actual merged migration_031, not assumed). A document
-- reaches 'confirmed' when a human has reviewed the AI-extracted
-- structure (possibly edited it) and approved writing it into the real
-- topics/subtopics tables via POST /api/syllabus/:id/confirm.
--
-- Also adds confirmed_by / confirmed_at — not explicitly requested by
-- this prompt's brief, but a deliberate, narrow addition: this action
-- permanently restructures a subject's live topic tree, and every other
-- consequential write in this codebase (uploaded_by, created_by, etc.)
-- already records who did it. Flagged here rather than added silently.
--
-- Postgres has no "ALTER CHECK constraint" — a CHECK constraint must be
-- dropped and recreated to change its allowed values. DROP ... IF EXISTS
-- followed by ADD makes this naturally idempotent (a second run just
-- drops what the first run added, then re-adds the identical definition)
-- without needing the DO $$ ... EXCEPTION WHEN duplicate_object pattern
-- used elsewhere for constraints that are only ever added once.
--
-- SAFETY MODEL: purely additive/idempotent. Safe to re-run.

BEGIN;

ALTER TABLE syllabus_documents
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE syllabus_documents
  DROP CONSTRAINT IF EXISTS syllabus_documents_status_check;

ALTER TABLE syllabus_documents
  ADD CONSTRAINT syllabus_documents_status_check
  CHECK (status IN ('uploaded', 'processing', 'extracted', 'failed', 'confirmed'));

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'syllabus_documents' AND column_name = 'confirmed_by') AS confirmed_by_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'syllabus_documents' AND column_name = 'confirmed_at') AS confirmed_at_exists,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname = 'syllabus_documents_status_check')                       AS status_check_definition;

COMMIT;
