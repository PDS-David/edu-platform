-- migration_037_syllabus_remap_suggestions_nullable_doc.sql
--
-- Orphaned-resources full generalization (follow-up to migration_036).
--
-- WHY: syllabus_remap_suggestions.syllabus_document_id has been NOT NULL
-- since migration_034 because every suggestion has, until now, only ever
-- existed because a syllabus was confirmed (the "old tree" population).
-- That assumption is false for orphaned resources in a subject that has a
-- perfectly good, real, is_active topic tree and NO syllabus document at
-- all -- confirmed via production query: 31 of 33 subjects with orphaned
-- resources have zero confirmed syllabus_documents rows. Bolting orphaned-
-- resource support onto the existing confirmed-syllabus-only loop would
-- only ever reach 2 of those 33 subjects.
--
-- THE DUPLICATE-SUGGESTION RISK THIS MIGRATION MUST ALSO CLOSE (do not
-- ship the nullable change without this): migration_034's own
-- UNIQUE (syllabus_document_id, source_table, source_id) constraint does
-- NOT prevent duplicates once syllabus_document_id can be NULL --
-- Postgres treats every NULL as distinct from every other NULL for
-- uniqueness purposes, so two suggestion rows both reading
-- (NULL, 'resources', 'some-uuid') would NOT violate that constraint.
-- Running generateSyllabusRemapSuggestions.js's orphaned-resource pass
-- twice against the same subject would silently insert a duplicate
-- suggestion for every item, rather than updating the existing one the
-- way ON CONFLICT already correctly does for the syllabus_document_id-set
-- population.
--
-- FIX: subject_id is already a column on every row (added in migration_034
-- alongside syllabus_document_id, confirmed by reading that file directly)
-- -- a real, populated, non-nullable value on every orphaned-resource
-- suggestion. A partial unique index on (subject_id, source_table,
-- source_id) WHERE syllabus_document_id IS NULL closes the gap precisely
-- for the population that actually needs it, without touching or
-- weakening the original constraint, which keeps working exactly as
-- before for every syllabus_document_id-set row.
--
-- SAFETY MODEL: DROP NOT NULL is safe on an already-populated NOT NULL
-- column (every existing row keeps its real, non-null value; this only
-- widens what's ALLOWED going forward). CREATE UNIQUE INDEX IF NOT
-- EXISTS is additive and idempotent. Neither statement can fail or
-- silently corrupt existing rows. Safe to re-run.
--
-- Manual run required, same as migration_007 onward.

BEGIN;

ALTER TABLE syllabus_remap_suggestions
  ALTER COLUMN syllabus_document_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_srs_orphaned_unique
  ON syllabus_remap_suggestions (subject_id, source_table, source_id)
  WHERE syllabus_document_id IS NULL;

-- Sanity check before committing:
-- 1) the column should now allow NULL (is_nullable = 'YES')
-- 2) the original constraint must still exist, untouched
-- 3) the new partial index must exist
SELECT
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'syllabus_remap_suggestions' AND column_name = 'syllabus_document_id') AS syllabus_document_id_nullable,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'syllabus_remap_suggestions_unique_source')  AS original_unique_constraint_present,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_srs_orphaned_unique') AS new_partial_index_present;
-- Expect: syllabus_document_id_nullable = 'YES', both counts >= 1.

-- COMMIT;
-- ROLLBACK;
