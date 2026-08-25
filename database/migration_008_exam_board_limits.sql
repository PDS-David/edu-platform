-- migration_008_exam_board_limits.sql
--
-- Phase 3, Step 1 — moves the subject-count-limit logic that today lives as
-- two separately-hardcoded objects (server/routes/studentRoutes.js's
-- SUBJECT_LIMITS and client/src/pages/OnboardingPage.jsx's
-- ONBOARDING_LIMITS / REQUIRES_ALL_SUBJECTS) into the database, on
-- exam_boards, so there is exactly one source of truth.
--
-- SAFETY MODEL: purely ADDITIVE.
--   - Two new columns on exam_boards: max_subjects (nullable INTEGER) and
--     requires_all_subjects (BOOLEAN NOT NULL DEFAULT false).
--   - No existing column, table, row, or constraint is touched. Every board
--     not explicitly backfilled below keeps max_subjects = NULL (no limit)
--     and requires_all_subjects = false — i.e. today's behavior for any
--     board that wasn't in the old hardcoded objects.
--   - Backfill is a plain UPDATE by code (case-insensitive), matching the
--     values already hardcoded in the app today. Nothing changes in the
--     app's *behavior* until Step 2 (server/routes/studentRoutes.js) is
--     deployed to actually read these columns instead of its own object.
--
-- Run this the same way as every other migration this session: inside a
-- transaction, with a sanity-check SELECT before COMMIT, against a database
-- you have just taken a fresh pg_dump backup of. Test on staging first if
-- a staging database exists.

BEGIN;

-- 1. New columns — additive, safe defaults
ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS max_subjects INTEGER;
ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS requires_all_subjects BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill numeric limits — matches server/routes/studentRoutes.js's
--    SUBJECT_LIMITS object (JAMB:4, WAEC:9, NECO:9, JUPEB:4) exactly.
--    Note: client/src/pages/OnboardingPage.jsx's ONBOARDING_LIMITS also
--    listed a 'UTME' key, but there is no separate UTME exam_boards.code in
--    this schema — JAMB's own full_name is "JAMB/UTME" — so JAMB's value
--    covers it; no separate UTME row exists to backfill.
UPDATE exam_boards SET max_subjects = 4 WHERE UPPER(code) = 'JAMB';
UPDATE exam_boards SET max_subjects = 9 WHERE UPPER(code) = 'WAEC';
UPDATE exam_boards SET max_subjects = 9 WHERE UPPER(code) = 'NECO';
UPDATE exam_boards SET max_subjects = 4 WHERE UPPER(code) = 'JUPEB';

-- 3. Backfill requires_all_subjects — matches OnboardingPage.jsx's
--    REQUIRES_ALL_SUBJECTS = ['IELTS', 'TOEFL', 'SAT'].
UPDATE exam_boards SET requires_all_subjects = true WHERE UPPER(code) IN ('IELTS', 'TOEFL', 'SAT');

-- Sanity check before committing
SELECT
  (SELECT COUNT(*) FROM exam_boards) AS total_boards_unchanged_count,
  (SELECT COUNT(*) FROM exam_boards WHERE UPPER(code) IN ('JAMB','JUPEB') AND max_subjects = 4)  AS should_be_2,
  (SELECT COUNT(*) FROM exam_boards WHERE UPPER(code) IN ('WAEC','NECO')  AND max_subjects = 9)  AS should_be_2,
  (SELECT COUNT(*) FROM exam_boards WHERE UPPER(code) IN ('IELTS','TOEFL','SAT') AND requires_all_subjects = true) AS should_be_3,
  (SELECT COUNT(*) FROM exam_boards WHERE max_subjects IS NOT NULL AND UPPER(code) NOT IN ('JAMB','WAEC','NECO','JUPEB')) AS should_be_0,
  (SELECT COUNT(*) FROM exam_boards WHERE requires_all_subjects = true AND UPPER(code) NOT IN ('IELTS','TOEFL','SAT'))    AS should_be_0;

-- Expect: should_be_2 = 2 (both rows), should_be_2 = 2, should_be_3 = 3,
-- should_be_0 = 0, should_be_0 = 0, total_boards_unchanged_count = whatever
-- it was before this migration ran. If all match, COMMIT.
-- COMMIT;
-- ROLLBACK;
