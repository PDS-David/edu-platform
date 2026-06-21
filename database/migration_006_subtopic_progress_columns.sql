-- migration_006_subtopic_progress_columns.sql
-- Adds resources_completed and practice_completed columns that the
-- subtopicProgressService INSERT and many analytics queries reference
-- but which were never in the original migration_003 schema.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

ALTER TABLE subtopic_progress
  ADD COLUMN IF NOT EXISTS resources_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS practice_completed  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_pct      SMALLINT NOT NULL DEFAULT 0
    CHECK (completion_pct BETWEEN 0 AND 100);

-- Recompute completion_pct for any existing rows
UPDATE subtopic_progress
SET completion_pct = (
  (CASE WHEN resources_completed THEN 33 ELSE 0 END) +
  (CASE WHEN practice_completed  THEN 33 ELSE 0 END) +
  (CASE WHEN quiz_completed      THEN 34 ELSE 0 END)
)
WHERE completion_pct = 0;
