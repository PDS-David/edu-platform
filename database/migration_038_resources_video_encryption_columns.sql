-- migration_038_resources_video_encryption_columns.sql
--
-- Video download-prevention work (session continuation). Confirmed this
-- session, do not re-derive: the `videos` table's entire access-control
-- model is course_id-based, not subtopic-based -- every enrollment/
-- authorization check in server/routes/videosRoutes.js keys off course_id
-- (lines ~340, 351, 370, 565, 570, 576), and course_id is also a hard
-- app-level requirement on upload (400 without it, server/routes/
-- videosRoutes.js line ~182-183) even though the DB column itself is
-- nullable. Migrating bulk-uploaded videos into that table would mean
-- reworking the whole access-control model to understand subtopic-based
-- enrollment, not just adding a column -- a substantially bigger and
-- riskier change than originally scoped.
--
-- REVISED DESIGN, decided this session: bulk-uploaded videos stay exactly
-- where they already correctly belong -- `resources`, categorized by
-- subject_id/topic_id/subtopic_id like everything else, with working
-- access control already in place (student_subjects / resource_assignments,
-- same as every other resource type). What's missing is encryption. This
-- migration adds the columns needed to store that, once the actual
-- transcode+encrypt step is wired into the bulk-upload flow (NOT done in
-- this migration -- purely additive schema, zero behavior change on its
-- own).
--
-- Mirrors the shape already proven correct in the `videos` table
-- (encrypted_playlist_url, encryption_key_id, upload_status) rather than
-- inventing a new shape -- same fields, same meaning, just attached to
-- `resources` instead of a course-scoped table.
--
-- SAFETY MODEL: purely additive (ADD COLUMN IF NOT EXISTS, all nullable
-- or defaulted). Every existing resources row is completely unaffected.
-- Safe to re-run.

BEGIN;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS encrypted_playlist_url TEXT,
  ADD COLUMN IF NOT EXISTS encryption_key_id UUID,
  ADD COLUMN IF NOT EXISTS video_upload_status VARCHAR(20) NOT NULL DEFAULT 'n/a';
  -- video_upload_status values (mirroring videos.upload_status): 'n/a' for
  -- any non-video resource (the default -- correct for every existing row),
  -- 'pending' | 'processing' | 'ready' | 'failed' for resource_type='video'
  -- once the encryption step is wired in.

-- Sanity check before committing -- every existing row must still read
-- video_upload_status = 'n/a' (this migration must not have touched any
-- row's meaning, only added columns).
SELECT
  (SELECT COUNT(*) FROM resources) AS resources_total,
  (SELECT COUNT(*) FROM resources WHERE video_upload_status = 'n/a') AS still_na;
-- Expect resources_total = still_na.

-- COMMIT;
-- ROLLBACK;
