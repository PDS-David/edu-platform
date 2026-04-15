-- migration_004_student_subjects.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates:
--   student_subjects  — tracks which subjects a student has individually selected
--   class_subjects    — tracks which subjects a teacher has assigned to a class
--
-- Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. student_subjects
--    Stores the explicit subject selections a student made during onboarding
--    or added later from their dashboard. This is the source of truth for
--    "which subjects should this student see on their dashboard".
--
--    Separate from student_exam_types (which tracks which exam BOARDS a student
--    has access to) — a student can be enrolled in a board without having
--    selected every subject under it.

CREATE TABLE IF NOT EXISTS student_subjects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id  INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_student_subjects_student_id ON student_subjects(student_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_subject_id ON student_subjects(subject_id);


-- 2. class_subjects
--    Tracks which subjects a teacher has assigned to each class.
--    When a student joins a class they automatically see all subjects assigned
--    to that class on their dashboard (source = 'class').

CREATE TABLE IF NOT EXISTS class_subjects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_class_subjects_class_id   ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_id ON class_subjects(subject_id);


-- 3. Add is_active to student_exam_types if missing (was added in some envs only)
ALTER TABLE student_exam_types
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
