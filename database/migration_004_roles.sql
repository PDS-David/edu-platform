-- ═══════════════════════════════════════════════════════════════
-- EAC Learning Platform — Migration 004 v3
-- No foreign key constraints — plain integer references only
-- ═══════════════════════════════════════════════════════════════

-- ── 1. STUDENT EXAM TYPES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_exam_types (
    id              SERIAL PRIMARY KEY,
    student_id      UUID NOT NULL,
    exam_board_id   INTEGER NOT NULL,
    subscription_id INTEGER,
    granted_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP,
    is_active       BOOLEAN DEFAULT true,
    UNIQUE(student_id, exam_board_id)
);

CREATE INDEX IF NOT EXISTS idx_student_exam_types_student
    ON student_exam_types(student_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_types_board
    ON student_exam_types(exam_board_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_types_active
    ON student_exam_types(student_id, is_active);

-- ── 2. TEACHER SUBJECTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subjects (
    id            SERIAL PRIMARY KEY,
    teacher_id    UUID NOT NULL,
    subject_id    UUID NOT NULL,
    exam_board_id INTEGER NOT NULL,
    assigned_by   UUID,
    assigned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active     BOOLEAN DEFAULT true,
    UNIQUE(teacher_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher
    ON teacher_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject
    ON teacher_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_active
    ON teacher_subjects(teacher_id, is_active);

-- ── 3. PENDING EXAM TYPES COLUMN ─────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pending_exam_board_ids INTEGER[] DEFAULT '{}';

-- ── 4. VERIFY ────────────────────────────────────────────────
SELECT
    'student_exam_types' AS table_name,
    COUNT(*)             AS rows
FROM student_exam_types
UNION ALL
SELECT
    'teacher_subjects',
    COUNT(*)
FROM teacher_subjects;
