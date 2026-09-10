-- migration_031_syllabus_documents.sql
--
-- Prompt 1 of 4 for syllabus-driven topic mapping. Problem being solved:
-- resources and questions currently get attached to topics/subtopics that a
-- teacher or admin picks somewhat arbitrarily, so a subject's topic tree
-- doesn't reliably match its actual exam syllabus. This migration is
-- schema + file-storage plumbing ONLY -- no parsing/extraction (Prompt 2),
-- no remapping of existing resources (later prompt), no UI.
--
-- DESIGN DECISIONS (see accompanying report for full reasoning):
--
-- 1. Sub-sub-topics: modeled as a nullable self-referencing
--    parent_subtopic_id on the EXISTING subtopics table, not a new table.
--    subtopics.id is INTEGER (SERIAL), confirmed from server/models/Subtopic.js
--    and database/migration_001.sql -- so parent_subtopic_id is INTEGER,
--    not UUID. ON DELETE SET NULL (not CASCADE): deleting a parent
--    subtopic must not silently cascade-delete every child. This is
--    purely additive -- no existing query's column set changes, and a
--    repo-wide grep confirmed no `SELECT * FROM subtopics` exists that a
--    new column could disrupt.
--
-- 2. Versioning: yes, a subject can have more than one syllabus document
--    uploaded over time (corrected re-upload, new academic year). Modeled
--    with is_active + created_at, matching this codebase's existing
--    soft-state convention (student_subjects.is_active, resources.is_active,
--    etc.). Enforcing "only one active document per (exam_board_id,
--    subject_id) pair" is done in the upload route itself (an UPDATE
--    deactivating any prior active row for that pair, in the same
--    transaction as the new INSERT) -- not a DB constraint, so re-activating
--    an older version later remains possible without a schema change.
--
-- 3. syllabus_documents represents Prompt 2's extraction OUTPUT target.
--    id is UUID (matching resources.id's convention, not topics/subjects'
--    INTEGER convention, since this table sits alongside resources/
--    uploads conceptually). exam_board_id and subject_id are INTEGER,
--    matching exam_boards.id / subjects.id (both SERIAL). uploaded_by is
--    UUID referencing users(id), matching every other *_by column in this
--    schema. status uses the same DO $$ ... EXCEPTION WHEN duplicate_object
--    CHECK-constraint pattern as examinations.status.
--
--    source_syllabus_id (nullable FK on topics AND subtopics, ON DELETE
--    SET NULL) traces which topics/subtopics came from which upload.
--    Nullable because all existing topics/subtopics predate this feature.
--
-- STORAGE: mirrors server/routes/resourceRoutes.js exactly -- Cloudflare R2
-- via server/utils/r2Storage.js when enabled, local disk under
-- server/uploads/syllabus/ (not publicly reachable, same as
-- server/uploads/resources/) otherwise. No second storage mechanism
-- introduced.
--
-- EXTRACTION TRIGGER (for Prompt 2): left as a TODO in syllabusRoutes.js.
-- Recommendation documented in the accompanying report, not implemented
-- here per this prompt's scope.
--
-- SAFETY MODEL: purely additive, IF NOT EXISTS throughout. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS syllabus_documents (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_board_id  INTEGER      NOT NULL REFERENCES exam_boards(id) ON DELETE CASCADE,
  subject_id     INTEGER      NOT NULL REFERENCES subjects(id)    ON DELETE CASCADE,
  uploaded_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
  title          VARCHAR(255),
  file_url       TEXT         NOT NULL,
  r2_key         TEXT,
  file_type      VARCHAR(10)  NOT NULL,
  file_size_bytes INTEGER,
  original_filename VARCHAR(255),
  sha256         CHAR(64),
  status         VARCHAR(20)  NOT NULL DEFAULT 'uploaded',
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  failure_reason TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syllabus_docs_exam_subject
  ON syllabus_documents(exam_board_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_docs_active
  ON syllabus_documents(exam_board_id, subject_id) WHERE is_active = true;

DO $$ BEGIN
  ALTER TABLE syllabus_documents
    ADD CONSTRAINT syllabus_documents_status_check
    CHECK (status IN ('uploaded', 'processing', 'extracted', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE syllabus_documents
    ADD CONSTRAINT syllabus_documents_file_type_check
    CHECK (file_type IN ('pdf', 'docx'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Traceability: which topics/subtopics were extracted from which upload.
-- Must come AFTER syllabus_documents exists (FK target).
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS source_syllabus_id UUID REFERENCES syllabus_documents(id) ON DELETE SET NULL;

ALTER TABLE subtopics
  ADD COLUMN IF NOT EXISTS source_syllabus_id UUID REFERENCES syllabus_documents(id) ON DELETE SET NULL;

-- Sub-sub-topics: self-referencing FK on the existing subtopics table.
ALTER TABLE subtopics
  ADD COLUMN IF NOT EXISTS parent_subtopic_id INTEGER REFERENCES subtopics(id) ON DELETE SET NULL;

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'syllabus_documents')                                          AS syllabus_documents_table_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'topics' AND column_name = 'source_syllabus_id')                AS topics_source_syllabus_id_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'subtopics' AND column_name = 'source_syllabus_id')             AS subtopics_source_syllabus_id_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'subtopics' AND column_name = 'parent_subtopic_id')             AS subtopics_parent_subtopic_id_exists,
  (SELECT COUNT(*) FROM syllabus_documents)                                            AS syllabus_documents_row_count_should_be_0_on_fresh_run;

COMMIT;
