-- migration_041_subject_deactivation_cascade.sql
-- Ensure class_subjects can be independently deactivated when its subject
-- is retired. Existing rows remain active until a subject/exam-board cascade
-- runs, preserving current behaviour for all live catalog entries.
ALTER TABLE class_subjects
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_active
  ON class_subjects(subject_id, is_active);

-- Keep the existing student enrollment flag authoritative for deactivation.
-- No data is deleted; deactivated enrollments can remain as historical rows.
