-- migration_032_syllabus_extracted_structure.sql
--
-- Syllabus-driven topic mapping, Prompt 2 Part 2: adds the column Part 1
-- (feat/syllabus-extraction-part1-text-and-trigger, merged as PR #82)
-- deliberately left for this part to add — a place to hold the AI-parsed
-- topic/subtopic/sub-subtopic hierarchy BEFORE a human reviews and
-- confirms it (Prompt 3's job). Nothing in this feature writes to the
-- live topics/subtopics tables yet.
--
-- SHAPE of extracted_structure (documented in full in
-- server/services/syllabusExtractor.js's extractTopicStructureFromText —
-- Prompt 3 needs this exact shape to build its review UI against):
--   { "nodes": [ { "level": 1|2|3, "title": "...", "number": "1.1" | null }, ... ] }
-- A FLAT, ORDERED array, not a nested tree — an LLM asked for deeply
-- nested JSON with many siblings is measurably more failure-prone
-- (unbalanced braces, truncation mid-object) than a flat list; Prompt 3
-- reconstructs the tree by walking the array in order and tracking the
-- most recently seen node at each level as the current parent for the
-- next lower level. level is capped at 3 -- confirmed as the actual max
-- depth this schema supports: topics -> subtopics ->
-- subtopics.parent_subtopic_id (self-referencing, added in Prompt 1,
-- migration_031) gives exactly one further level below subtopic, no more.
-- A document with genuinely deeper structure than 3 levels has anything
-- past level 3 collapsed into level 3 by the parsing code, not dropped or
-- crashed on — documented explicitly in extractTopicStructureFromText.
--
-- extracted_at: when extraction completed, for Prompt 3's review UI and
-- for debugging a slow run without grepping logs.
--
-- SAFETY MODEL: purely additive, IF NOT EXISTS. Safe to re-run.

BEGIN;

ALTER TABLE syllabus_documents
  ADD COLUMN IF NOT EXISTS extracted_structure JSONB;

ALTER TABLE syllabus_documents
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'syllabus_documents' AND column_name = 'extracted_structure') AS extracted_structure_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'syllabus_documents' AND column_name = 'extracted_at')        AS extracted_at_exists;

COMMIT;
