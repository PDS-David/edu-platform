-- ============================================================
-- AISchoolonair — NOTIFICATIONS + HEALTH CHECK
-- ============================================================

BEGIN;

-- ── 1. WELCOME NOTIFICATIONS ─────────────────────────────────

-- John Doe notifications
INSERT INTO notifications (id, user_id, title, message, type, is_read, action_url, created_at)
VALUES
  (gen_random_uuid(),
   'cd818b5c-24c2-46a4-ae0c-5635d7f671b0',
   'Welcome to AISchoolonair!',
   'Hi John! Your account is active. Start practising with our question bank today.',
   'welcome', false, '/dashboard', NOW()),

  (gen_random_uuid(),
   'cd818b5c-24c2-46a4-ae0c-5635d7f671b0',
   'Subscription Confirmed — Student Yearly',
   'Your Student Yearly plan is active until March 2027. You have full access to all features.',
   'subscription', false, '/subscription', NOW()),

  (gen_random_uuid(),
   'cd818b5c-24c2-46a4-ae0c-5635d7f671b0',
   'You have access to 2 exam boards',
   'You can now access WAEC and JAMB content including quizzes, past papers and analytics.',
   'info', false, '/exam-boards', NOW());

-- Temitope Oludotun notifications
INSERT INTO notifications (id, user_id, title, message, type, is_read, action_url, created_at)
VALUES
  (gen_random_uuid(),
   '10429bfe-bb6b-4b01-99a1-f921bb956687',
   'Welcome to AISchoolonair!',
   'Hi Temitope! Your free trial is active for 14 days. Explore our question bank and quizzes.',
   'welcome', false, '/dashboard', NOW()),

  (gen_random_uuid(),
   '10429bfe-bb6b-4b01-99a1-f921bb956687',
   'Free Trial Started — 14 Days Remaining',
   'Your free trial gives you access to 1 exam board and 3 subjects. Upgrade anytime for full access.',
   'subscription', false, '/subscription', NOW()),

  (gen_random_uuid(),
   '10429bfe-bb6b-4b01-99a1-f921bb956687',
   'You have access to 2 exam boards',
   'You can now access WAEC and NECO content during your free trial period.',
   'info', false, '/exam-boards', NOW());

COMMIT;

-- ============================================================
-- 2. PLATFORM HEALTH CHECK
-- ============================================================

-- ── Row counts for all major tables ─────────────────────────
SELECT
  'users'              AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'exam_boards',        COUNT(*) FROM exam_boards
UNION ALL SELECT 'subjects',           COUNT(*) FROM subjects
UNION ALL SELECT 'questions',          COUNT(*) FROM questions
UNION ALL SELECT 'answer_options',     COUNT(*) FROM answer_options
UNION ALL SELECT 'quizzes',            COUNT(*) FROM quizzes
UNION ALL SELECT 'subscription_plans', COUNT(*) FROM subscription_plans
UNION ALL SELECT 'user_subscriptions', COUNT(*) FROM user_subscriptions
UNION ALL SELECT 'student_exam_types', COUNT(*) FROM student_exam_types
UNION ALL SELECT 'student_analytics',  COUNT(*) FROM student_analytics
UNION ALL SELECT 'teacher_subjects',   COUNT(*) FROM teacher_subjects
UNION ALL SELECT 'notifications',      COUNT(*) FROM notifications
ORDER BY table_name;

-- ── Questions: answer options coverage ──────────────────────
SELECT
  'Questions WITH answer options'    AS check_name,
  COUNT(DISTINCT q.id)               AS count
FROM questions q
JOIN answer_options ao ON ao.question_id = q.id
UNION ALL
SELECT
  'Questions WITHOUT answer options',
  COUNT(*)
FROM questions q
WHERE NOT EXISTS (
  SELECT 1 FROM answer_options ao WHERE ao.question_id = q.id
)
UNION ALL
SELECT
  'Questions with exactly 4 options',
  COUNT(*) FROM (
    SELECT question_id
    FROM answer_options
    GROUP BY question_id
    HAVING COUNT(*) = 4
  ) x
UNION ALL
SELECT
  'Questions with exactly 1 correct option',
  COUNT(*) FROM (
    SELECT question_id
    FROM answer_options
    WHERE is_correct = true
    GROUP BY question_id
    HAVING COUNT(*) = 1
  ) x;

-- ── Questions: explanation coverage ─────────────────────────
SELECT
  'Questions WITH explanation'  AS check_name, COUNT(*) AS count
FROM questions WHERE explanation IS NOT NULL
UNION ALL
SELECT
  'Questions WITHOUT explanation', COUNT(*)
FROM questions WHERE explanation IS NULL;

-- ── Students: subscription status ───────────────────────────
SELECT
  u.first_name || ' ' || u.last_name AS student,
  sp.plan_name,
  us.status,
  us.end_date::date AS expires,
  COUNT(set2.id) AS exam_boards_access
FROM users u
LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
LEFT JOIN student_exam_types set2 ON set2.student_id = u.id AND set2.is_active = true
WHERE u.role = 'student'
GROUP BY u.id, u.first_name, u.last_name, sp.plan_name, us.status, us.end_date
ORDER BY u.first_name;

-- ── Quizzes: question count check ───────────────────────────
SELECT
  'Quizzes with exactly 5 questions' AS check_name,
  COUNT(*) AS count
FROM (
  SELECT quiz_id
  FROM questions
  WHERE quiz_id IS NOT NULL
  GROUP BY quiz_id
  HAVING COUNT(*) = 5
) x
UNION ALL
SELECT
  'Quizzes with wrong question count',
  COUNT(*)
FROM (
  SELECT quiz_id
  FROM questions
  WHERE quiz_id IS NOT NULL
  GROUP BY quiz_id
  HAVING COUNT(*) != 5
) x
UNION ALL
SELECT
  'Quizzes with no questions linked',
  COUNT(*)
FROM quizzes qz
WHERE NOT EXISTS (
  SELECT 1 FROM questions q WHERE q.quiz_id = qz.id
);

-- ── Teachers: subject assignments ───────────────────────────
SELECT
  u.first_name || ' ' || u.last_name AS teacher,
  COUNT(ts.id) AS subjects_assigned
FROM users u
LEFT JOIN teacher_subjects ts ON ts.teacher_id = u.id AND ts.is_active = true
WHERE u.role = 'teacher'
GROUP BY u.id, u.first_name, u.last_name
ORDER BY u.first_name;

-- ── Orphan check: questions without subjects ─────────────────
SELECT
  'Questions with no valid subject' AS check_name,
  COUNT(*) AS count
FROM questions q
WHERE NOT EXISTS (
  SELECT 1 FROM subjects s WHERE s.id = q.subject_id_uuid
)
UNION ALL
SELECT
  'Questions with no valid exam board',
  COUNT(*)
FROM questions q
WHERE NOT EXISTS (
  SELECT 1 FROM exam_boards eb WHERE eb.id = q.exam_board_id
)
UNION ALL
SELECT
  'Answer options with no valid question',
  COUNT(*)
FROM answer_options ao
WHERE NOT EXISTS (
  SELECT 1 FROM questions q WHERE q.id = ao.question_id
)
UNION ALL
SELECT
  'student_exam_types with no valid subscription',
  COUNT(*)
FROM student_exam_types
WHERE subscription_id IS NULL;

-- ── Overall platform readiness summary ──────────────────────
SELECT
  CASE
    WHEN
      (SELECT COUNT(*) FROM questions WHERE quiz_id IS NOT NULL) = 160
      AND (SELECT COUNT(*) FROM answer_options) = 640
      AND (SELECT COUNT(*) FROM quizzes) = 32
      AND (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active') = 2
      AND (SELECT COUNT(*) FROM student_exam_types WHERE is_active = true) = 4
    THEN 'PLATFORM READY FOR TESTING'
    ELSE 'ISSUES FOUND — CHECK ABOVE'
  END AS platform_status;
