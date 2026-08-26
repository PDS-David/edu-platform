-- migration_010_documented_runtime_columns.sql
--
-- Documents columns that already exist (or, in one case, may or may not
-- exist) in the live database but were never captured in a versioned
-- migration file — they were only ever added via ad hoc "ALTER TABLE ADD
-- COLUMN IF NOT EXISTS" code, run at request-time/server-boot-time rather
-- than through this migration system. This file changes nothing about
-- runtime behavior; it exists so the migration folder actually reflects
-- the true schema, and so a fresh environment can be reproduced from
-- migrations alone instead of also needing to read application code to
-- find hidden schema dependencies.
--
-- SAFETY MODEL: every statement below is IF NOT EXISTS and additive only.
-- Running this against a database that already has all these columns
-- (true today for two of the three sources below) is a complete no-op.
--
-- SOURCES (re-verified against the live repository immediately before
-- writing this file, not assumed from an earlier pass):
--
-- 1. server/routes/resourceRoutes.js (ensureExtraColumns, ~line 91-101)
--    — runs automatically on every relevant request. These columns are
--    confirmed already present in production.
--
-- 2. server/routes/studentRoutes.js (ensureEnrollmentColumns, ~line 56-72)
--    — also runs automatically. Confirmed already present in production
--    (Phase 3's subject-limit work already reads/writes these columns
--    live).
--
-- 3. server/routes/conceptRoutes.js (~line 24-26) — DIFFERENT AND MORE
--    IMPORTANT CASE. This one is only a code COMMENT instructing a human
--    to run the ALTER manually ("Run if not yet present") — it is NOT
--    executed by the application itself. Every operation in that file
--    (GET, POST, PUT, DELETE) already assumes concepts.created_by exists
--    (selects it, inserts it, checks ownership against it). Whether a
--    human actually ran that manual step at some point in the past could
--    not be confirmed from static code alone. If it was never run, the
--    entire concepts feature has been failing on every request, in the
--    same "silently masked as generic Server error" way as the
--    registration bug fixed in migration/commit fix(auth) — this
--    statement is written IF NOT EXISTS specifically so it safely covers
--    both possibilities: a no-op if the column is already there, or a
--    real fix if it was never actually added.

-- ── From resourceRoutes.js's ensureExtraColumns ──────────────────────────────
ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_staged BOOLEAN DEFAULT false;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_kind VARCHAR(32) DEFAULT 'learning_material';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS questions_extracted_at TIMESTAMPTZ;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS push_type VARCHAR(50) DEFAULT 'learning_material';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS sha256 CHAR(64);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS stored_filename VARCHAR(255);

-- ── From studentRoutes.js's ensureEnrollmentColumns ──────────────────────────
ALTER TABLE student_subjects   ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';
ALTER TABLE student_subjects   ADD COLUMN IF NOT EXISTS enrollment_source TEXT DEFAULT 'explicit';
ALTER TABLE student_exam_types ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- ── From conceptRoutes.js's code-comment instruction (never auto-run) ───────
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Sanity check to run manually after this migration — confirm every column
-- above now exists (all 14 rows should come back):
--
-- SELECT table_name, column_name
--   FROM information_schema.columns
--  WHERE (table_name = 'resources' AND column_name IN
--          ('is_staged','is_active','original_filename','mime_type','updated_at',
--           'content_kind','questions_extracted_at','push_type','sha256','stored_filename'))
--     OR (table_name = 'student_subjects' AND column_name IN ('status','enrollment_source'))
--     OR (table_name = 'student_exam_types' AND column_name = 'status')
--     OR (table_name = 'concepts' AND column_name = 'created_by')
--  ORDER BY table_name, column_name;
