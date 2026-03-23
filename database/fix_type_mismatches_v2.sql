-- ============================================================
-- EAC LEARNING PLATFORM — TYPE MISMATCH FIXES (v2)
-- Fix: drop default before altering pending_exam_board_ids type
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Recreate student_exam_types with all UUID columns
-- ------------------------------------------------------------
DROP TABLE IF EXISTS student_exam_types;

CREATE TABLE student_exam_types (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exam_board_id   UUID NOT NULL REFERENCES exam_boards(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    granted_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP,
    is_active       BOOLEAN DEFAULT true,
    UNIQUE(student_id, exam_board_id)
);

CREATE INDEX idx_student_exam_types_student ON student_exam_types(student_id);
CREATE INDEX idx_student_exam_types_board   ON student_exam_types(exam_board_id);
CREATE INDEX idx_student_exam_types_active  ON student_exam_types(student_id, is_active);

-- ------------------------------------------------------------
-- 2. Fix teacher_subjects.exam_board_id (INTEGER → UUID)
-- ------------------------------------------------------------
ALTER TABLE teacher_subjects DROP COLUMN exam_board_id;
ALTER TABLE teacher_subjects ADD COLUMN exam_board_id UUID REFERENCES exam_boards(id) ON DELETE SET NULL;
CREATE INDEX idx_teacher_subjects_board ON teacher_subjects(exam_board_id);

-- ------------------------------------------------------------
-- 3. Fix users.pending_exam_board_ids (integer[] → uuid[])
--    Must: drop default → change type → re-add default
-- ------------------------------------------------------------
ALTER TABLE users ALTER COLUMN pending_exam_board_ids DROP DEFAULT;
ALTER TABLE users ALTER COLUMN pending_exam_board_ids TYPE uuid[] USING '{}'::uuid[];
ALTER TABLE users ALTER COLUMN pending_exam_board_ids SET DEFAULT '{}'::uuid[];

COMMIT;

-- ============================================================
-- VERIFY with these queries after running:
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'student_exam_types' ORDER BY ordinal_position;
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'teacher_subjects' AND column_name = 'exam_board_id';
--
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name = 'pending_exam_board_ids';
-- ============================================================
