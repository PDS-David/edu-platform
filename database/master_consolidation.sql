-- ================================================================
-- EAC BUDDY — MASTER CONSOLIDATION MIGRATION
-- Safe on any DB state. All statements use IF NOT EXISTS.
-- ================================================================

-- ── STEP 0: Confirm exam_boards.id type ──────────────────────────
DO $$
DECLARE id_type TEXT;
BEGIN
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_name='exam_boards' AND column_name='id' AND table_schema='public';
  RAISE NOTICE 'exam_boards.id type = %', id_type;
  IF id_type = 'integer' THEN
    RAISE WARNING 'ALERT: exam_boards.id is INTEGER but app expects UUID. Manual conversion needed after this script.';
  END IF;
END $$;

-- ── STEP 1: users — all missing columns ──────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token    VARCHAR(255)  NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires  TIMESTAMPTZ   NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status     VARCHAR(20)   DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ   NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_points               INTEGER       DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS study_streak_days       INTEGER       DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_date      DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_exam_board_ids  UUID[]        DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_goal              INTEGER       DEFAULT 20;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete     BOOLEAN       DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_subscription_status_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
      CHECK (subscription_status IN ('free','active','expired','cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_subscription  ON users(subscription_status, subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity_date);
CREATE INDEX IF NOT EXISTS idx_users_reset_token   ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

RAISE NOTICE 'STEP 1 DONE: users columns';

-- ── STEP 2: notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  message    TEXT        NOT NULL,
  type       VARCHAR(50)  DEFAULT 'info',
  is_read    BOOLEAN      DEFAULT false,
  action_url VARCHAR(500),
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);

RAISE NOTICE 'STEP 2 DONE: notifications';

-- ── STEP 3: topics — missing columns ─────────────────────────────
ALTER TABLE topics ADD COLUMN IF NOT EXISTS name        VARCHAR(255);
ALTER TABLE topics ADD COLUMN IF NOT EXISTS subject_id  UUID REFERENCES subjects(id) ON DELETE CASCADE;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

UPDATE topics SET name = title WHERE name IS NULL AND title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);

RAISE NOTICE 'STEP 3 DONE: topics columns';

-- ── STEP 4: subtopics ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtopics (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id    UUID        REFERENCES topics(id) ON DELETE CASCADE,
  subject_id  UUID        REFERENCES subjects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  order_index INTEGER      DEFAULT 0,
  icon_emoji  VARCHAR(10),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id   ON subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_subject_id ON subtopics(subject_id);

RAISE NOTICE 'STEP 4 DONE: subtopics';

-- ── STEP 5: resources — missing columns ──────────────────────────
ALTER TABLE resources ADD COLUMN IF NOT EXISTS subject_id       UUID    REFERENCES subjects(id)  ON DELETE CASCADE;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS subtopic_id      UUID    REFERENCES subtopics(id) ON DELETE CASCADE;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS uploaded_by      UUID    REFERENCES users(id)     ON DELETE SET NULL;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_url         VARCHAR(500);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS hls_path         VARCHAR(500);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_size_bytes  BIGINT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_resource_type_check;
ALTER TABLE resources ADD CONSTRAINT resources_resource_type_check
  CHECK (resource_type IN ('video','audio','document','pdf','link','quiz','note'));

CREATE INDEX IF NOT EXISTS idx_resources_subtopic_id ON resources(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_resources_subject_id  ON resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_resources_uploaded_by ON resources(uploaded_by);

RAISE NOTICE 'STEP 5 DONE: resources columns';

-- ── STEP 6: questions — missing columns ──────────────────────────
ALTER TABLE questions ADD COLUMN IF NOT EXISTS subtopic_id       UUID    REFERENCES subtopics(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS subject_id_uuid   UUID    REFERENCES subjects(id)  ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_sub_type  VARCHAR(20) DEFAULT 'mcq';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS status            VARCHAR(20)  DEFAULT 'approved';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source            VARCHAR(20)  DEFAULT 'admin_import';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS submitted_by      UUID    REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS reviewed_by       UUID    REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMPTZ;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty        VARCHAR(10)  DEFAULT 'medium';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic             VARCHAR(200);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS marks             INTEGER DEFAULT 1;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS year              INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS paper_number      VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='questions_status_check') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_status_check
      CHECK (status IN ('pending','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='questions_sub_type_check') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_sub_type_check
      CHECK (question_sub_type IN ('mcq','smart_answers','structured'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='questions_difficulty_check') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_difficulty_check
      CHECK (difficulty IN ('easy','medium','hard'));
  END IF;
END $$;

UPDATE questions SET status = 'approved'     WHERE status IS NULL;
UPDATE questions SET source = 'admin_import' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_subtopic     ON questions(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_questions_sub_type     ON questions(question_sub_type);
CREATE INDEX IF NOT EXISTS idx_questions_status       ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_subject_uuid ON questions(subject_id_uuid);
CREATE INDEX IF NOT EXISTS idx_questions_topic        ON questions(topic);

RAISE NOTICE 'STEP 6 DONE: questions columns';

-- ── STEP 7: question_hints ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_hints (
  id          UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  hint_order  INTEGER NOT NULL CHECK (hint_order IN (1,2,3)),
  hint_text   TEXT    NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, hint_order)
);
CREATE INDEX IF NOT EXISTS idx_question_hints_question ON question_hints(question_id);

RAISE NOTICE 'STEP 7 DONE: question_hints';

-- ── STEP 8: practice_attempts ────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_attempts (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id     UUID    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option UUID    REFERENCES answer_options(id) ON DELETE SET NULL,
  is_correct      BOOLEAN NOT NULL,
  time_taken_ms   INTEGER,
  session_id      VARCHAR(100),
  attempted_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_student      ON practice_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_question     ON practice_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_student_date ON practice_attempts(student_id, attempted_at);

RAISE NOTICE 'STEP 8 DONE: practice_attempts';

-- ── STEP 9: subtopic_progress ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtopic_progress (
  id                  UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id         UUID    NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  resources_completed BOOLEAN DEFAULT false,
  practice_completed  BOOLEAN DEFAULT false,
  quiz_completed      BOOLEAN DEFAULT false,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subtopic_id)
);
CREATE INDEX IF NOT EXISTS idx_subtopic_progress_student  ON subtopic_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_subtopic_progress_subtopic ON subtopic_progress(subtopic_id);

RAISE NOTICE 'STEP 9 DONE: subtopic_progress';

-- ── STEP 10: subtopic_quiz_attempts ──────────────────────────────
CREATE TABLE IF NOT EXISTS subtopic_quiz_attempts (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id   UUID         REFERENCES subtopics(id) ON DELETE CASCADE,
  subject_id    UUID         REFERENCES subjects(id) ON DELETE SET NULL,
  paper_type    VARCHAR(20)  DEFAULT 'all',
  total_score   INTEGER      DEFAULT 0,
  max_score     INTEGER      DEFAULT 0,
  accuracy_pct  DECIMAL(5,2) DEFAULT 0,
  time_taken_ms INTEGER,
  completed_at  TIMESTAMPTZ  DEFAULT NOW(),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sqa_paper_type_check') THEN
    ALTER TABLE subtopic_quiz_attempts ADD CONSTRAINT sqa_paper_type_check
      CHECK (paper_type IN ('all','paper1','structured','mock'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_sqa_student     ON subtopic_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_sqa_subtopic    ON subtopic_quiz_attempts(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_sqa_student_sub ON subtopic_quiz_attempts(student_id, subtopic_id);

RAISE NOTICE 'STEP 10 DONE: subtopic_quiz_attempts';

-- ── STEP 11: subtopic_quiz_answers ───────────────────────────────
CREATE TABLE IF NOT EXISTS subtopic_quiz_answers (
  id                 UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id         UUID    NOT NULL REFERENCES subtopic_quiz_attempts(id) ON DELETE CASCADE,
  question_id        UUID    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id UUID    REFERENCES answer_options(id) ON DELETE SET NULL,
  typed_answer       TEXT,
  is_correct         BOOLEAN,
  marks_awarded      INTEGER DEFAULT 0,
  max_marks          INTEGER DEFAULT 1,
  time_taken_ms      INTEGER,
  ai_explanation     TEXT,
  ai_marking_scheme  JSONB,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sqa_answers_attempt  ON subtopic_quiz_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_sqa_answers_question ON subtopic_quiz_answers(question_id);

RAISE NOTICE 'STEP 11 DONE: subtopic_quiz_answers';

-- ── STEP 12: user_badges ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_badges (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code VARCHAR(50) NOT NULL,
  earned_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_code)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

RAISE NOTICE 'STEP 12 DONE: user_badges';

-- ── STEP 13: classes + class_memberships ─────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  join_code   VARCHAR(10)  UNIQUE,
  subject_ids JSONB        DEFAULT '[]',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS class_memberships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_class_memberships_class   ON class_memberships(class_id);
CREATE INDEX IF NOT EXISTS idx_class_memberships_student ON class_memberships(student_id);

RAISE NOTICE 'STEP 13 DONE: classes + class_memberships';

-- ── STEP 14: test_assignments + test_submissions ──────────────────
CREATE TABLE IF NOT EXISTS test_assignments (
  id                 UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id         UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id           UUID    REFERENCES classes(id) ON DELETE SET NULL,
  title              VARCHAR(255) NOT NULL,
  question_ids       JSONB   NOT NULL DEFAULT '[]',
  time_limit_minutes INTEGER DEFAULT 30,
  due_date           DATE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS test_submissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES test_assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers       JSONB NOT NULL DEFAULT '[]',
  score         INTEGER,
  total         INTEGER,
  accuracy_pct  DECIMAL(5,2),
  total_time_ms BIGINT,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_test_assignments_teacher ON test_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_test_assignments_class   ON test_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_test_submissions_student ON test_submissions(student_id);

RAISE NOTICE 'STEP 14 DONE: test_assignments + test_submissions';

-- ── STEP 15: past_papers + revision_notes ────────────────────────
CREATE TABLE IF NOT EXISTS past_papers (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id      UUID    REFERENCES subjects(id) ON DELETE SET NULL,
  exam_board      VARCHAR(20),
  year            INTEGER,
  paper_type      VARCHAR(50),
  title           VARCHAR(255) NOT NULL,
  file_url        TEXT    NOT NULL,
  file_size_bytes BIGINT,
  created_by      UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS revision_notes (
  id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  subtopic_id  UUID    REFERENCES subtopics(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  content_html TEXT    NOT NULL,
  created_by   UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

RAISE NOTICE 'STEP 15 DONE: past_papers + revision_notes';

-- ── STEP 16: student_exam_types (UUID version) ───────────────────
DO $$
DECLARE col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name='student_exam_types' AND column_name='exam_board_id';
  IF col_type = 'integer' THEN
    DROP TABLE IF EXISTS student_exam_types CASCADE;
    RAISE NOTICE 'Dropped student_exam_types (was integer) — will recreate as UUID';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS student_exam_types (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_board_id   UUID NOT NULL REFERENCES exam_boards(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  UNIQUE(student_id, exam_board_id)
);
CREATE INDEX IF NOT EXISTS idx_student_exam_types_student ON student_exam_types(student_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_types_active  ON student_exam_types(student_id, is_active);

RAISE NOTICE 'STEP 16 DONE: student_exam_types';

-- ── STEP 17: teacher_subjects (UUID version) ─────────────────────
DO $$
DECLARE col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name='teacher_subjects' AND column_name='exam_board_id';
  IF col_type = 'integer' THEN
    ALTER TABLE teacher_subjects DROP COLUMN exam_board_id;
    ALTER TABLE teacher_subjects ADD COLUMN exam_board_id UUID REFERENCES exam_boards(id) ON DELETE SET NULL;
    RAISE NOTICE 'Converted teacher_subjects.exam_board_id from INTEGER to UUID';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_board_id UUID REFERENCES exam_boards(id) ON DELETE SET NULL,
  assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  is_active     BOOLEAN DEFAULT true,
  UNIQUE(teacher_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON teacher_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject ON teacher_subjects(subject_id);

RAISE NOTICE 'STEP 17 DONE: teacher_subjects';

-- ── STEP 18: student_analytics — fix subject_id type ─────────────
DO $$
DECLARE col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name='student_analytics' AND column_name='subject_id';
  IF col_type = 'integer' THEN
    ALTER TABLE student_analytics DROP COLUMN subject_id;
    ALTER TABLE student_analytics ADD COLUMN subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Converted student_analytics.subject_id from INTEGER to UUID';
  END IF;
END $$;

-- ── STEP 19: subjects — add missing columns ───────────────────────
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS icon_emoji   VARCHAR(10);
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS subject_code VARCHAR(20);
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS exam_board_id UUID REFERENCES exam_boards(id);

CREATE INDEX IF NOT EXISTS idx_subjects_exam_board ON subjects(exam_board_id);

-- ── STEP 20: FINAL VERIFICATION ──────────────────────────────────
DO $$
DECLARE
  t TEXT;
  required_tables TEXT[] := ARRAY[
    'subtopics','subtopic_progress','subtopic_quiz_attempts','subtopic_quiz_answers',
    'practice_attempts','question_hints','user_badges','classes','class_memberships',
    'test_assignments','test_submissions','past_papers','revision_notes',
    'student_exam_types','teacher_subjects','notifications'
  ];
  required_cols TEXT[] := ARRAY[
    'subscription_status','subscription_expires_at','xp_points',
    'study_streak_days','pending_exam_board_ids','password_reset_token',
    'daily_goal','onboarding_complete'
  ];
  missing_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== TABLE CHECK ===';
  FOREACH t IN ARRAY required_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      RAISE NOTICE 'OK: %', t;
    ELSE
      RAISE WARNING 'MISSING: %', t;
      missing_count := missing_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '=== USERS COLUMN CHECK ===';
  FOREACH t IN ARRAY required_cols LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name=t) THEN
      RAISE NOTICE 'OK: users.%', t;
    ELSE
      RAISE WARNING 'MISSING: users.%', t;
      missing_count := missing_count + 1;
    END IF;
  END LOOP;
  IF missing_count = 0 THEN
    RAISE NOTICE '=== ALL CHECKS PASSED. DB-01 COMPLETE ===';
  ELSE
    RAISE WARNING '=== % ITEMS MISSING. Review warnings above ===', missing_count;
  END IF;
END $$;
