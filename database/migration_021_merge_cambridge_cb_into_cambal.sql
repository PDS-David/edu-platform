-- migration_021_merge_cambridge_cb_into_cambal.sql
--
-- Per explicit decision: exam_board_id=15 (code=CB, name plain "Cambridge",
-- no prefix/suffix) is removed to stop the confusion between it, "Cambridge
-- GCE A' Level" (CAMBAL, id=21), and "Cambridge GCE O' Level" (CAMBOL,
-- id=22). "This removal is necessary... after a peaceful resolution of the
-- students and data associated with it."
--
-- Confirmed live (2026-08-28): board 15 has 13 active subjects and exactly
-- 1 active student (Tobi Alade, no school_id -- a standalone account).
-- All 13 subjects are A-Level-shaped content (Accounting, Business admin,
-- Chemistry, Economics, Furthermath, law, Psychology, etc.), so CAMBAL
-- (the A-Level board) is the correct merge target, not CAMBOL (O-Level).
--
-- 10 of the 13 have an exact name match under CAMBAL (which already has 17
-- subjects, from migration_017's earlier board-14 merge) and are remapped
-- the same full 15-table way migration_020 remapped NECO -> WAEC:
--   233->209 Accounting   224->202 Biology       223->201 Chemistry
--   227->211 Computer Science   230->203 Economics   229->207 Geography
--   228->206 History      221->198 Mathematics   225->200 Physics
--   231->205 Psychology
--
-- The other 3 have NO existing CAMBAL subject by that name, so they are NOT
-- id-remapped -- they simply change ownership (exam_board_id 15 -> 21),
-- keeping their own subject id, becoming new CAMBAL subjects (same
-- ownership-only technique as migration_017's board-14 merge, since
-- there's no competing row to reconcile for these three specifically):
--   234 Business admin   226 Furthermath   232 law
--
-- UNIQUE-CONSTRAINT GUARDS: same three tables as migration_020
-- (student_subjects, teacher_subjects, class_subjects), same NOT EXISTS
-- guard style.
--
-- Tobi Alade's board-level enrollment (student_exam_types) moves from
-- board 15 to board 21, guarded against the unique constraint the same way
-- migration_017 moved board 14's students to board 21. Whichever of the 13
-- subjects Tobi is actually enrolled in (student_subjects) is carried along
-- automatically by the remap/re-point above -- no separate step needed.
--
-- Run inside a transaction, sanity-check before COMMIT, against a database
-- you've just pg_dump'd.

BEGIN;

-- Re-confirm the mapping still holds exactly as captured above -- if this
-- returns anything other than 10, STOP and ROLLBACK.
WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
SELECT COUNT(*) AS mapping_pairs_should_be_10,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM subjects WHERE id = sm.cb_id AND exam_board_id = 15 AND is_active = true)
           AND EXISTS (SELECT 1 FROM subjects WHERE id = sm.cambal_id AND exam_board_id = 21 AND is_active = true)
       ) AS still_valid_should_be_10
FROM subject_map sm;

-- Also re-confirm the 3 ownership-only subjects are still on board 15 and
-- still have no CAMBAL name collision -- if any count below is non-zero
-- (i.e. a same-named subject has since appeared under board 21), STOP and
-- ROLLBACK; this migration's "no collision" assumption no longer holds.
SELECT
  (SELECT COUNT(*) FROM subjects WHERE id = 234 AND exam_board_id = 15 AND is_active = true) AS business_admin_present_should_be_1,
  (SELECT COUNT(*) FROM subjects WHERE exam_board_id = 21 AND is_active = true AND LOWER(TRIM(name)) = 'business admin') AS business_admin_collision_should_be_0,
  (SELECT COUNT(*) FROM subjects WHERE id = 226 AND exam_board_id = 15 AND is_active = true) AS furthermath_present_should_be_1,
  (SELECT COUNT(*) FROM subjects WHERE exam_board_id = 21 AND is_active = true AND LOWER(TRIM(name)) = 'furthermath') AS furthermath_collision_should_be_0,
  (SELECT COUNT(*) FROM subjects WHERE id = 232 AND exam_board_id = 15 AND is_active = true) AS law_present_should_be_1,
  (SELECT COUNT(*) FROM subjects WHERE exam_board_id = 21 AND is_active = true AND LOWER(TRIM(name)) = 'law') AS law_collision_should_be_0;

-- ── Guarded remaps (unique-constrained tables) ──────────────────────────────
WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE student_subjects ss SET subject_id = sm.cambal_id
FROM subject_map sm
WHERE ss.subject_id = sm.cb_id
  AND NOT EXISTS (SELECT 1 FROM student_subjects x WHERE x.student_id = ss.student_id AND x.subject_id = sm.cambal_id);

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE teacher_subjects ts SET subject_id = sm.cambal_id
FROM subject_map sm
WHERE ts.subject_id = sm.cb_id
  AND NOT EXISTS (SELECT 1 FROM teacher_subjects x WHERE x.teacher_id = ts.teacher_id AND x.subject_id = sm.cambal_id);

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE class_subjects cs SET subject_id = sm.cambal_id
FROM subject_map sm
WHERE cs.subject_id = sm.cb_id
  AND NOT EXISTS (SELECT 1 FROM class_subjects x WHERE x.class_id = cs.class_id AND x.subject_id = sm.cambal_id);

-- ── Unconditional remaps (no subject-linked uniqueness constraint) ─────────
WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE topics t SET subject_id = sm.cambal_id FROM subject_map sm WHERE t.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE subtopics st SET subject_id = sm.cambal_id FROM subject_map sm WHERE st.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE resources r SET subject_id = sm.cambal_id FROM subject_map sm WHERE r.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE past_papers pp SET subject_id = sm.cambal_id FROM subject_map sm WHERE pp.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE questions q SET subject_id_uuid = sm.cambal_id FROM subject_map sm WHERE q.subject_id_uuid = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE courses c SET subject_id = sm.cambal_id FROM subject_map sm WHERE c.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE custom_tests ct SET subject_id = sm.cambal_id FROM subject_map sm WHERE ct.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE practice_attempts pa SET subject_id = sm.cambal_id FROM subject_map sm WHERE pa.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE subtopic_quiz_attempts sqa SET subject_id = sm.cambal_id FROM subject_map sm WHERE sqa.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE ai_chat_sessions acs SET subject_id = sm.cambal_id FROM subject_map sm WHERE acs.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE learning_gaps lg SET subject_id = sm.cambal_id FROM subject_map sm WHERE lg.subject_id = sm.cb_id;

WITH subject_map(cb_id, cambal_id) AS (VALUES
  (233,209),(224,202),(223,201),(227,211),(230,203),
  (229,207),(228,206),(221,198),(225,200),(231,205)
)
UPDATE user_weak_topics uwt SET subject_id = sm.cambal_id FROM subject_map sm WHERE uwt.subject_id = sm.cb_id;

-- ── Ownership-only re-point for the 3 subjects with no CAMBAL match ─────────
-- Subject id stays the same -- no downstream table needs touching, since
-- every reference to id 234/226/232 stays valid; only the owning board
-- changes.
UPDATE subjects SET exam_board_id = 21, updated_at = NOW()
 WHERE id IN (234, 226, 232) AND exam_board_id = 15;

-- ── Board-level enrollment (student_exam_types) — Tobi Alade + anyone else
--    on board 15 ─────────────────────────────────────────────────────────
UPDATE student_exam_types SET exam_board_id = 21
 WHERE exam_board_id = 15
   AND NOT EXISTS (
     SELECT 1 FROM student_exam_types set2
      WHERE set2.student_id = student_exam_types.student_id
        AND set2.exam_board_id = 21
   );

-- ── Deactivate CB's now-empty subjects and the board itself ────────────────
UPDATE subjects SET is_active = false, updated_at = NOW()
 WHERE exam_board_id = 15 AND is_active = true;

UPDATE exam_boards SET is_active = false, updated_at = NOW()
 WHERE id = 15 AND is_active = true;

-- Sanity checks before committing.
SELECT COUNT(*) AS cb_subjects_still_active_should_be_0
  FROM subjects WHERE exam_board_id = 15 AND is_active = true;
SELECT COUNT(*) AS cb_board_students_remaining_should_be_0
  FROM student_exam_types WHERE exam_board_id = 15;
SELECT COUNT(*) AS cambal_subjects_should_be_20
  FROM subjects WHERE exam_board_id = 21 AND is_active = true; -- 17 existing + 3 new (234,226,232)
SELECT id, code, name, is_active FROM exam_boards WHERE id IN (15, 21);
SELECT u.id, u.first_name, u.last_name, set2.exam_board_id
  FROM student_exam_types set2 JOIN users u ON u.id = set2.student_id
 WHERE u.id = '225b1f02-96a8-4129-a20f-8a9e797c44e0';
-- Expect: Tobi Alade's row now shows exam_board_id = 21.

-- COMMIT;
-- ROLLBACK;
