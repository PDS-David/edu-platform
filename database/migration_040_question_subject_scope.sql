-- Add a direct subject classification to questions.
-- This is intentionally nullable because older orphaned questions have no
-- reliable subject information and must remain App-Admin-only until classified.
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS subject_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_subject_id_fkey'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_subject_id
  ON questions(subject_id);

-- Backfill every already-classified question from its authoritative
-- subtopic -> topic -> subject relationship. Do not guess subjects for
-- genuinely unclassified questions.
UPDATE questions q
   SET subject_id = t.subject_id
  FROM subtopics st
  JOIN topics t ON t.id = st.topic_id
 WHERE q.subtopic_id = st.id
   AND q.subject_id IS NULL;
