-- migration_015_alevel_board_activate_subjects.sql
--
-- Fixes the real underlying cause of the "Business Studies not seen under
-- A-Level" report. Earlier migrations (011, 013) fixed exam_board_id=5
-- (GCE_AL, "GCE A' Levels") — the wrong board. Live usage data (2026-08-28)
-- showed exam_board_id=5 has ZERO active students, while exam_board_id=14
-- (code=ALEVEL, name="A-LEVELS") has 3, including two students at
-- "Educational Advancement Center" — the exact tenant that reported this.
--
-- Board 14 isn't in the canonical seed list in
-- server/scripts/run_complete_migration.js (only GCE_AL/CAMBAL/CAMBOL/
-- AQAAL/EDXAL exist there for A-Level-type boards) — it was created some
-- other way, outside that script. Regardless of how it got there, it has
-- real, actively-enrolled students today, so it's the correct one to fix.
--
-- Confirmed live (2026-08-28): of board 14's 17 subjects, 6 were
-- is_active=false — Accounting, Biology, Business Studies, Physics,
-- Psychology, Sociology (ids 209, 202, 210, 200, 205, 204). All six are
-- ordinary subjects with no apparent reason to be excluded — no pattern
-- suggesting deliberate curation, and the other 11 (Chemistry, Computer
-- Science, CRS, Economics, English Language, French, Further Mathematics,
-- Geography, History, Literature in English, Mathematics) are active.
-- This looks like an incomplete setup, not an intentional choice.
--
-- SAFETY MODEL:
--   - Six single-row UPDATEs, narrowly scoped by explicit id (not a
--     board-wide blanket UPDATE), guarded by is_active = false so this is
--     idempotent — safe to re-run, becomes a no-op after the first run or
--     if any of these were already fixed by hand in the meantime.
--   - Does not touch board_id=5 or any of its subjects (already fixed by
--     migration_011/013 and left alone here).
--   - Does not touch any other subject under board 14 — only the 6 listed.
--   - Does not deactivate, delete, or merge anything. Purely additive
--     (is_active false -> true).
--
-- Run inside a transaction, sanity-check before COMMIT, against a database
-- you've just pg_dump'd — same as every migration in this repo.

BEGIN;

UPDATE subjects SET is_active = true, updated_at = NOW()
 WHERE id = 209 AND exam_board_id = 14 AND UPPER(name) = 'ACCOUNTING' AND is_active = false;

UPDATE subjects SET is_active = true, updated_at = NOW()
 WHERE id = 202 AND exam_board_id = 14 AND UPPER(name) = 'BIOLOGY' AND is_active = false;

UPDATE subjects SET is_active = true, updated_at = NOW()
 WHERE id = 210 AND exam_board_id = 14 AND UPPER(name) = 'BUSINESS STUDIES' AND is_active = false;

UPDATE subjects SET is_active = true, updated_at = NOW()
 WHERE id = 200 AND exam_board_id = 14 AND UPPER(name) = 'PHYSICS' AND is_active = false;

UPDATE subjects SET is_active = true, updated_at = NOW()
 WHERE id = 205 AND exam_board_id = 14 AND UPPER(name) = 'PSYCHOLOGY' AND is_active = false;

UPDATE subjects SET is_active = true, updated_at = NOW()
 WHERE id = 204 AND exam_board_id = 14 AND UPPER(name) = 'SOCIOLOGY' AND is_active = false;

-- Sanity check before committing — expect all 17 rows now is_active = t,
-- with active_count = 17.
SELECT id, name, is_active FROM subjects WHERE exam_board_id = 14 ORDER BY name;
SELECT COUNT(*) FILTER (WHERE is_active) AS active_count, COUNT(*) AS total_count
  FROM subjects WHERE exam_board_id = 14;

-- COMMIT;
-- ROLLBACK;
