-- database/diagnostics/check_firstalevel_account.sql
--
-- READ-ONLY. Changes nothing. Safe to run anytime.
--
-- Part of Prompt 1 (Follow-Up Fix Prompts Batch 3). Checks the actual
-- account state of firstalevel@gmail.com before assuming anything is
-- broken -- an individual student with no school_id is a legitimate,
-- supported state in this app (school_id is nullable, self-join by code
-- is deliberately disabled per commit 2643baf), so "no school" alone is
-- NOT evidence of a bug. This exists to distinguish that normal case from
-- a genuine duplicate-account bug left over from the now-fixed
-- registration crash (PR merged as fix/register-duplicate-email-crash).
--
-- CONFIRMED CONTEXT (2026-08-28): this email is one of 4 students with an
-- active student_exam_types row now living on exam_board_id=21 (CAMBAL)
-- after migration_017's merge. Re-run that context check below too, in
-- case anything's changed since.
--
-- RESULT (2026-08-29): ran clean -- exactly one account, no near-
-- duplicates, school_id NULL, one exam-board enrollment row (board 21,
-- approved). Legitimate individual/unaffiliated student. NOT a bug.
-- Nothing to fix. Kept as a reusable script in case this pattern needs
-- checking for a different email later.

-- 1. Exact-match account lookup.
SELECT id, email, role, school_id, created_at
  FROM users WHERE LOWER(email) = 'firstalevel@gmail.com';

-- 2. Near-duplicate check (whitespace, alias, typo'd second account).
SELECT id, email, role, school_id, created_at
  FROM users WHERE LOWER(email) LIKE '%firstalevel%';

-- 3. Current exam-board enrollment context.
SELECT set2.exam_board_id, eb.code, eb.name, set2.status, set2.granted_at
  FROM student_exam_types set2
  JOIN users u ON u.id = set2.student_id
  JOIN exam_boards eb ON eb.id = set2.exam_board_id
 WHERE LOWER(u.email) = 'firstalevel@gmail.com';

-- READ THE OUTPUT AS:
--   Query 1 returns exactly one row, school_id IS NULL, query 2 returns
--   nothing extra -> likely a legitimate individual/unaffiliated student.
--   NOT a bug on its own. If they should be attached to a school, that's
--   a school admin adding them directly (self-join is disabled) -- a
--   support action, not a code fix.
--
--   Query 1 or 2 returns MORE THAN ONE row for what should be the same
--   person -> a real bug, likely a gap in the duplicate-email crash fix.
--   STOP and report the exact rows (created_at, role, anything that
--   differs) before writing any fix -- do not merge/delete rows blind.
