-- migration_036_examination_answer_persistence.sql
--
-- Persist per-question answers and grading feedback for scheduled
-- examinations. The existing examination_assignments table intentionally
-- stores only assignment-level state/score; this table preserves the
-- detailed result shown immediately after submission so it remains
-- available when the student reopens the examination later.
--
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS examination_answers (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id      UUID        NOT NULL REFERENCES examination_assignments(id) ON DELETE CASCADE,
  question_id        INTEGER     NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer    TEXT,
  is_correct         BOOLEAN     NOT NULL DEFAULT false,
  marks_awarded      INTEGER     NOT NULL DEFAULT 0,
  max_marks          INTEGER     NOT NULL DEFAULT 0,
  feedback           TEXT,
  time_taken_seconds INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_examination_answers_assignment_id
  ON examination_answers(assignment_id);

CREATE INDEX IF NOT EXISTS idx_examination_answers_question_id
  ON examination_answers(question_id);

COMMIT;
