-- migration_011_gce_al_business_studies.sql
--
-- Fixes: a school_admin could not assign "Business Studies" to a teacher
-- under the GCE A'Levels exam type — because no such subject row existed
-- yet. Subjects are modelled one row per exam board (the same "Business
-- Studies" subject already exists as separate rows for JAMB, WAEC, NECO,
-- and O-Levels — see database/eac_courses_topics_enrollments.sql /
-- eac_explanations.sql for that established per-board pattern), and nowhere
-- in this codebase's migrations was a GCE_AL row ever added for it.
--
-- This is a pure data gap, not an app-logic bug: the assign-to-teacher
-- endpoints (server/routes/schoolRoutes.js's
-- GET/POST/DELETE /schools/me/teachers/:teacherId/subjects) and the App
-- Admin's own subject-adding endpoint (POST /catalog/types/:id/subjects)
-- apply no exam-type-based exclusion anywhere — a subject simply has to
-- exist in the catalog to be assignable. Verified by reading both.
--
-- Column list and value shapes deliberately mirror
-- POST /catalog/types/:id/subjects's own INSERT exactly (exam_board_id,
-- exam_board_code, name, code, description, level, icon_emoji, is_active,
-- created_at, updated_at; id omitted — SERIAL autoincrement) since that is
-- the one INSERT shape actually proven to work against the live schema
-- today (it's the exact statement the production "Add Subject" admin UI
-- runs). database/add_ielts_toefl_sat_subjects.sql was NOT used as a
-- template — it inserts an explicit `id` via gen_random_uuid(), which does
-- not match subjects.id being an INTEGER/SERIAL primary key (confirmed in
-- server/models/Subject.js and in server/scripts/run_complete_migration.js's
-- own reasoning about subjects.exam_board_id needing to be INTEGER to match
-- exam_boards.id "which is SERIAL int"). Every migration file in this
-- repo's auto-run list has its errors silently swallowed to a WARN log
-- (see server/scripts/setupDb.js), so that file may have been failing
-- unnoticed since it was added; not something to propagate into this one.
--
-- SAFETY MODEL: purely ADDITIVE and idempotent.
--   - Only inserts if GCE_AL's exam board row exists AND no Business
--     Studies subject already exists under it (guards against this being
--     re-run, and against a school having already added the same subject
--     by hand through the App Admin UI in the meantime).
--   - Touches no existing row, table, or constraint.
--
-- Run the same way as every other migration this session: inside a
-- transaction, with a sanity-check SELECT before COMMIT, against a database
-- you have just taken a fresh pg_dump backup of.

BEGIN;

INSERT INTO subjects (exam_board_id, exam_board_code, name, code, description, level, icon_emoji, is_active, created_at, updated_at)
SELECT eb.id, eb.code, 'Business Studies', 'BUS101-GCEAL',
       'GCE A-Level Business Studies covering business organisation, marketing, finance, and management — mirrors the existing JAMB/WAEC/NECO/O-Levels Business Studies subjects, scoped to this board.',
       'A-Level', '',
       true, NOW(), NOW()
  FROM exam_boards eb
 WHERE UPPER(eb.code) = 'GCE_AL'
   AND NOT EXISTS (
     SELECT 1 FROM subjects s
      WHERE s.exam_board_id = eb.id
        AND UPPER(s.name) = 'BUSINESS STUDIES'
   );

-- Sanity check before committing
SELECT
  (SELECT COUNT(*) FROM exam_boards WHERE UPPER(code) = 'GCE_AL') AS gce_al_board_exists_should_be_1,
  (SELECT COUNT(*) FROM subjects s JOIN exam_boards eb ON eb.id = s.exam_board_id
    WHERE UPPER(eb.code) = 'GCE_AL' AND UPPER(s.name) = 'BUSINESS STUDIES') AS business_studies_under_gce_al_should_be_1;

-- If gce_al_board_exists_should_be_1 = 0, the GCE_AL exam board itself
-- doesn't exist in this environment yet (seeded separately by
-- server/scripts/run_complete_migration.js) — nothing was inserted, and
-- this migration should be re-run after that board exists.

-- COMMIT;
-- ROLLBACK;
