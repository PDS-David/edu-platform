-- migration_034_syllabus_remap_suggestions.sql
--
-- Syllabus-driven topic mapping, Prompt 4 Part 1: AI-suggestion generation,
-- dry-run only. This table is the ONLY thing Part 1 writes to — zero writes
-- to resources/questions/videos/revision_notes/concepts happen anywhere in
-- this part. Part 2 (review UI + actual remap writes, not built yet) reads
-- these rows back rather than regenerating suggestions live.
--
-- SCOPE CORRECTION (confirmed by reading the real schema, not assumed from
-- Prompt 4's own brief, which guessed "resources, questions, past_papers"):
-- the real in-scope content tables are resources, questions, videos,
-- revision_notes, concepts. past_papers has NO subtopic_id/topic_id column
-- at all (only subject_id) so there is no subtopic-level granularity to
-- remap there. subtopic_progress, subtopic_quiz_attempts, user_weak_topics,
-- learning_gaps, ai_explanation_cache, and ai_chat_sessions all also
-- reference subtopic_id/topic_id but are historical/analytics/cache data
-- tied to a point in time (what a student actually studied/attempted) --
-- remapping those would corrupt the historical record, not fix anything,
-- so they are deliberately excluded.
--
-- source_id is TEXT, not UUID or INTEGER: questions.id is INTEGER, but
-- resources.id/videos.id/revision_notes.id/concepts.id are all UUID --
-- confirmed by reading each table's actual PRIMARY KEY definition. A single
-- TEXT column (cast by the reader per source_table, which is always known)
-- is simpler than two nullable typed columns and avoids ambiguity.
--
-- confidence is NUMERIC(3,2) (0.00-1.00), not a coarse label: Part 2's
-- planned bulk-accept-high-confidence step needs a real threshold (e.g.
-- >= 0.85) to filter on, which a 3-value label (high/medium/low) can't
-- express precisely, and a numeric score is what generate()'s prompt can
-- most naturally be asked to return alongside its pick.
--
-- status starts a real review-state column (not just this part's dry-run
-- output) even though Part 1 never sets it to anything but 'pending' --
-- per this feature's own Step 2.3 instruction to design the schema now so
-- Part 2 doesn't need a second migration just to add a status column.
--
-- SAFETY MODEL: purely additive, new table only. Touches no existing table,
-- no existing row. Safe to re-run (CREATE TABLE IF NOT EXISTS).
--
-- Manual run required, same as migration_007 onward — not in setupDb.js's
-- auto-run list.

BEGIN;

CREATE TABLE IF NOT EXISTS syllabus_remap_suggestions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id          INTEGER      NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  syllabus_document_id UUID        NOT NULL REFERENCES syllabus_documents(id) ON DELETE CASCADE,

  source_table        VARCHAR(20)  NOT NULL,
  source_id           TEXT         NOT NULL,
  source_old_topic_id    INTEGER   REFERENCES topics(id)    ON DELETE SET NULL,
  source_old_subtopic_id INTEGER   REFERENCES subtopics(id) ON DELETE SET NULL,

  suggested_topic_id    INTEGER    REFERENCES topics(id)    ON DELETE SET NULL,
  suggested_subtopic_id INTEGER    REFERENCES subtopics(id) ON DELETE SET NULL,
  no_confident_match     BOOLEAN   NOT NULL DEFAULT false,
  confidence             NUMERIC(3,2),
  ai_rationale            TEXT,

  status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
  reviewed_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,

  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE syllabus_remap_suggestions
    ADD CONSTRAINT syllabus_remap_suggestions_source_table_check
    CHECK (source_table IN ('resources', 'questions', 'videos', 'revision_notes', 'concepts'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE syllabus_remap_suggestions
    ADD CONSTRAINT syllabus_remap_suggestions_status_check
    CHECK (status IN ('pending', 'accepted', 'overridden', 'skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One suggestion per source item per confirmed syllabus doc — re-running
-- the generation script for the same subject after a new confirm should
-- replace, not duplicate, a prior run's suggestion for the same item.
DO $$ BEGIN
  ALTER TABLE syllabus_remap_suggestions
    ADD CONSTRAINT syllabus_remap_suggestions_unique_source
    UNIQUE (syllabus_document_id, source_table, source_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_srs_subject   ON syllabus_remap_suggestions(subject_id);
CREATE INDEX IF NOT EXISTS idx_srs_doc       ON syllabus_remap_suggestions(syllabus_document_id);
CREATE INDEX IF NOT EXISTS idx_srs_status    ON syllabus_remap_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_srs_no_match  ON syllabus_remap_suggestions(no_confident_match) WHERE no_confident_match = true;

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'syllabus_remap_suggestions') AS table_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'syllabus_remap_suggestions')  AS column_count;

-- COMMIT;
-- ROLLBACK;
