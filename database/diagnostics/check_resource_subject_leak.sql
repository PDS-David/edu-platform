-- database/diagnostics/check_resource_subject_leak.sql
--
-- READ-ONLY. Changes nothing. Safe to run anytime.
--
-- Part of Prompt 3 (Follow-Up Fix Prompts Batch 3) -- a report of English
-- resources appearing for Science (or other cross-subject) students.
--
-- CONFIRMED NOT THE CAUSE: the class-push subject-leak fix from earlier
-- this engagement (commit 0446a17, server/routes/resourceRoutes.js) is
-- still intact and unmodified on main as of 2026-08-28 -- all three
-- `student_subjects ss` guards (GET /, /my-assignments, /:id/download)
-- are present. This is a DIFFERENT, not-yet-found mechanism.
--
-- REQUIRED BEFORE RUNNING THIS FILE: get a specific example from whoever
-- reported it -- which resource (title is enough), which subject it
-- should be under, which subject the student who saw it wrongly is
-- actually enrolled in. Without that, this file can't target anything.
--
-- HOW TO USE: replace the two placeholders below
-- ('<RESOURCE TITLE HERE>' and '<STUDENT UUID HERE>') with real values,
-- then run each query in order. Stop and read the "READ THE OUTPUT AS"
-- notes after query 1 before running the rest -- which follow-up queries
-- are relevant depends on what query 1 shows.

-- 1. What subject is the resource actually tagged under, and how was it pushed?
SELECT id, title, subject_id, push_type, is_active
  FROM resources WHERE title ILIKE '%<RESOURCE TITLE HERE>%';

-- READ THE OUTPUT AS:
--   subject_id is set and looks correct for the resource's real subject
--   -> mechanism 1 (bad tag at upload) is RULED OUT. Continue to query 2/3.
--
--   subject_id IS NULL -> mechanism 2 (missing subject tag on a resource
--   that should have one). This is a DATA fix on this specific resource
--   (set the correct subject_id), not a code change. Confirm with
--   whoever uploaded it what the correct subject should be before
--   changing it.
--
--   subject_id is set but to the WRONG subject entirely (e.g. tagged
--   Science when it's actually English content) -> mechanism 1 (bad tag
--   at upload). Also a DATA fix on this specific resource, not a code
--   change.

-- 2. How was this resource actually assigned to the specific student who saw it wrongly?
SELECT * FROM resource_assignments WHERE resource_id = (
  SELECT id FROM resources WHERE title ILIKE '%<RESOURCE TITLE HERE>%' LIMIT 1
);
SELECT * FROM resource_user_assignments WHERE resource_id = (
  SELECT id FROM resources WHERE title ILIKE '%<RESOURCE TITLE HERE>%' LIMIT 1
);

-- 3. Cross-reference: is the affected student actually enrolled in the resource's subject?
SELECT ss.subject_id, s.name, ss.status
  FROM student_subjects ss
  JOIN subjects s ON s.id = ss.subject_id
 WHERE ss.student_id = '<STUDENT UUID HERE>';

-- READ QUERIES 2+3 TOGETHER AS:
--   If the student's assignment came through resource_assignments.class_id
--   (a class-wide push) and they're NOT enrolled in the resource's
--   subject per query 3 -> this WOULD mean the already-fixed guard has a
--   gap. Stop and report the exact rows rather than assuming -- re-check
--   server/routes/resourceRoutes.js's three guards directly against this
--   specific case before concluding the fix is incomplete.
--
--   If the student's assignment came through an individual
--   resource_assignments.student_id or resource_user_assignments.user_id
--   row -> this is mechanism 3 (the direct/individual assignment path's
--   eligibleIds filtering, asserted correct in the original fix's commit
--   message but never independently re-verified with live data). Review
--   PUT /:id/assign-users's eligibleIds logic in resourceRoutes.js
--   (~line 830 onward) against this specific case.
