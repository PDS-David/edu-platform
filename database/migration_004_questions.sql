-- ============================================
-- EAC LEARNING PLATFORM - MIGRATION 004
-- Questions Import System
-- Date: 2026-03-18
-- Run AFTER schema_updates_fixed.sql
-- ============================================
-- FIXES APPLIED vs original file:
--   - question_hints.id:          SERIAL        → UUID
--   - question_hints.question_id: INTEGER        → UUID  (questions.id is UUID)
--   - practice_attempts.id:       SERIAL         → UUID
--   - practice_attempts.question_id: INTEGER     → UUID  (questions.id is UUID)
--   - practice_attempts.selected_option: INTEGER → UUID  (answer_options.id is UUID)
--   - idx_questions_board_subject_status: removed subject_id
--     (questions has subject_id_uuid, not subject_id — avoids column-not-found error)
-- ============================================

BEGIN;

-- ── 1. ADD COLUMNS TO questions TABLE ──────────────────────────────────────

-- subject_id as UUID FK → subjects.id (already UUID)
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subject_id_uuid UUID REFERENCES subjects(id) ON DELETE SET NULL;

-- status with CHECK constraint
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));

-- submitted_by: UUID FK → users.id (community submissions)
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- reviewed_by: UUID FK → users.id (admin who approved/rejected)
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- reviewed_at: timestamp of review action
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- source: where the question came from
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'admin_import'
    CHECK (source IN ('admin_import', 'community'));

-- explanation: shown after answering (needed for practice mode hints)
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS explanation TEXT;

-- difficulty: optional but useful for practice mode
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10) DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard'));

-- topic: grouping within a subject (used for hints + learning gaps)
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS topic VARCHAR(200);

-- Set existing questions to approved/admin_import by default
UPDATE questions SET status = 'approved'       WHERE status IS NULL;
UPDATE questions SET source = 'admin_import'   WHERE source IS NULL;

-- ── 2. INDEXES ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_questions_status        ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_source        ON questions(source);
CREATE INDEX IF NOT EXISTS idx_questions_submitted_by  ON questions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_questions_subject_uuid  ON questions(subject_id_uuid);
CREATE INDEX IF NOT EXISTS idx_questions_topic         ON questions(topic);

-- Composite index for the most common random-question query
-- Uses exam_board_id and status only — questions has no plain subject_id column
-- (subject is stored in subject_id_uuid)
CREATE INDEX IF NOT EXISTS idx_questions_board_status
  ON questions(exam_board_id, status);

-- ── 3. question_hints TABLE ────────────────────────────────────────────────
-- 3 progressive hints per question (used in PracticeMode hint button)
-- FIXED: id → UUID, question_id → UUID (questions.id is UUID)

CREATE TABLE IF NOT EXISTS question_hints (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  hint_order  INTEGER     NOT NULL CHECK (hint_order IN (1, 2, 3)),
  hint_text   TEXT        NOT NULL,
  created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(question_id, hint_order)
);

CREATE INDEX IF NOT EXISTS idx_question_hints_question ON question_hints(question_id);

-- ── 4. practice_attempts TABLE ─────────────────────────────────────────────
-- Server-side validation log for every answer submitted in PracticeMode
-- FIXED: id → UUID, question_id → UUID, selected_option → UUID

CREATE TABLE IF NOT EXISTS practice_attempts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id     UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option UUID        REFERENCES answer_options(id) ON DELETE SET NULL,
  is_correct      BOOLEAN     NOT NULL,
  time_taken_ms   INTEGER,
  session_id      VARCHAR(100),
  attempted_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_student   ON practice_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_question  ON practice_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_session   ON practice_attempts(session_id);

-- ── 5. VERIFICATION ────────────────────────────────────────────────────────

-- Confirm new columns on questions table
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'questions'
  AND column_name IN (
    'status', 'source', 'submitted_by', 'reviewed_by',
    'reviewed_at', 'explanation', 'difficulty', 'topic'
  )
ORDER BY column_name;

-- Confirm new tables have UUID primary keys
SELECT
  table_name,
  data_type AS id_type
FROM information_schema.columns
WHERE column_name = 'id'
  AND table_schema = 'public'
  AND table_name IN ('question_hints', 'practice_attempts')
ORDER BY table_name;

COMMIT;
