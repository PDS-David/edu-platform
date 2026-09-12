-- migration_035_topics_subtopics_is_active.sql
--
-- Syllabus-driven topic mapping, Prompt 4 Part 3: old-tree deactivation.
-- Confirmed by reading both Sequelize models and every prior migration
-- directly (not assumed): topics and subtopics have NO deactivation
-- mechanism at all today — no is_active, no deleted_at, nothing. Every
-- other catalog-like entity in this app (subjects, exam_boards,
-- teacher_subjects, resources) already uses a plain is_active boolean as
-- its standard soft-disable flag — that is the dominant convention here,
-- not users' separate deleted_at/deleted_by/delete_reason audit-trail
-- pattern, which exists for a harder case (account deletion) topics/
-- subtopics don't need. Mirroring the dominant pattern, not the outlier.
--
-- Deactivation itself (setting is_active = false) is a deliberate,
-- server-validated action a human triggers per old topic/subtopic once
-- everything referencing it has been remapped — see
-- POST /api/syllabus/:id/old-topics/deactivate in syllabusRoutes.js,
-- which refuses to deactivate anything with a remaining 'pending'
-- syllabus_remap_suggestions row. This migration only adds the column;
-- it does not deactivate anything itself.
--
-- SAFETY MODEL: purely additive. DEFAULT true means every existing topic
-- and subtopic stays exactly as visible/usable as it is today — nothing
-- currently live is hidden by this migration.

BEGIN;

ALTER TABLE topics    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE subtopics ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_topics_is_active    ON topics(is_active)    WHERE is_active = false;
CREATE INDEX IF NOT EXISTS idx_subtopics_is_active ON subtopics(is_active) WHERE is_active = false;

-- Sanity check before committing.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'topics'    AND column_name = 'is_active') AS topics_col_exists_should_be_1,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'subtopics' AND column_name = 'is_active') AS subtopics_col_exists_should_be_1,
  (SELECT COUNT(*) FROM topics    WHERE is_active = false) AS topics_deactivated_should_be_0,
  (SELECT COUNT(*) FROM subtopics WHERE is_active = false) AS subtopics_deactivated_should_be_0;

-- COMMIT;
-- ROLLBACK;
