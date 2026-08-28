-- migration_010_cambridge_gce_naming.sql
--
-- Renames the exam_boards.name display strings for Cambridge's two boards:
--   'Cambridge A Level' -> 'Cambridge GCE A'' Level'  (displays as: Cambridge GCE A' Level)
--   'Cambridge O Level' -> 'Cambridge GCE O'' Level'  (displays as: Cambridge GCE O' Level)
--
-- SAFETY MODEL: purely a display-string UPDATE.
--   - Targets rows by the stable `code` column (CAMBAL / CAMBOL), never by
--     the old name text itself, so it's safe to re-run.
--   - No other column (code, full_name, is_active, display_order,
--     max_subjects, requires_all_subjects) is touched.
--   - No table, constraint, or foreign key relationship changes — every
--     subject/student/resource FK reference is by exam_boards.id or .code,
--     never by .name, so nothing downstream breaks.
--   - server/scripts/run_complete_migration.js's seed for CAMBAL/CAMBOL was
--     updated to match this new name, so a future re-run of that script
--     stays consistent with this migration instead of reverting it.

BEGIN;

UPDATE exam_boards SET name = 'Cambridge GCE A'' Level', updated_at = NOW() WHERE code = 'CAMBAL';
UPDATE exam_boards SET name = 'Cambridge GCE O'' Level', updated_at = NOW() WHERE code = 'CAMBOL';

-- Sanity check before committing
SELECT code, name FROM exam_boards WHERE code IN ('CAMBAL', 'CAMBOL');

-- Expect:
--   CAMBAL | Cambridge GCE A' Level
--   CAMBOL | Cambridge GCE O' Level
-- If both match, COMMIT.
-- COMMIT;
-- ROLLBACK;
