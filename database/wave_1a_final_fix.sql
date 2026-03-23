-- ============================================================
-- EAC LEARNING PLATFORM -- WAVE 1A FINAL FIX
-- Generated: 2026-03-19
--
-- What this fixes vs previous attempts:
--   1. exam_boards.id is UUID in your actual DB (not SERIAL)
--      so all exam_board_id foreign keys are now UUID
--   2. No SAVEPOINT (not inside a transaction block)
--   3. No emoji characters (WIN1252 terminal)
--   4. subtopics created cleanly without FK type conflicts
--
-- HOW TO RUN:
--   psql -U postgres -d edu_platform -f wave_1a_final_fix.sql
-- ============================================================

-- ============================================================
-- STEP 1: CONFIRM exam_boards.id type
-- ============================================================

DO $$
DECLARE
  id_type TEXT;
  board_count INTEGER;
BEGIN
  SELECT data_type INTO id_type
    FROM information_schema.columns
    WHERE table_name = 'exam_boards' AND column_name = 'id';
  SELECT COUNT(*) INTO board_count FROM exam_boards;
  RAISE NOTICE 'exam_boards.id type = %, rows = %', id_type, board_count;
END $$;

-- ============================================================
-- STEP 2: TOPICS TABLE -- add exam_board_id as UUID
-- ============================================================

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS exam_board_id UUID REFERENCES exam_boards(id);

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);

UPDATE topics SET name = title WHERE name IS NULL AND title IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_exam_board  ON topics(exam_board_id);

DO $$ BEGIN RAISE NOTICE 'STEP 2 DONE: topics updated'; END $$;

-- ============================================================
-- STEP 3: SUBTOPICS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS subtopics (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id      UUID        REFERENCES topics(id) ON DELETE CASCADE,
  subject_id    UUID        REFERENCES subjects(id) ON DELETE CASCADE,
  exam_board_id UUID        REFERENCES exam_boards(id),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  order_index   INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id   ON subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_subject_id ON subtopics(subject_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_exam_board ON subtopics(exam_board_id);

DO $$ BEGIN RAISE NOTICE 'STEP 3 DONE: subtopics created'; END $$;

-- ============================================================
-- STEP 4: RESOURCES TABLE -- add missing columns
-- ============================================================

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
  ADD COLUMN IF NOT EXISTS exam_board_id UUID REFERENCES exam_boards(id);

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_resource_type_check;
ALTER TABLE resources
  ADD CONSTRAINT resources_resource_type_check
    CHECK (resource_type IN ('video', 'audio', 'document', 'pdf', 'link', 'quiz', 'note'));

CREATE INDEX IF NOT EXISTS idx_resources_subtopic_id ON resources(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_resources_subject_id  ON resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_resources_uploaded_by ON resources(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_resources_exam_board  ON resources(exam_board_id);

DO $$ BEGIN RAISE NOTICE 'STEP 4 DONE: resources updated'; END $$;

-- ============================================================
-- STEP 5: SUBTOPIC PROGRESS TABLE
-- ============================================================

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

DO $$ BEGIN RAISE NOTICE 'STEP 5 DONE: subtopic_progress created'; END $$;

-- ============================================================
-- STEP 6: SUBTOPIC QUIZ ATTEMPTS
-- ============================================================

CREATE TABLE IF NOT EXISTS subtopic_quiz_attempts (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id    UUID         NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  subject_id     UUID         REFERENCES subjects(id) ON DELETE SET NULL,
  exam_board_id  UUID         REFERENCES exam_boards(id),
  paper_type     VARCHAR(20)  DEFAULT 'all'
                   CHECK (paper_type IN ('all', 'paper1', 'structured')),
  total_score    INTEGER      DEFAULT 0,
  max_score      INTEGER      DEFAULT 0,
  accuracy_pct   DECIMAL(5,2) DEFAULT 0,
  time_taken_ms  INTEGER,
  completed_at   TIMESTAMPTZ  DEFAULT NOW(),
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sqa_student     ON subtopic_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_sqa_subtopic    ON subtopic_quiz_attempts(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_sqa_student_sub ON subtopic_quiz_attempts(student_id, subtopic_id);

DO $$ BEGIN RAISE NOTICE 'STEP 6 DONE: subtopic_quiz_attempts created'; END $$;

-- ============================================================
-- STEP 7: SUBTOPIC QUIZ ANSWERS
-- ============================================================

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

DO $$ BEGIN RAISE NOTICE 'STEP 7 DONE: subtopic_quiz_answers created'; END $$;

-- ============================================================
-- STEP 8: QUESTIONS -- add subtopic_id
-- ============================================================

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subtopic_id UUID REFERENCES subtopics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_subtopic ON questions(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_questions_sub_type ON questions(question_sub_type);

DO $$ BEGIN RAISE NOTICE 'STEP 8 DONE: questions.subtopic_id added'; END $$;

-- ============================================================
-- STEP 9: FINAL VERIFICATION
-- ============================================================

DO $$
DECLARE
  t      TEXT;
  tables TEXT[] := ARRAY[
    'subtopics',
    'subtopic_progress',
    'subtopic_quiz_attempts',
    'subtopic_quiz_answers',
    'question_sub_parts'
  ];
  cols   TEXT[] := ARRAY[
    'password_reset_token',
    'password_reset_expires',
    'subscription_status',
    'subscription_expires_at'
  ];
  q_count  INTEGER;
  ao_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO q_count  FROM questions WHERE status = 'approved';
  SELECT COUNT(*) INTO ao_count FROM answer_options;

  RAISE NOTICE '--- DATA CHECK ---';
  RAISE NOTICE 'Approved questions: %', q_count;
  RAISE NOTICE 'Answer options    : %', ao_count;

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

  RAISE NOTICE '--- WAVE 1A FINAL FIX COMPLETE ---';
END $$;
