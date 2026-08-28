-- migration_013_business_studies_gce_al_level.sql
--
-- Follow-up to migration_011_gce_al_business_studies.sql.
--
-- CONFIRMED VIA LIVE DIAGNOSTIC (2026-08-27): a Business Studies subject
-- under the GCE_AL board already existed before migration_011 ran (id=118,
-- code='BUSINESS_5', created 2026-05-25) — that's why migration_011's
-- INSERT correctly reported 0 rows inserted (its WHERE NOT EXISTS guard
-- worked exactly as intended). That pre-existing row is_active = true and
-- correctly linked to the GCE_AL board, but its `level` column is blank —
-- unlike what migration_011 would have set ('A-Level') had it needed to
-- insert a fresh row.
--
-- No code path was found in the app (server or client) that currently
-- filters or hides a subject based on `level` — it appears to be treated
-- as a cosmetic/display field only, based on a full review of the
-- subject-listing and subject-assignment code paths. This migration is
-- therefore a DATA CONSISTENCY fix (matching what this row would have had
-- if migration_011 had been the one to create it), not a confirmed fix for
-- the "not seen under A-Level" report — that report needs a live repro to
-- fully resolve. See the sanity-check step below either way.
--
-- SAFETY MODEL: single-row, narrowly scoped UPDATE. Only touches the exact
-- row already identified by id, and only if its level is still blank
-- (idempotent — safe to re-run, becomes a no-op after the first run or if
-- someone already fixed it by hand in the meantime).

UPDATE subjects
   SET level = 'A-Level',
       updated_at = NOW()
 WHERE id = 118
   AND exam_board_id = (SELECT id FROM exam_boards WHERE code = 'GCE_AL')
   AND UPPER(name) = 'BUSINESS STUDIES'
   AND (level IS NULL OR level = '');

-- Sanity check — confirm exactly one row now has level = 'A-Level'.
SELECT id, name, code, level, is_active, exam_board_id
  FROM subjects
 WHERE id = 118;
