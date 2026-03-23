-- ============================================================
-- EAC LEARNING PLATFORM — QUIZZES SEED
-- 32 quizzes: one per subject per exam board
-- Questions linked via test_questions table
-- ============================================================

BEGIN;

-- ── 1. Create quizzes ────────────────────────────────────────
-- One quiz per subject, named "{Board} {Subject} Quiz"
-- Linked to exam_board_id and created by admin

INSERT INTO quizzes (
  id, created_by, title, description, quiz_type,
  time_limit_minutes, passing_score, total_marks,
  difficulty_level, is_published, allow_review,
  shuffle_questions, created_at, updated_at, exam_board_id
)
SELECT
  gen_random_uuid(),
  'fbbaaebd-f518-4394-9046-78c9b3317c1f',
  eb.code || ' ' || s.name || ' Quiz',
  'Practice quiz for ' || s.name || ' under ' || eb.name,
  'practice',
  10,
  60,
  5,
  'mixed',
  true,
  true,
  false,
  NOW(),
  NOW(),
  eb.id
FROM subjects s
JOIN exam_boards eb ON eb.id = s.exam_board_id
WHERE s.is_active = true AND eb.is_active = true
ORDER BY eb.code, s.name;

-- ── 2. Link questions to quizzes via test_questions ──────────
-- Match each quiz to its 5 questions via exam_board_id + subject

INSERT INTO test_questions (id, test_id, question_id, question_order, marks_allocated, created_at)
SELECT
  gen_random_uuid(),
  qz.id,
  q.id,
  ROW_NUMBER() OVER (PARTITION BY qz.id ORDER BY q.created_at),
  1,
  NOW()
FROM quizzes qz
JOIN questions q
  ON q.exam_board_id    = qz.exam_board_id
  AND q.subject_id_uuid IN (
    SELECT s.id FROM subjects s
    WHERE s.exam_board_id = qz.exam_board_id
      AND qz.title LIKE '%' || s.name || '%'
  )
WHERE q.status = 'approved';

-- ── 3. Update questions.quiz_id to link back ─────────────────

UPDATE questions q
SET quiz_id = qz.id
FROM quizzes qz
WHERE q.exam_board_id = qz.exam_board_id
  AND q.subject_id_uuid IN (
    SELECT s.id FROM subjects s
    WHERE s.exam_board_id = qz.exam_board_id
      AND qz.title LIKE '%' || s.name || '%'
  );

-- ── 4. Verify ────────────────────────────────────────────────

SELECT
  'quizzes' AS tbl, COUNT(*) AS rows FROM quizzes
UNION ALL
SELECT 'test_questions', COUNT(*) FROM test_questions;

SELECT
  qz.title,
  COUNT(tq.id) AS question_count
FROM quizzes qz
LEFT JOIN test_questions tq ON tq.test_id = qz.id
GROUP BY qz.id, qz.title
ORDER BY qz.title;

COMMIT;
