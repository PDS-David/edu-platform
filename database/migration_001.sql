-- =============================================================================
-- migration_001.sql
-- Fixes for Prompts 2 and 5
--
-- What this does:
--   1. Adds 'free_trial' to the subscription_status enum  (Prompt 2)
--   2. Adds missing columns to topics table               (Prompt 5)
--   3. Adds missing columns to subtopics table            (Prompt 5)
--   4. Creates classes table                              (Prompt 5)
--   5. Creates class_memberships table                    (Prompt 5)
--   6. Creates custom_tests table                         (Prompt 5)
--   7. Creates test_questions table                       (Prompt 5)
--   8. Creates test_assignments table                     (Prompt 5)
--
-- Safe to run multiple times — every statement uses IF NOT EXISTS
-- or checks before altering, so re-running will not break anything.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD 'free_trial' TO subscription_status ENUM
--    The register function inserts 'free_trial' but the enum only has:
--    'free', 'active', 'expired', 'cancelled'
--    Without this, every new registration throws a 500 error.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'free_trial'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'enum_users_subscription_status'
      )
  ) THEN
    ALTER TYPE enum_users_subscription_status ADD VALUE 'free_trial';
    RAISE NOTICE 'Added free_trial to enum_users_subscription_status';
  ELSE
    RAISE NOTICE 'free_trial already exists in enum — skipping';
  END IF;
END
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ADD MISSING COLUMNS TO topics
--    Code references: title, created_by
--    DB currently has: id, subject_id, name, description, order_index,
--                      is_active, created_at, updated_at
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS title      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Backfill title from name for existing rows
UPDATE topics SET title = name WHERE title IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ADD MISSING COLUMNS TO subtopics
--    Code references: created_by
--    DB currently has: id, topic_id, subject_id, name, description, content,
--                      order_index, is_active, created_at, updated_at
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE subtopics
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CREATE classes TABLE
--    Used by: GET/POST /teacher/classes, POST /teacher/tests (class_id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  join_code   VARCHAR(20)  NOT NULL UNIQUE,
  subject_ids JSONB        NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CREATE class_memberships TABLE
--    Used by: GET /teacher/class/:classId/analytics, POST /teacher/tests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_memberships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   UUID        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_memberships_class_id   ON class_memberships(class_id);
CREATE INDEX IF NOT EXISTS idx_class_memberships_student_id ON class_memberships(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CREATE custom_tests TABLE
--    Used by: GET/POST /teacher/tests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_tests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id       INTEGER     REFERENCES subjects(id) ON DELETE SET NULL,
  title            VARCHAR(255) NOT NULL,
  duration_minutes INTEGER      NOT NULL DEFAULT 30,
  total_marks      INTEGER      NOT NULL DEFAULT 10,
  passing_marks    INTEGER      NOT NULL DEFAULT 5,
  is_published     BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_tests_teacher_id ON custom_tests(teacher_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CREATE test_questions TABLE
--    Used by: GET /teacher/tests (COUNT), POST /teacher/tests (INSERT)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_questions (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id          UUID    NOT NULL REFERENCES custom_tests(id) ON DELETE CASCADE,
  question_id      INTEGER NOT NULL REFERENCES questions(id)    ON DELETE CASCADE,
  question_order   INTEGER NOT NULL DEFAULT 0,
  marks_allocated  INTEGER NOT NULL DEFAULT 1,
  UNIQUE(test_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_test_questions_test_id ON test_questions(test_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CREATE test_assignments TABLE
--    Used by: GET /teacher/tests (COUNT submissions), POST /teacher/tests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     UUID        NOT NULL REFERENCES custom_tests(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  due_date    TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(test_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_test_assignments_test_id    ON test_assignments(test_id);
CREATE INDEX IF NOT EXISTS idx_test_assignments_student_id ON test_assignments(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run these SELECTs to confirm everything applied correctly
-- ─────────────────────────────────────────────────────────────────────────────
SELECT enumlabel AS subscription_status_values
FROM pg_enum
WHERE enumtypid = (
  SELECT oid FROM pg_type WHERE typname = 'enum_users_subscription_status'
)
ORDER BY enumsortorder;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('classes','class_memberships','custom_tests','test_questions','test_assignments')
ORDER BY table_name;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'topics'   AND column_name IN ('title','created_by');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'subtopics' AND column_name = 'created_by';
