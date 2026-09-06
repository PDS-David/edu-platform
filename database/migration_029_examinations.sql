-- migration_029_examinations.sql
--
-- Phase 1 of the Examination feature (replaces the self-serve Mock Exam
-- with a teacher/admin-scheduled, assigned exam). This migration is
-- schema-only -- no backend routes, no frontend, no data migrated from
-- the old mock_exam-related tables (there are none; Mock Exam was always
-- ad-hoc random questions, never persisted as its own entity).
--
-- SAFETY MODEL: purely additive, safe to run multiple times.
--   - Three new tables only. No existing table is altered, renamed, or
--     dropped by this file.
--   - Every CREATE TABLE/INDEX uses IF NOT EXISTS; the one CHECK
--     constraint is added via a DO block guarded by
--     "EXCEPTION WHEN duplicate_object", matching the exact pattern
--     already used for resource_assignments' own target CHECK
--     constraint (see run_complete_migration.js, "C-3").
--
-- SCHEMA DECISIONS, verified against the actual live schema rather than
-- assumed from memory (per this feature's own task instructions):
--
--   - custom_tests.total_marks is a plain INTEGER column kept in sync at
--     the APPLICATION level (POST /teacher/tests/:id/questions
--     recomputes it as SUM(marks_allocated) whenever a question is
--     attached) -- there is no DB trigger anywhere in this schema doing
--     that sync. examinations.total_marks follows the exact same
--     convention: a plain column, defaulting to 0, that Phase 2's
--     backend work is responsible for keeping in sync the same way
--     custom_tests already does. Not implemented in this migration,
--     since Phase 1 is schema-only.
--
--   - This codebase actually has TWO different existing patterns for
--     "assign to a student or a class":
--       (a) test_assignments: student_id UUID NOT NULL always: a class
--           assignment gets expanded into one row per student at INSERT
--           time (see POST /teacher/tests/:id/assign), with class_id
--           kept only as an informational tag on each row, not a
--           separate class-level row.
--       (b) resource_assignments: student_id AND class_id both
--           nullable, with a CHECK requiring at least one to be set --
--           allowing a genuine single class-level row with no specific
--           student.
--     This feature's own spec is explicit: "Mirror test_assignments's
--     exact existing shape/pattern... rather than inventing a different
--     shape." examination_assignments below follows pattern (a):
--     student_id NOT NULL, class_id nullable and informational only.
--     Phase 2's assignment endpoint must expand a class-target request
--     into one row per student, exactly like
--     POST /teacher/tests/:id/assign already does.
--
--   - questions.id, subjects.id, exam_boards.id are all INTEGER (not
--     UUID) -- confirmed directly from test_questions'
--     "question_id INTEGER NOT NULL REFERENCES questions(id)" and
--     custom_tests' "subject_id INTEGER REFERENCES subjects(id)".
--
--   - classes.id is UUID (database/migration_001.sql). class_id here has
--     no foreign key, exactly matching test_assignments.class_id's own
--     bare-UUID-no-FK column -- kept consistent rather than tightened,
--     since tightening it here while the pattern it's mirroring doesn't
--     have one would be an inconsistent, undiscussed schema decision.

BEGIN;

CREATE TABLE IF NOT EXISTS examinations (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       UUID         NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  title            VARCHAR(255) NOT NULL,
  subject_id       INTEGER      REFERENCES subjects(id)             ON DELETE SET NULL,
  exam_board_id    INTEGER      REFERENCES exam_boards(id)          ON DELETE SET NULL,
  scheduled_start  TIMESTAMPTZ  NOT NULL,
  duration_minutes INTEGER      NOT NULL DEFAULT 60,
  -- Kept in sync at the application level, same convention as
  -- custom_tests.total_marks (see note above) -- not a DB trigger.
  total_marks      INTEGER      NOT NULL DEFAULT 0,
  status           VARCHAR(20)  NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_examinations_created_by ON examinations(created_by);
CREATE INDEX IF NOT EXISTS idx_examinations_status     ON examinations(status);
CREATE INDEX IF NOT EXISTS idx_examinations_subject_id ON examinations(subject_id);

DO $$ BEGIN
  ALTER TABLE examinations
    ADD CONSTRAINT examinations_status_check
    CHECK (status IN ('draft', 'scheduled', 'live', 'completed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS examination_questions (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id  UUID    NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  -- Always a real questions.id -- both bank-picked and teacher-authored-
  -- for-this-exam questions are unified into the real `questions` table
  -- per this feature's own design decision (no separate custom-question
  -- storage path). A teacher-authored question is inserted into
  -- `questions` first (status: 'pending', going through the existing
  -- review queue) and only then attached here with its resulting id --
  -- Phase 2's concern, not this migration's.
  question_id     INTEGER NOT NULL REFERENCES questions(id)    ON DELETE CASCADE,
  question_order  INTEGER NOT NULL DEFAULT 0,
  marks_allocated INTEGER NOT NULL DEFAULT 1,
  -- Free-text marking rubric for this question within this exam. MUST
  -- NEVER be selected by any student-facing endpoint -- Phase 3's
  -- concern, but noting it here since it's the reason this column
  -- exists at all. Nullable: most questions won't need a custom guide
  -- beyond the question's own explanation/correct_answer.
  marking_guide   TEXT,
  UNIQUE(examination_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_eq_examination_id ON examination_questions(examination_id);

CREATE TABLE IF NOT EXISTS examination_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID        NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
  -- NOT NULL by design -- see the pattern-(a)-vs-(b) note above. A class
  -- assignment must be expanded into one row per student before INSERT.
  student_id     UUID        NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  -- Informational tag only (which class this assignment came from), not
  -- an alternate target -- bare UUID, no FK, matching
  -- test_assignments.class_id exactly.
  class_id       UUID,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  score          INTEGER,
  UNIQUE(examination_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_ea_examination_id ON examination_assignments(examination_id);
CREATE INDEX IF NOT EXISTS idx_ea_student_id     ON examination_assignments(student_id);

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'examinations')             AS examinations_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'examination_questions')     AS examination_questions_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'examination_assignments')   AS examination_assignments_table_exists,
  (SELECT COUNT(*) FROM examinations)             AS examinations_row_count_should_be_0,
  (SELECT COUNT(*) FROM examination_questions)    AS examination_questions_row_count_should_be_0,
  (SELECT COUNT(*) FROM examination_assignments)  AS examination_assignments_row_count_should_be_0;

-- Expect all three *_table_exists columns = 1, all three *_row_count
-- columns = 0 (freshly created, or already existed and untouched by any
-- data-modifying statement in this file -- there are none). If both
-- look right, nothing existing changed and the new tables are ready.
-- COMMIT;
-- ROLLBACK;
