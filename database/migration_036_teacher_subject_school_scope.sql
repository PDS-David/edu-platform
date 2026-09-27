-- Teacher subject assignments become school-scoped for multi-school teachers.
-- Safe for existing data: legacy assignments are attached to the teacher's
-- current users.school_id. Standalone teachers retain NULL school_id.
BEGIN;

ALTER TABLE teacher_subjects
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

UPDATE teacher_subjects ts
SET school_id = u.school_id
FROM users u
WHERE u.id = ts.teacher_id
  AND ts.school_id IS NULL
  AND u.school_id IS NOT NULL;

ALTER TABLE teacher_subjects
  DROP CONSTRAINT IF EXISTS teacher_subjects_teacher_id_subject_id_key;
DROP INDEX IF EXISTS teacher_subjects_teacher_id_subject_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_subjects_teacher_subject_school
  ON teacher_subjects (teacher_id, subject_id, school_id)
  WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_subjects_standalone
  ON teacher_subjects (teacher_id, subject_id)
  WHERE school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher_school_active
  ON teacher_subjects (teacher_id, school_id, is_active);

COMMIT;
