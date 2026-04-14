-- =============================================================================
-- migration_003.sql
-- Creates ALL remaining tables referenced in code but missing from the database.
--
-- Tables created:
--   Core learning flow (blocks student usage if missing):
--     1.  answer_options
--     2.  subtopic_progress
--     3.  quiz_attempts
--     4.  student_answers
--     5.  subtopic_quiz_attempts
--     6.  subtopic_quiz_answers
--     7.  concepts
--     8.  concept_dependencies
--     9.  question_concepts
--     10. student_concept_mastery
--
--   Gamification / notifications:
--     11. user_badges
--     12. notifications
--
--   AI features:
--     13. ai_chat_sessions
--     14. ai_chat_messages
--     15. ai_explanation_cache
--     16. user_learning_profile
--     17. user_weak_topics
--
--   Content / resources:
--     18. courses
--     19. enrollments
--     20. videos
--     21. resources
--     22. revision_notes
--     23. past_papers
--     24. video_progress
--
--   Planning / analytics:
--     25. study_plans
--     26. student_exam_types
--     27. student_analytics
--     28. ai_question_logs
--
-- Safe to run multiple times  all use CREATE TABLE IF NOT EXISTS.
-- =============================================================================


-- 
-- 1. answer_options
--    Stores MCQ options for questions. Used by quiz/practice submission
--    to check correct answers. CRITICAL  every answer check will fail without it.
-- 
CREATE TABLE IF NOT EXISTS answer_options (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  INTEGER      NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text  TEXT         NOT NULL,
  is_correct   BOOLEAN      NOT NULL DEFAULT false,
  order_index  INTEGER      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_answer_options_question_id ON answer_options(question_id);


-- 
-- 2. subtopic_progress
--    Tracks per-student per-subtopic completion. Used by dashboard
--    "What's Next" and progress bars.
-- 
CREATE TABLE IF NOT EXISTS subtopic_progress (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id      INTEGER     NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  quiz_completed   BOOLEAN     NOT NULL DEFAULT false,
  notes_viewed     BOOLEAN     NOT NULL DEFAULT false,
  video_watched    BOOLEAN     NOT NULL DEFAULT false,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, subtopic_id)
);
CREATE INDEX IF NOT EXISTS idx_subtopic_progress_student_id  ON subtopic_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_subtopic_progress_subtopic_id ON subtopic_progress(subtopic_id);


-- 
-- 3. quiz_attempts
--    Header record for each quiz submission (quizController.js).
-- 
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id      UUID,
  student_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score        INTEGER,
  total_marks  INTEGER,
  percentage   NUMERIC(5,2),
  start_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time     TIMESTAMPTZ,
  status       VARCHAR(20) NOT NULL DEFAULT 'completed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id ON quiz_attempts(student_id);


-- 
-- 4. student_answers
--    Individual answer rows within a quiz_attempt.
-- 
CREATE TABLE IF NOT EXISTS student_answers (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id         UUID    NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id        INTEGER NOT NULL REFERENCES questions(id)     ON DELETE CASCADE,
  selected_option_id UUID    REFERENCES answer_options(id)         ON DELETE SET NULL,
  is_correct         BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_answers_attempt_id ON student_answers(attempt_id);


-- 
-- 5. subtopic_quiz_attempts
--    Richer quiz attempt record used by QuizTab / subtopic quiz flow.
-- 
CREATE TABLE IF NOT EXISTS subtopic_quiz_attempts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  subtopic_id    INTEGER     REFERENCES subtopics(id)            ON DELETE SET NULL,
  subject_id     INTEGER     REFERENCES subjects(id)             ON DELETE SET NULL,
  exam_board_id  INTEGER     REFERENCES exam_boards(id)          ON DELETE SET NULL,
  paper_type     VARCHAR(50),
  total_score    INTEGER     NOT NULL DEFAULT 0,
  max_score      INTEGER     NOT NULL DEFAULT 0,
  accuracy_pct   NUMERIC(5,2),
  time_taken_ms  INTEGER,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subtopic_quiz_attempts_student_id  ON subtopic_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_subtopic_quiz_attempts_subtopic_id ON subtopic_quiz_attempts(subtopic_id);


-- 
-- 6. subtopic_quiz_answers
--    Per-question answers within a subtopic_quiz_attempt.
-- 
CREATE TABLE IF NOT EXISTS subtopic_quiz_answers (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id         UUID    NOT NULL REFERENCES subtopic_quiz_attempts(id) ON DELETE CASCADE,
  question_id        INTEGER NOT NULL REFERENCES questions(id)               ON DELETE CASCADE,
  selected_option_id UUID    REFERENCES answer_options(id)                   ON DELETE SET NULL,
  typed_answer       TEXT,
  is_correct         BOOLEAN NOT NULL DEFAULT false,
  marks_awarded      NUMERIC(4,2) NOT NULL DEFAULT 0,
  max_marks          NUMERIC(4,2) NOT NULL DEFAULT 1,
  time_taken_ms      INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subtopic_quiz_answers_attempt_id ON subtopic_quiz_answers(attempt_id);


-- 
-- 7. concepts
--    Atomic learning concepts within a subtopic. Used by ConceptList,
--    teacher content management, and AI weakness tracking.
-- 
CREATE TABLE IF NOT EXISTS concepts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subtopic_id         INTEGER     NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  difficulty_level    INTEGER     NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  estimated_minutes   INTEGER     NOT NULL DEFAULT 10,
  order_index         INTEGER     NOT NULL DEFAULT 0,
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_concepts_subtopic_id ON concepts(subtopic_id);


-- 
-- 8. concept_dependencies
--    Prerequisite relationships between concepts.
-- 
CREATE TABLE IF NOT EXISTS concept_dependencies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_concept_id  UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  child_concept_id   UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  dependency_type    VARCHAR(50) NOT NULL DEFAULT 'prerequisite',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(parent_concept_id, child_concept_id)
);


-- 
-- 9. question_concepts
--    Links questions to concepts (many-to-many). Used by AI weakness tracking.
-- 
CREATE TABLE IF NOT EXISTS question_concepts (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  concept_id   UUID    NOT NULL REFERENCES concepts(id)  ON DELETE CASCADE,
  weight       NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(question_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_question_concepts_question_id ON question_concepts(question_id);
CREATE INDEX IF NOT EXISTS idx_question_concepts_concept_id  ON question_concepts(concept_id);


-- 
-- 10. student_concept_mastery
--     Per-student mastery score for each concept. Powers the AI tutor
--     weakness detection and remediation recommendations.
-- 
CREATE TABLE IF NOT EXISTS student_concept_mastery (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  concept_id      UUID         NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  mastery_score   NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  attempts        INTEGER      NOT NULL DEFAULT 0,
  correct         INTEGER      NOT NULL DEFAULT 0,
  last_practiced  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_student_concept_mastery_student_id ON student_concept_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_student_concept_mastery_concept_id ON student_concept_mastery(concept_id);


-- 
-- 11. user_badges
--     Earned badges for gamification (XP middleware).
-- 
CREATE TABLE IF NOT EXISTS user_badges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code  VARCHAR(50) NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_code)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);


-- 
-- 12. notifications
--     In-app notifications shown in TopNav bell icon.
-- 
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  message     TEXT,
  type        VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  action_url  VARCHAR(500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON notifications(user_id, is_read);


-- 
-- 13. ai_chat_sessions
--     Groups AI chat messages by student/subject session.
-- 
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  subject_id  INTEGER REFERENCES subjects(id)           ON DELETE SET NULL,
  subtopic_id INTEGER REFERENCES subtopics(id)          ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_student_id ON ai_chat_sessions(student_id);


-- 
-- 14. ai_chat_messages
--     Individual messages within an AI chat session.
-- 
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','system')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_id ON ai_chat_messages(session_id);


-- 
-- 15. ai_explanation_cache
--     Caches AI-generated explanations to avoid redundant API calls.
-- 
CREATE TABLE IF NOT EXISTS ai_explanation_cache (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id               INTEGER REFERENCES topics(id)    ON DELETE SET NULL,
  subtopic_id            INTEGER REFERENCES subtopics(id) ON DELETE SET NULL,
  original_explanation   TEXT,
  simplified_explanation TEXT,
  key_points             JSONB,
  source_question_count  INTEGER NOT NULL DEFAULT 0,
  model_used             VARCHAR(100),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_explanation_cache_subtopic_id ON ai_explanation_cache(subtopic_id);


-- 
-- 16. user_learning_profile
--     Aggregated learning stats per student used by AI tutor personalisation.
-- 
CREATE TABLE IF NOT EXISTS user_learning_profile (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  overall_accuracy_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_questions_done  INTEGER      NOT NULL DEFAULT 0,
  total_quiz_attempts   INTEGER      NOT NULL DEFAULT 0,
  total_subtopic_quizzes INTEGER     NOT NULL DEFAULT 0,
  study_streak_days     INTEGER      NOT NULL DEFAULT 0,
  xp_points             INTEGER      NOT NULL DEFAULT 0,
  accuracy_trend        VARCHAR(20)  DEFAULT 'stable',
  active_gap_count      INTEGER      NOT NULL DEFAULT 0,
  critical_gap_count    INTEGER      NOT NULL DEFAULT 0,
  last_activity_at      TIMESTAMPTZ,
  profile_updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- 
-- 17. user_weak_topics
--     Specific weak topic records per student. Powers AI remediation.
-- 
CREATE TABLE IF NOT EXISTS user_weak_topics (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  subject_id        INTEGER     REFERENCES subjects(id)           ON DELETE SET NULL,
  topic_name        VARCHAR(255) NOT NULL,
  subtopic_id       INTEGER     REFERENCES subtopics(id)          ON DELETE SET NULL,
  accuracy_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  attempts_count    INTEGER      NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  severity          VARCHAR(20)  NOT NULL DEFAULT 'moderate',
  learning_gap_id   UUID,
  refreshed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_weak_topics_student_id ON user_weak_topics(student_id);


-- 
-- 18. courses
--     Teacher-created course containers linking subjects to content.
-- 
CREATE TABLE IF NOT EXISTS courses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id       INTEGER     NOT NULL REFERENCES subjects(id)    ON DELETE CASCADE,
  teacher_id       UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  exam_board_id    INTEGER     REFERENCES exam_boards(id)           ON DELETE SET NULL,
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  difficulty_level VARCHAR(20)  DEFAULT 'intermediate',
  is_published     BOOLEAN      NOT NULL DEFAULT false,
  start_date       DATE,
  end_date         DATE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_courses_subject_id  ON courses(subject_id);
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id  ON courses(teacher_id);


-- 
-- 19. enrollments
--     Student enrollments in courses.
-- 
CREATE TABLE IF NOT EXISTS enrollments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  course_id           UUID        NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  enrollment_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  status              VARCHAR(20)  NOT NULL DEFAULT 'active',
  UNIQUE(student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id  ON enrollments(course_id);


-- 
-- 20. videos
--     Encrypted HLS video content uploaded by teachers.
-- 
CREATE TABLE IF NOT EXISTS videos (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                UUID        REFERENCES courses(id)  ON DELETE SET NULL,
  topic_id                 INTEGER     REFERENCES topics(id)   ON DELETE SET NULL,
  title                    VARCHAR(255) NOT NULL,
  description              TEXT,
  original_filename        VARCHAR(255),
  encrypted_playlist_url   TEXT,
  encryption_key_id        UUID,
  upload_status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
  duration_seconds         INTEGER,
  is_free                  BOOLEAN      NOT NULL DEFAULT false,
  required_tier            VARCHAR(50)  NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_videos_course_id ON videos(course_id);
CREATE INDEX IF NOT EXISTS idx_videos_topic_id  ON videos(topic_id);


-- 
-- 21. resources
--     Uploaded files (PDFs, notes, etc.) attached to topics/subtopics.
-- 
CREATE TABLE IF NOT EXISTS resources (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        INTEGER     REFERENCES topics(id)    ON DELETE SET NULL,
  subject_id      INTEGER     REFERENCES subjects(id)  ON DELETE SET NULL,
  subtopic_id     INTEGER     REFERENCES subtopics(id) ON DELETE SET NULL,
  uploaded_by     UUID        REFERENCES users(id)     ON DELETE SET NULL,
  title           VARCHAR(255) NOT NULL,
  resource_type   VARCHAR(50)  NOT NULL DEFAULT 'document',
  file_url        TEXT,
  hls_path        TEXT,
  file_size_bytes INTEGER,
  content_url     TEXT,
  is_free         BOOLEAN      NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resources_topic_id   ON resources(topic_id);
CREATE INDEX IF NOT EXISTS idx_resources_subject_id ON resources(subject_id);


-- 
-- 22. revision_notes
--     Teacher-authored HTML notes per subtopic shown to students.
-- 
CREATE TABLE IF NOT EXISTS revision_notes (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  subtopic_id  INTEGER NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  content_html TEXT,
  created_by   UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revision_notes_subtopic_id ON revision_notes(subtopic_id);


-- 
-- 23. past_papers
--     Uploaded exam past papers accessible via PastPapersPage.
-- 
CREATE TABLE IF NOT EXISTS past_papers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id       INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_board       VARCHAR(50),
  year             INTEGER,
  paper_type       VARCHAR(50),
  title            VARCHAR(255) NOT NULL,
  file_url         TEXT        NOT NULL,
  file_size_bytes  INTEGER,
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_past_papers_subject_id ON past_papers(subject_id);


-- 
-- 24. video_progress
--     Tracks per-student video watch progress.
-- 
CREATE TABLE IF NOT EXISTS video_progress (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id               UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  video_id                 UUID        NOT NULL REFERENCES videos(id)  ON DELETE CASCADE,
  current_position_seconds INTEGER     NOT NULL DEFAULT 0,
  total_watched_seconds    INTEGER     NOT NULL DEFAULT 0,
  watch_percentage         NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_completed             BOOLEAN     NOT NULL DEFAULT false,
  completed_at             TIMESTAMPTZ,
  last_watched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_video_progress_student_id ON video_progress(student_id);


-- 
-- 25. study_plans
--     AI-generated personalised study plans per student.
-- 
CREATE TABLE IF NOT EXISTS study_plans (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  start_date    DATE,
  end_date      DATE,
  topics_per_day INTEGER    NOT NULL DEFAULT 2,
  skip_weekends BOOLEAN     NOT NULL DEFAULT false,
  plan_json     JSONB,
  summary_json  JSONB
);
CREATE INDEX IF NOT EXISTS idx_study_plans_user_id ON study_plans(user_id);


-- 
-- 26. student_exam_types
--     Records which exam boards/types a student has selected during onboarding.
-- 
CREATE TABLE IF NOT EXISTS student_exam_types (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID    NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  exam_board_id  INTEGER NOT NULL REFERENCES exam_boards(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, exam_board_id)
);
CREATE INDEX IF NOT EXISTS idx_student_exam_types_student_id ON student_exam_types(student_id);


-- 
-- 27. student_analytics
--     Materialised summary stats per student for admin dashboard.
-- 
CREATE TABLE IF NOT EXISTS student_analytics (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  total_attempts      INTEGER     NOT NULL DEFAULT 0,
  correct_attempts    INTEGER     NOT NULL DEFAULT 0,
  accuracy_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_time_seconds  INTEGER     NOT NULL DEFAULT 0,
  last_active         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 
-- 28. ai_question_logs
--     Audit log of AI-generated questions for admin review.
-- 
CREATE TABLE IF NOT EXISTS ai_question_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  INTEGER     REFERENCES questions(id) ON DELETE SET NULL,
  generated_by UUID        REFERENCES users(id)     ON DELETE SET NULL,
  model_used   VARCHAR(100),
  prompt_used  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_question_logs_question_id ON ai_question_logs(question_id);


-- 
-- VERIFICATION
-- 
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'answer_options', 'subtopic_progress', 'quiz_attempts',
    'student_answers', 'subtopic_quiz_attempts', 'subtopic_quiz_answers',
    'concepts', 'concept_dependencies', 'question_concepts',
    'student_concept_mastery', 'user_badges', 'notifications',
    'ai_chat_sessions', 'ai_chat_messages', 'ai_explanation_cache',
    'user_learning_profile', 'user_weak_topics', 'courses',
    'enrollments', 'videos', 'resources', 'revision_notes',
    'past_papers', 'video_progress', 'study_plans',
    'student_exam_types', 'student_analytics', 'ai_question_logs'
  )
ORDER BY table_name;

-- Should return exactly 28 rows
SELECT COUNT(*) AS tables_created
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'answer_options', 'subtopic_progress', 'quiz_attempts',
    'student_answers', 'subtopic_quiz_attempts', 'subtopic_quiz_answers',
    'concepts', 'concept_dependencies', 'question_concepts',
    'student_concept_mastery', 'user_badges', 'notifications',
    'ai_chat_sessions', 'ai_chat_messages', 'ai_explanation_cache',
    'user_learning_profile', 'user_weak_topics', 'courses',
    'enrollments', 'videos', 'resources', 'revision_notes',
    'past_papers', 'video_progress', 'study_plans',
    'student_exam_types', 'student_analytics', 'ai_question_logs'
  );


