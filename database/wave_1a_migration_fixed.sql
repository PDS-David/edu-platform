-- ============================================================
-- EAC LEARNING PLATFORM -- WAVE 1A MIGRATION (FIXED)
-- Generated: 2026-03-19
-- Fixes vs first attempt:
--   1. Removed all emoji from RAISE NOTICE (WIN1252 encoding)
--   2. exam_boards.id is SERIAL (integer) -- all FK refs use INTEGER
--   3. topics table already has course_id UUID -- we add subject_id UUID
--   4. Each section is its own savepoint so one error does not
--      roll back everything else
-- HOW TO RUN:
--   psql -U postgres -d edu_platform -f wave_1a_migration_fixed.sql
-- ============================================================

-- ============================================================
-- SECTION 1: USERS TABLE
-- ============================================================

SAVEPOINT s1;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255) NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'free';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ NULL;

-- Add check constraint separately so it can be skipped if already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_subscription_status_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_subscription_status_check
        CHECK (subscription_status IN ('free', 'active', 'expired', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_subscription
  ON users(subscription_status, subscription_expires_at);

DO $$ BEGIN
  RAISE NOTICE 'SECTION 1 DONE: users columns added';
END $$;

-- ============================================================
-- SECTION 2: CONFIRM EXAM BOARDS
-- ============================================================
-- exam_boards.id is SERIAL (integer) -- confirmed from schema_updates.sql
-- All foreign keys to exam_boards must use INTEGER, not UUID

SAVEPOINT s2;

DO $$
DECLARE
  board_count INTEGER;
  id_type     TEXT;
BEGIN
  SELECT COUNT(*) INTO board_count FROM exam_boards;
  SELECT data_type INTO id_type
    FROM information_schema.columns
    WHERE table_name = 'exam_boards' AND column_name = 'id';
  RAISE NOTICE 'SECTION 2: exam_boards has % rows, id type is %', board_count, id_type;
END $$;

-- ============================================================
-- SECTION 3: TOPICS TABLE
-- ============================================================
-- topics already exists (schema.sql) with course_id UUID PK.
-- We add subject_id (UUID) and exam_board_id (INTEGER) columns.
-- exam_board_id FK uses INTEGER to match exam_boards.id SERIAL.

SAVEPOINT s3;

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS exam_board_id INTEGER REFERENCES exam_boards(id);

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Backfill name from title where title exists
UPDATE topics SET name = title WHERE name IS NULL AND title IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_exam_board  ON topics(exam_board_id);

DO $$ BEGIN
  RAISE NOTICE 'SECTION 3 DONE: topics table updated';
END $$;

-- ============================================================
-- SECTION 4: SUBTOPICS TABLE
-- ============================================================

SAVEPOINT s4;

CREATE TABLE IF NOT EXISTS subtopics (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id      UUID        REFERENCES topics(id) ON DELETE CASCADE,
  subject_id    UUID        REFERENCES subjects(id) ON DELETE CASCADE,
  exam_board_id INTEGER     REFERENCES exam_boards(id),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  order_index   INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id   ON subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_subject_id ON subtopics(subject_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_exam_board ON subtopics(exam_board_id);

DO $$ BEGIN
  RAISE NOTICE 'SECTION 4 DONE: subtopics table created';
END $$;

-- ============================================================
-- SECTION 5: RESOURCES TABLE
-- ============================================================
-- resources exists in schema.sql with topic_id UUID.
-- We add subtopic_id, uploaded_by, file_url, hls_path,
-- file_size_bytes, duration_seconds, exam_board_id.

SAVEPOINT s5;

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

-- Extend resource_type check constraint
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_resource_type_check;
ALTER TABLE resources
  ADD CONSTRAINT resources_resource_type_check
    CHECK (resource_type IN ('video', 'audio', 'document', 'pdf', 'link', 'quiz', 'note'));

CREATE INDEX IF NOT EXISTS idx_resources_subtopic_id ON resources(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_resources_subject_id  ON resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_resources_uploaded_by ON resources(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_resources_exam_board  ON resources(exam_board_id);

DO $$ BEGIN
  RAISE NOTICE 'SECTION 5 DONE: resources table updated';
END $$;

-- ============================================================
-- SECTION 6: SUBTOPIC PROGRESS TABLE
-- ============================================================

SAVEPOINT s6;

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
  RAISE NOTICE 'SECTION 6 DONE: subtopic_progress table created';
END $$;

-- ============================================================
-- SECTION 7: PRACTICE ATTEMPTS
-- ============================================================
-- Already created in migration_004_questions.sql.
-- Just add session_id if missing and a date index.

SAVEPOINT s7;

ALTER TABLE practice_attempts
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_student_date
  ON practice_attempts(student_id, attempted_at);

DO $$ BEGIN
  RAISE NOTICE 'SECTION 7 DONE: practice_attempts verified';
END $$;

-- ============================================================
-- SECTION 8: SUBTOPIC QUIZ ATTEMPT TABLES
-- ============================================================

SAVEPOINT s8;

CREATE TABLE IF NOT EXISTS subtopic_quiz_attempts (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id    UUID        NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  subject_id     UUID        REFERENCES subjects(id) ON DELETE SET NULL,
  exam_board_id  INTEGER     REFERENCES exam_boards(id),
  paper_type     VARCHAR(20) DEFAULT 'all',
  total_score    INTEGER     DEFAULT 0,
  max_score      INTEGER     DEFAULT 0,
  accuracy_pct   DECIMAL(5,2) DEFAULT 0,
  time_taken_ms  INTEGER,
  completed_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subtopic_quiz_attempts_paper_type_check'
  ) THEN
    ALTER TABLE subtopic_quiz_attempts
      ADD CONSTRAINT subtopic_quiz_attempts_paper_type_check
        CHECK (paper_type IN ('all', 'paper1', 'structured'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sqa_student     ON subtopic_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_sqa_subtopic    ON subtopic_quiz_attempts(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_sqa_student_sub ON subtopic_quiz_attempts(student_id, subtopic_id);

CREATE TABLE IF NOT EXISTS subtopic_quiz_answers (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id          UUID        NOT NULL REFERENCES subtopic_quiz_attempts(id) ON DELETE CASCADE,
  question_id         UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id  UUID        REFERENCES answer_options(id) ON DELETE SET NULL,
  typed_answer        TEXT,
  is_correct          BOOLEAN,
  marks_awarded       INTEGER     DEFAULT 0,
  max_marks           INTEGER     DEFAULT 1,
  time_taken_ms       INTEGER,
  ai_explanation      TEXT,
  ai_marking_scheme   JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sqa_answers_attempt  ON subtopic_quiz_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_sqa_answers_question ON subtopic_quiz_answers(question_id);

DO $$ BEGIN
  RAISE NOTICE 'SECTION 8 DONE: subtopic_quiz_attempts and subtopic_quiz_answers created';
END $$;

-- ============================================================
-- SECTION 9: QUESTIONS TABLE ADDITIONS
-- ============================================================

SAVEPOINT s9;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subtopic_id UUID REFERENCES subtopics(id) ON DELETE SET NULL;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_sub_type VARCHAR(20) DEFAULT 'mcq';

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS marks INTEGER DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'questions_question_sub_type_check'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_question_sub_type_check
        CHECK (question_sub_type IN ('mcq', 'smart_answers', 'structured'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS question_sub_parts (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id  UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  part_label   VARCHAR(10) NOT NULL,
  part_text    TEXT        NOT NULL,
  marks        INTEGER     DEFAULT 1,
  order_index  INTEGER     DEFAULT 0,
  model_answer TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_sub_parts_question ON question_sub_parts(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_subtopic          ON questions(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_questions_sub_type          ON questions(question_sub_type);

DO $$ BEGIN
  RAISE NOTICE 'SECTION 9 DONE: questions updated, question_sub_parts created';
END $$;

-- ============================================================
-- SECTION 10: SANITY CHECKS
-- ============================================================

DO $$
DECLARE
  q_count  INTEGER;
  ao_count INTEGER;
  u_count  INTEGER;
  t        TEXT;
  tables   TEXT[] := ARRAY[
    'subtopics',
    'subtopic_progress',
    'subtopic_quiz_attempts',
    'subtopic_quiz_answers',
    'question_sub_parts'
  ];
  cols     TEXT[] := ARRAY[
    'password_reset_token',
    'password_reset_expires',
    'subscription_status',
    'subscription_expires_at'
  ];
BEGIN
  SELECT COUNT(*) INTO q_count  FROM questions WHERE status = 'approved';
  SELECT COUNT(*) INTO ao_count FROM answer_options;
  SELECT COUNT(*) INTO u_count  FROM users;

  RAISE NOTICE '--- SANITY CHECK ---';
  RAISE NOTICE 'Approved questions : %', q_count;
  RAISE NOTICE 'Answer options     : %', ao_count;
  RAISE NOTICE 'Users              : %', u_count;

  IF q_count = 0 THEN
    RAISE WARNING 'No approved questions. Run seed_answer_options.sql';
  END IF;

  IF ao_count = 0 THEN
    RAISE WARNING 'No answer options. Run seed_answer_options.sql and patch_answer_options.sql';
  END IF;

  RAISE NOTICE '--- TABLE CHECK ---';
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'OK table: %', t;
    ELSE
      RAISE WARNING 'MISSING table: %', t;
    END IF;
  END LOOP;

  RAISE NOTICE '--- COLUMN CHECK (users) ---';
  FOREACH t IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = t
    ) THEN
      RAISE NOTICE 'OK column: users.%', t;
    ELSE
      RAISE WARNING 'MISSING column: users.%', t;
    END IF;
  END LOOP;

  RAISE NOTICE '--- WAVE 1A COMPLETE ---';
  RAISE NOTICE 'Next step: add GEMINI_API_KEY and PAYSTACK_SECRET_KEY to server/.env';
END $$;
