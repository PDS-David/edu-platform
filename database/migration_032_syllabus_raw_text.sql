-- migration_032_syllabus_raw_text.sql
--
-- Syllabus-driven topic mapping — Prompt 2, Part 1 (text extraction).
--
-- Adds a place to hold the raw text pulled out of an uploaded syllabus
-- document, so the (not-yet-built) Part 2 AI-extraction step can consume
-- it directly without re-fetching and re-parsing the original file.
-- Nullable — populated only once a document's background text-extraction
-- step has actually run.
--
-- Also adds extracted_structure JSONB now, ahead of Part 2 actually
-- writing to it, per that prompt's own Step 2.4 design requirement
-- ("store the raw extracted structure as JSON on the syllabus_documents
-- row itself... flag this clearly if Prompt 1's schema doesn't already
-- have a place for this"). Adding it here rather than leaving it for
-- Part 2 to bolt on keeps this migration the single place that extends
-- syllabus_documents for the whole of Prompt 2, and lets Part 2's own
-- work stay pure application code with no schema change of its own.
--
-- SAFETY MODEL: purely additive, IF NOT EXISTS. Safe to re-run.

BEGIN;

ALTER TABLE syllabus_documents ADD COLUMN IF NOT EXISTS raw_extracted_text TEXT;
ALTER TABLE syllabus_documents ADD COLUMN IF NOT EXISTS extracted_structure JSONB;

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'syllabus_documents' AND column_name = 'raw_extracted_text') AS raw_text_col_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'syllabus_documents' AND column_name = 'extracted_structure') AS extracted_structure_col_exists,
  (SELECT COUNT(*) FROM syllabus_documents WHERE raw_extracted_text IS NOT NULL) AS existing_rows_with_text_should_be_0;
-- Expect: both *_exists = 1, existing_rows_with_text_should_be_0 = 0
-- (every existing row predates this column).

COMMIT;
