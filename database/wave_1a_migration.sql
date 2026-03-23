-- ============================================================
-- EAC LEARNING PLATFORM — WAVE 1A MIGRATION
-- Generated: 2026-03-19
-- Purpose: Prepare database for AI features, quiz system,
--          resources, subtopics, and subscription management
--
-- HOW TO RUN:
--   psql -U postgres -d edu_platform -f wave_1a_migration.sql
--
-- SAFE TO RUN MULTIPLE TIMES — all statements use
--   ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: USERS TABLE — add missing columns
-- ============================================================
-- These are needed for password reset and subscription tracking

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255) NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'active', 'expired', 'cancelled'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ NULL;

-- Confirm
DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 1 DONE: users table columns added';
END $$;

-- ============================================================
-- SECTION 2: EXAM BOARDS — fix id type
-- ============================================================
-- schema_updates.sql created exam_boards with SERIAL (integer) id.
-- The questions table references exam_board_id as INTEGER.
-- We keep this as-is to avoid breaking existing data.
-- The new tables below use exam_board_id INTEGER to match.

-- Confirm exam_boards exists and has data
DO $$
DECLARE
  board_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO board_count FROM exam_boards;
  RAISE NOTICE '✅ SECTION 2: exam_boards has % rows', board_count;
END $$;

-- ============================================================
-- SECTION 3: TOPICS TABLE
-- ============================================================
-- schema.sql has a topics table but it references course_id.
-- We need a subject-scoped topics table for the AI Buddy
-- structure (Curriculum → Subject → Topic → Subtopic).
-- We ADD columns to the existing topics table rather than
-- replacing it, to avoid breaking existing data.

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS exam_board_id INTEGER REFERENCES exam_boards(id);

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Backfill name from title if title exists
UPDATE topics SET name = title WHERE name IS NULL AND title IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_exam_board ON topics(exam_board_id);

DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 3 DONE: topics table updated';
END $$;

-- ============================================================
-- SECTION 4: SUBTOPICS TABLE (new)
-- ============================================================
-- AI Buddy structure: Topic → Subtopic (atomic learning unit)
-- Each subtopic has Resources, Practice Questions, Quiz tabs

CREATE TABLE IF NOT EXISTS subtopics (
  id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id      UUID    REFERENCES topics(id) ON DELETE CASCADE,
  subject_id    UUID    REFERENCES subjects(id) ON DELETE CASCADE,
  exam_board_id INTEGER REFERENCES exam_boards(id),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  order_index   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id     ON subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_subject_id   ON subtopics(subject_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_exam_board   ON subtopics(exam_board_id);

DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 4 DONE: subtopics table created';
END $$;

-- ============================================================
-- SECTION 5: RESOURCES TABLE — rebuild for AI Buddy structure
-- ============================================================
-- schema.sql has a resources table referencing topic_id only.
-- We add the missing columns without dropping anything.

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS file_url VARCHAR(500);

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS hls_path VARCHAR(500);

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS exam_board_id INTEGER REFERENCES exam_boards(id);

-- resource_type already exists in schema.sql — extend the allowed values
-- by dropping and re-adding the constraint
ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS resources_resource_type_check;

ALTER TABLE resources
  ADD CONSTRAINT resources_resource_type_check
    CHECK (resource_type IN ('video', 'audio', 'document', 'pdf', 'link', 'quiz', 'note'));

CREATE INDEX IF NOT EXISTS idx_resources_subtopic_id ON resources(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_resources_subject_id  ON resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_resources_uploaded_by ON resources(uploaded_by);

DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 5 DONE: resources table updated';
END $$;

-- ============================================================
-- SECTION 6: SUBTOPIC PROGRESS TABLE (new)
-- ============================================================
-- Tracks whether a student has completed Resources,
-- Practice Questions, and Quiz for each subtopic.
-- This drives the tab completion indicators and
-- the "X% Complete / Y tasks remaining" display.

CREATE TABLE IF NOT EXISTS subtopic_progress (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id          UUID        NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  resources_completed  BOOLEAN     DEFAULT false,
  practice_completed   BOOLEAN     DEFAULT false,
  quiz_completed       BOOLEAN     DEFAULT false,
  completed_at         TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(student_id, subtopic_id)
);

CREATE INDEX IF NOT EXISTS idx_subtopic_progress_student  ON subtopic_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_subtopic_progress_subtopic ON subtopic_progress(subtopic_id);

DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 6 DONE: subtopic_progress table created';
END $$;

-- ============================================================
-- SECTION 7: PRACTICE ATTEMPTS — already created in
--            migration_004_questions.sql. Confirm it exists
--            and add any missing columns.
-- ============================================================

-- migration_004 already created practice_attempts with UUID ids.
-- Just confirm and add session_id if missing.

ALTER TABLE practice_attempts
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_student_date
  ON practice_attempts(student_id, attempted_at);

DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 7 DONE: practice_attempts verified';
END $$;

-- ============================================================
-- SECTION 8: QUIZ ATTEMPT TABLES (new AI Buddy structure)
-- ============================================================
-- The existing quiz_attempts table in schema.sql is course/quiz
-- scoped. We need subtopic-scoped quiz attempts for the AI Buddy
-- flow. We create a new table rather than altering the old one.

CREATE TABLE IF NOT EXISTS subtopic_quiz_attempts (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id    UUID        NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  subject_id     UUID        REFERENCES subjects(id) ON DELETE SET NULL,
  exam_board_id  INTEGER     REFERENCES exam_boards(id),
  paper_type     VARCHAR(20) DEFAULT 'all'
                   CHECK (paper_type IN ('all', 'paper1', 'structured')),
  total_score    INTEGER     DEFAULT 0,
  max_score      INTEGER     DEFAULT 0,
  accuracy_pct   DECIMAL(5,2) DEFAULT 0,
  time_taken_ms  INTEGER,
  completed_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sqa_student    ON subtopic_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_sqa_subtopic   ON subtopic_quiz_attempts(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_sqa_student_sub ON subtopic_quiz_attempts(student_id, subtopic_id);

-- Per-question answers for each quiz attempt
CREATE TABLE IF NOT EXISTS subtopic_quiz_answers (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id       UUID        NOT NULL REFERENCES subtopic_quiz_attempts(id) ON DELETE CASCADE,
  question_id      UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id UUID      REFERENCES answer_options(id) ON DELETE SET NULL,
  typed_answer     TEXT,
  is_correct       BOOLEAN,
  marks_awarded    INTEGER     DEFAULT 0,
  max_marks        INTEGER     DEFAULT 1,
  time_taken_ms    INTEGER,
  ai_explanation   TEXT,
  ai_marking_scheme JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sqa_answers_attempt  ON subtopic_quiz_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_sqa_answers_question ON subtopic_quiz_answers(question_id);

DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 8 DONE: subtopic_quiz_attempts and subtopic_quiz_answers created';
END $$;

-- ============================================================
-- SECTION 9: QUESTIONS TABLE — add subtopic_id reference
-- ============================================================
-- migration_004 added subject_id_uuid, status, difficulty, topic.
-- We now add subtopic_id so questions can be scoped to subtopics.

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subtopic_id UUID REFERENCES subtopics(id) ON DELETE SET NULL;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_sub_type VARCHAR(20) DEFAULT 'mcq'
    CHECK (question_sub_type IN ('mcq', 'smart_answers', 'structured'));

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS marks INTEGER DEFAULT 1;

-- question_sub_parts for structured questions
CREATE TABLE IF NOT EXISTS question_sub_parts (
  id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id   UUID    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  part_label    VARCHAR(10) NOT NULL,  -- '(i)', '(ii)', '(iii)'
  part_text     TEXT    NOT NULL,
  marks         INTEGER DEFAULT 1,
  order_index   INTEGER DEFAULT 0,
  model_answer  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_sub_parts_question ON question_sub_parts(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_subtopic ON questions(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_questions_sub_type ON questions(question_sub_type);

DO $$ BEGIN
  RAISE NOTICE '✅ SECTION 9 DONE: questions updated, question_sub_parts created';
END $$;

-- ============================================================
-- SECTION 10: SUBSCRIPTION GUARD SUPPORT
-- ============================================================
-- Already handled in Section 1 (subscription_status,
-- subscription_expires_at on users table).
-- Add index for fast subscription lookups.

CREATE INDEX IF NOT EXISTS idx_users_subscription
  ON users(subscription_status, subscription_expires_at);

-- ============================================================
-- SECTION 11: ENV VARIABLES REMINDER
-- ============================================================
-- The following must be added to server/.env and
-- server/.env.example MANUALLY after running this SQL:
--
--   GEMINI_API_KEY=your_google_gemini_api_key_here
--   PAYSTACK_SECRET_KEY=sk_live_your_paystack_secret_key
--   VITE_PAYSTACK_PUBLIC_KEY=pk_live_your_paystack_public_key
--
-- This SQL file cannot modify .env files — add them manually.

DO $$ BEGIN
  RAISE NOTICE '⚠️  REMINDER: Add GEMINI_API_KEY and PAYSTACK_SECRET_KEY to server/.env manually';
END $$;

-- ============================================================
-- SECTION 12: SANITY CHECKS
-- ============================================================

DO $$
DECLARE
  q_count  INTEGER;
  ao_count INTEGER;
  u_count  INTEGER;
BEGIN
  SELECT COUNT(*) INTO q_count  FROM questions WHERE status = 'approved';
  SELECT COUNT(*) INTO ao_count FROM answer_options;
  SELECT COUNT(*) INTO u_count  FROM users;

  RAISE NOTICE '📊 SANITY CHECK:';
  RAISE NOTICE '   Approved questions:  %', q_count;
  RAISE NOTICE '   Answer options:      %', ao_count;
  RAISE NOTICE '   Users:               %', u_count;

  IF q_count = 0 THEN
    RAISE WARNING '⚠️  No approved questions found. Run seed_answer_options.sql and seed_data.sql';
  ELSE
    RAISE NOTICE '✅ Questions look good';
  END IF;

  IF ao_count = 0 THEN
    RAISE WARNING '⚠️  No answer options found. Run seed_answer_options.sql and patch_answer_options.sql';
  ELSE
    RAISE NOTICE '✅ Answer options look good';
  END IF;
END $$;

-- ============================================================
-- SECTION 13: VERIFY ALL NEW TABLES EXIST
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'subtopics',
    'subtopic_progress',
    'subtopic_quiz_attempts',
    'subtopic_quiz_answers',
    'question_sub_parts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE '✅ Table exists: %', t;
    ELSE
      RAISE WARNING '❌ Table MISSING: %', t;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- SECTION 14: VERIFY ALL NEW COLUMNS ON users TABLE
-- ============================================================

DO $$
DECLARE
  col TEXT;
  cols TEXT[] := ARRAY[
    'password_reset_token',
    'password_reset_expires',
    'subscription_status',
    'subscription_expires_at'
  ];
BEGIN
  FOREACH col IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = col
    ) THEN
      RAISE NOTICE '✅ users.% exists', col;
    ELSE
      RAISE WARNING '❌ users.% is MISSING', col;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- WAVE 1A COMPLETE
-- Expected output in terminal:
--   ✅ SECTION 1 DONE: users table columns added
--   ✅ SECTION 2: exam_boards has 7 rows
--   ✅ SECTION 3 DONE: topics table updated
--   ✅ SECTION 4 DONE: subtopics table created
--   ✅ SECTION 5 DONE: resources table updated
--   ✅ SECTION 6 DONE: subtopic_progress table created
--   ✅ SECTION 7 DONE: practice_attempts verified
--   ✅ SECTION 8 DONE: subtopic_quiz_attempts and subtopic_quiz_answers created
--   ✅ SECTION 9 DONE: questions updated, question_sub_parts created
--   ⚠️  REMINDER: Add GEMINI_API_KEY and PAYSTACK_SECRET_KEY to server/.env manually
--   📊 SANITY CHECK: (numbers)
--   ✅ Table exists: subtopics ... (x5)
--   ✅ users.password_reset_token exists ... (x4)
-- ============================================================
