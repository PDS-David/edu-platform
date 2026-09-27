-- Multi-school teacher memberships. Review and back up production before applying.
-- Additive: preserve users.school_id for legacy accounts and non-teacher roles.
CREATE TABLE IF NOT EXISTS teacher_school_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','inactive')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, school_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_school_memberships_school
  ON teacher_school_memberships (school_id, status);
INSERT INTO teacher_school_memberships (teacher_id, school_id, status)
SELECT id, school_id, 'active' FROM users
WHERE role = 'teacher' AND school_id IS NOT NULL
ON CONFLICT (teacher_id, school_id) DO NOTHING;
-- Subject assignments were historically global per teacher. School-specific
-- assignment migration is deliberately NOT inferred: historical provenance
-- cannot be reconstructed safely from teacher_id alone.
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school ON teacher_subjects (teacher_id, school_id);
