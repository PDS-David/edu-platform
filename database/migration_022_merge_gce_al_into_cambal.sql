-- migration_022_merge_gce_al_into_cambal.sql
--
-- Per explicit decision: "GCE A' Levels" (exam_board_id=5, code=GCE_AL) is a
-- repetition of "Cambridge GCE A' Level" (exam_board_id=21, code=CAMBAL)
-- and should be removed. Originally planned as a straight hard DELETE via
-- migration_018 (written when board 5 was believed to have 0 subjects), but
-- a live re-check on 2026-08-30 found board 5 actually has 17 subjects --
-- drift since migration_016 deactivated the board back on 2026-08-28. (That
-- deactivation is also why the board later showed as active again with the
-- subjects still inactive: POST /catalog/types/:id/reactivate only ever
-- flips exam_boards.is_active, never touches subjects.is_active -- see its
-- own comment in catalogRoutes.js. Board 5 was reactivated at some point
-- after migration_016 ran; its 17 subjects were never reactivated with it.)
--
-- Confirmed live (2026-08-30): all 17 of board 5's subjects have an EXACT
-- name match among board 21's 17 active subjects -- full 1:1 mapping, no
-- orphans, same shape as migration_020 (NECO->WAEC). GCE A' Levels
-- subject id -> Cambridge GCE A' Level subject id:
--   117->209 Accounting            110->202 Biology
--   118->210 Business Studies      109->201 Chemistry
--   119->211 Computer Science      217->218 CRS
--   111->203 Economics             120->212 English Language
--   121->213 French                107->199 Further Mathematics
--   115->207 Geography             114->206 History
--   116->208 Literature in English 106->198 Mathematics
--   108->200 Physics               113->205 Psychology
--   112->204 Sociology
--
-- Board 5 has 0 active students (student_exam_types WHERE exam_board_id=5,
-- any status, confirmed 0 -- re-checked immediately below too), so there is
-- no board-level enrollment to move (unlike migration_020's NECO->WAEC
-- step, which did have to move student_exam_types rows).
--
-- Remapped across every table with a subject_id foreign key -- same 15
-- tables migration_020/021 already enumerated: student_subjects,
-- teacher_subjects, class_subjects, topics, subtopics, resources,
-- past_papers, questions (subject_id_uuid), courses, custom_tests,
-- practice_attempts, subtopic_quiz_attempts, ai_chat_sessions,
-- learning_gaps, user_weak_topics.
--
-- UNIQUE-CONSTRAINT GUARDS: student_subjects UNIQUE(student_id, subject_id),
-- teacher_subjects UNIQUE(teacher_id, subject_id), class_subjects
-- UNIQUE(class_id, subject_id). Remapped on these three with NOT EXISTS so
-- the merge cannot violate the constraint -- a row is skipped only if that
-- student/teacher/class already has a row for the matching CAMBAL subject
-- too, in which case the duplicate association is simply left on the old
-- (now-deactivated) GCE_AL subject id rather than silently dropped. The
-- other 12 tables have no subject-linked uniqueness constraint and are
-- remapped unconditionally.
--
-- After remapping, board 5's 17 now-empty subjects and the board itself are
-- deactivated (not deleted) -- reversible, matches migration_016/019's
-- convention, and matches the "deactivate first, hard-delete later only if
-- still wanted" two-step approach already used elsewhere in this repo.
--
-- Run inside a transaction, sanity-check before COMMIT, against a database
-- you've just pg_dump'd.

BEGIN;

-- Re-confirm the 17-pair mapping still holds exactly as captured above, and
-- that board 5 genuinely still has 0 students of any status -- if either
-- check fails, STOP and ROLLBACK; do not proceed on stale data.
WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
SELECT COUNT(*) AS mapping_pairs_should_be_17,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM subjects WHERE id = sm.gceal_id AND exam_board_id = 5)
           AND EXISTS (SELECT 1 FROM subjects WHERE id = sm.cambal_id AND exam_board_id = 21 AND is_active = true)
       ) AS still_valid_should_be_17,
       (SELECT COUNT(*) FROM student_exam_types WHERE exam_board_id = 5) AS board5_students_should_be_0
FROM subject_map sm;

-- ── Guarded remaps (unique-constrained tables) ──────────────────────────────
WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE student_subjects ss SET subject_id = sm.cambal_id
FROM subject_map sm
WHERE ss.subject_id = sm.gceal_id
  AND NOT EXISTS (SELECT 1 FROM student_subjects x WHERE x.student_id = ss.student_id AND x.subject_id = sm.cambal_id);

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE teacher_subjects ts SET subject_id = sm.cambal_id
FROM subject_map sm
WHERE ts.subject_id = sm.gceal_id
  AND NOT EXISTS (SELECT 1 FROM teacher_subjects x WHERE x.teacher_id = ts.teacher_id AND x.subject_id = sm.cambal_id);

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE class_subjects cs SET subject_id = sm.cambal_id
FROM subject_map sm
WHERE cs.subject_id = sm.gceal_id
  AND NOT EXISTS (SELECT 1 FROM class_subjects x WHERE x.class_id = cs.class_id AND x.subject_id = sm.cambal_id);

-- ── Unconditional remaps (no subject-linked uniqueness constraint) ─────────
WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE topics t SET subject_id = sm.cambal_id FROM subject_map sm WHERE t.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE subtopics st SET subject_id = sm.cambal_id FROM subject_map sm WHERE st.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE resources r SET subject_id = sm.cambal_id FROM subject_map sm WHERE r.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE past_papers pp SET subject_id = sm.cambal_id FROM subject_map sm WHERE pp.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE questions q SET subject_id_uuid = sm.cambal_id FROM subject_map sm WHERE q.subject_id_uuid = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE courses c SET subject_id = sm.cambal_id FROM subject_map sm WHERE c.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE custom_tests ct SET subject_id = sm.cambal_id FROM subject_map sm WHERE ct.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE practice_attempts pa SET subject_id = sm.cambal_id FROM subject_map sm WHERE pa.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE subtopic_quiz_attempts sqa SET subject_id = sm.cambal_id FROM subject_map sm WHERE sqa.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE ai_chat_sessions acs SET subject_id = sm.cambal_id FROM subject_map sm WHERE acs.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE learning_gaps lg SET subject_id = sm.cambal_id FROM subject_map sm WHERE lg.subject_id = sm.gceal_id;

WITH subject_map(gceal_id, cambal_id) AS (VALUES
  (117,209),(110,202),(118,210),(109,201),(119,211),(217,218),(111,203),
  (120,212),(121,213),(107,199),(115,207),(114,206),(116,208),(106,198),
  (108,200),(113,205),(112,204)
)
UPDATE user_weak_topics uwt SET subject_id = sm.cambal_id FROM subject_map sm WHERE uwt.subject_id = sm.gceal_id;

-- ── Deactivate board 5's now-empty subjects and the board itself ───────────
UPDATE subjects SET is_active = false, updated_at = NOW()
 WHERE exam_board_id = 5;

UPDATE exam_boards SET is_active = false, updated_at = NOW()
 WHERE id = 5 AND is_active = true;

-- Sanity checks before committing.
SELECT COUNT(*) AS gceal_subjects_still_active_should_be_0
  FROM subjects WHERE exam_board_id = 5 AND is_active = true;
SELECT COUNT(*) AS gceal_student_subjects_remaining_should_be_0
  FROM student_subjects ss JOIN subjects s ON s.id = ss.subject_id WHERE s.exam_board_id = 5;
SELECT COUNT(*) AS cambal_subjects_should_be_17
  FROM subjects WHERE exam_board_id = 21 AND is_active = true;
SELECT id, code, name, is_active FROM exam_boards WHERE id IN (5, 21);

-- COMMIT;
-- ROLLBACK;
