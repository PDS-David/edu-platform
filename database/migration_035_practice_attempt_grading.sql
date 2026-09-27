-- migration_035_practice_attempt_grading.sql
--
-- Persist the actual grading result for practice attempts.
-- Safe to re-run.
--
-- marks_awarded:
--   Marks actually awarded for the attempt. Nullable for historical rows.
--
-- ai_explanation:
--   AI-generated grading feedback where applicable. Nullable for historical
--   rows and non-AI-graded question types.

BEGIN;

ALTER TABLE practice_attempts
  ADD COLUMN IF NOT EXISTS marks_awarded INTEGER;

ALTER TABLE practice_attempts
  ADD COLUMN IF NOT EXISTS ai_explanation TEXT;

COMMIT;
