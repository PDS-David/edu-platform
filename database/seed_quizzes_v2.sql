-- ============================================================
-- EAC LEARNING PLATFORM — QUIZZES SEED (v2)
-- 32 quizzes: one per subject per exam board
-- Questions linked via questions.quiz_id column directly
-- (test_questions is for custom_tests, not quizzes)
-- ============================================================

BEGIN;

-- ── 1. Create quizzes ────────────────────────────────────────

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

-- ── 2. Link questions to quizzes via questions.quiz_id ───────
-- Each question already knows its exam_board_id and subject_id_uuid
-- Match to the quiz that covers the same board + subject name

UPDATE questions q
SET quiz_id = qz.id
FROM quizzes qz
JOIN subjects s
  ON s.exam_board_id = qz.exam_board_id
  AND qz.title = s.exam_board_id::text || ' ' || s.name || ' Quiz'
WHERE q.exam_board_id   = qz.exam_board_id
  AND q.subject_id_uuid = s.id
  AND q.status = 'approved';

-- Simpler fallback match in case above title match fails:
-- Match by exam_board_id + subject_id_uuid directly
UPDATE questions q
SET quiz_id = (
  SELECT qz.id
  FROM quizzes qz
  JOIN subjects s ON s.exam_board_id = qz.exam_board_id
    AND qz.title LIKE '%' || s.name || '%'
  WHERE s.id = q.subject_id_uuid
    AND qz.exam_board_id = q.exam_board_id
  LIMIT 1
)
WHERE q.status = 'approved'
  AND q.quiz_id IS NULL;

-- ── 3. Verify ────────────────────────────────────────────────

SELECT 'quizzes' AS tbl, COUNT(*) AS rows FROM quizzes
UNION ALL
SELECT 'questions with quiz_id', COUNT(*) FROM questions WHERE quiz_id IS NOT NULL;

SELECT
  qz.title,
  COUNT(q.id) AS question_count
FROM quizzes qz
LEFT JOIN questions q ON q.quiz_id = qz.id
GROUP BY qz.id, qz.title
ORDER BY qz.title;

COMMIT;
