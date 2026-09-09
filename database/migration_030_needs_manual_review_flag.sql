-- migration_030_needs_manual_review_flag.sql
--
-- Scoped fix for a gap flagged during the Examination feature's Phase 4
-- review: neither test submission nor quiz attempts nor (now)
-- examination submission persist per-question answers or feedback
-- anywhere -- only an aggregate score is saved. That means an
-- essay/structured answer that falls back to "Submitted for manual
-- review" (missing GEMINI_API_KEY, or a failed AI call) leaves no visible
-- trace anywhere in the app that a teacher needs to look at it.
--
-- A full fix (a genuine per-question review queue) would first require
-- adding that missing per-question persistence across three different
-- submission flows -- a large, separate piece of work, not this one.
--
-- This migration adds the smaller, immediately useful piece instead: a
-- coarse, assignment-level boolean saying "something in this submission
-- needs a teacher's attention," set by the submission endpoints
-- (server/routes/studentRoutes.js's POST /test/:testId/submit and POST
-- /examination/:id/submit) whenever any answer in that submission fell
-- back to manual review.
--
-- SAFETY MODEL: purely additive. ADD COLUMN IF NOT EXISTS on two existing
-- tables, defaulting to false -- no existing row's meaning changes, no
-- existing query's behavior changes, safe to run multiple times.

BEGIN;

ALTER TABLE test_assignments
  ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE examination_assignments
  ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN NOT NULL DEFAULT false;

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'test_assignments' AND column_name = 'needs_manual_review')          AS test_assignments_column_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'examination_assignments' AND column_name = 'needs_manual_review')    AS examination_assignments_column_exists,
  (SELECT COUNT(*) FROM test_assignments WHERE needs_manual_review = true)                   AS test_assignments_flagged_should_be_0_on_fresh_run,
  (SELECT COUNT(*) FROM examination_assignments WHERE needs_manual_review = true)             AS examination_assignments_flagged_should_be_0_on_fresh_run;

-- Expect both *_column_exists = 1. The two *_flagged counts are only
-- "should be 0" on a database that has never had a submission fall back
-- to manual review before this column existed -- on a live database with
-- existing submissions, both may legitimately already show a nonzero
-- count once the corresponding submission-endpoint code (deployed
-- alongside this migration) starts setting it going forward; this
-- migration itself only adds the column and defaults every existing row
-- to false, it does not retroactively flag anything.
-- COMMIT;
-- ROLLBACK;
