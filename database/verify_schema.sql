-- ============================================================
-- EAC LEARNING PLATFORM — SCHEMA VERIFICATION QUERY
-- Run this in psql or pgAdmin BEFORE making any changes.
-- It shows all tables, columns, data types, constraints.
-- ============================================================

-- 1. ALL TABLES in the public schema
SELECT
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. ALL COLUMNS across all tables (full detail)
SELECT
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c
    ON t.table_name = c.table_name
    AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public'
ORDER BY t.table_name, c.ordinal_position;

-- 3. USERS TABLE specifically — we need to check for phone, grade, pending_exam_board_ids
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'users'
ORDER BY ordinal_position;

-- 4. FOREIGN KEY CONSTRAINTS (to check UUID vs INTEGER mismatches)
SELECT
    tc.table_name        AS from_table,
    kcu.column_name      AS from_column,
    ccu.table_name       AS to_table,
    ccu.column_name      AS to_column,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema   = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema    = 'public'
ORDER BY tc.table_name;

-- 5. INDEXES
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 6. ROW COUNTS (quick health check)
SELECT
    'users'              AS tbl, COUNT(*) AS rows FROM users
UNION ALL SELECT 'exam_boards',          COUNT(*) FROM exam_boards
UNION ALL SELECT 'subjects',             COUNT(*) FROM subjects
UNION ALL SELECT 'questions',            COUNT(*) FROM questions
UNION ALL SELECT 'subscription_plans',   COUNT(*) FROM subscription_plans
UNION ALL SELECT 'student_analytics',    COUNT(*) FROM student_analytics
UNION ALL SELECT 'student_exam_types',   COUNT(*) FROM student_exam_types
UNION ALL SELECT 'teacher_subjects',     COUNT(*) FROM teacher_subjects
ORDER BY tbl;

-- 7. SUBSCRIPTION PLANS (current plan config)
SELECT
    plan_code,
    plan_name,
    price_monthly,
    price_yearly,
    max_exam_boards,
    max_subjects,
    has_analytics,
    has_video_access,
    features
FROM subscription_plans
ORDER BY id;

-- ============================================================
-- BASED ON RESULTS:
-- Send the output of query #3 (users columns) back to Claude
-- before running any ALTER TABLE on the users table.
-- ============================================================
