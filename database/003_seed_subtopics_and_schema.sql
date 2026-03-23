-- ============================================================
-- MIGRATION 003 — Seed subtopics + backfill questions.subtopic_id
-- For every topic that has no subtopics yet, insert one default
-- subtopic with name = topic name. Then set subtopic_id on all
-- questions that are still NULL.
-- Run AFTER 001 and 002.
-- ============================================================

BEGIN;

SET search_path TO public;

-- Step 1: Add gamification columns to users if not already there.
-- (Safe: ALTER TABLE … ADD COLUMN IF NOT EXISTS)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS xp_points           INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS study_streak_days   INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date  DATE,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN   DEFAULT FALSE;

-- Step 2: Add user_badges table if not already there
CREATE TABLE IF NOT EXISTS user_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code  VARCHAR(50) NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_code)
);

-- Step 3: Seed one default subtopic per topic (where none exists yet)
INSERT INTO subtopics (id, name, topic_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  t.name,          -- subtopic name = topic name for the default
  t.id,
  NOW(),
  NOW()
FROM topics t
WHERE NOT EXISTS (
  SELECT 1 FROM subtopics st WHERE st.topic_id = t.id
)
ON CONFLICT DO NOTHING;

-- Step 4: Backfill questions.subtopic_id where still NULL
UPDATE questions q
SET subtopic_id = (
  SELECT st.id
  FROM subtopics st
  JOIN topics t ON t.id = st.topic_id
  WHERE t.name = q.topic
    AND t.subject_id = q.subject_id_uuid
  ORDER BY st.created_at ASC   -- pick the oldest (default) subtopic
  LIMIT 1
)
WHERE q.subtopic_id IS NULL
  AND q.topic IS NOT NULL;

-- Step 5: Verify — target is 0
SELECT COUNT(*) AS still_missing_subtopic_id
FROM questions
WHERE subtopic_id IS NULL;

-- Step 6: Add past_papers table (used by Prompt 6)
CREATE TABLE IF NOT EXISTS past_papers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id       UUID REFERENCES subjects(id) ON DELETE SET NULL,
  exam_board       VARCHAR(20),
  year             INTEGER,
  paper_type       VARCHAR(50),
  title            VARCHAR(255) NOT NULL,
  file_url         TEXT NOT NULL,
  file_size_bytes  BIGINT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 7: Add revision_notes table (used by Prompt 7)
CREATE TABLE IF NOT EXISTS revision_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subtopic_id  UUID REFERENCES subtopics(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  content_html TEXT NOT NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 8: Add school/class tables (used by Prompts 12–13)
CREATE TABLE IF NOT EXISTS schools (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name       VARCHAR(255) NOT NULL,
  join_code  VARCHAR(10) UNIQUE,
  subject_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, student_id)
);

-- Step 9: Add test_assignments table (used by Prompt 13)
CREATE TABLE IF NOT EXISTS test_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id             UUID REFERENCES classes(id) ON DELETE SET NULL,
  title                VARCHAR(255) NOT NULL,
  question_ids         JSONB NOT NULL DEFAULT '[]',
  time_limit_minutes   INTEGER DEFAULT 30,
  due_date             DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES test_assignments(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers        JSONB NOT NULL DEFAULT '[]',
  total_time_ms  BIGINT,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, student_id)
);

COMMIT;
