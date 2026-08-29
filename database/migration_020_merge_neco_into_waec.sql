-- migration_020_merge_neco_into_waec.sql
--
-- Per explicit decision: "NECO has been merged to WAEC/NECO (SSCE). That is
-- the kind of change I desire." Confirmed live (2026-08-28): all 28 of
-- NECO's (exam_board_id=3) active subjects have an EXACT name match among
-- WAEC's (exam_board_id=2) 37 active subjects. Full mapping below.
--
-- WHY THIS IS DIFFERENT FROM migration_017 (board 14 -> 21): that merge was
-- a simple ownership re-point because the target board had ZERO subjects of
-- its own -- no name collisions to reconcile. Here BOTH sides already have
-- real subjects with matching names, so a blind ownership re-point would
-- create 28 duplicate subject rows under WAEC. Instead, every reference to
-- a NECO subject id is remapped to its matching WAEC subject id, across
-- EVERY table with a subject_id foreign key (enumerated by grepping every
-- `REFERENCES subjects(id)` and `idx_*_subject_id` in
-- server/scripts/run_complete_migration.js and database/migration_003.sql):
--   student_subjects, teacher_subjects, class_subjects, topics, subtopics,
--   resources, past_papers, questions (subject_id_uuid), courses,
--   custom_tests, practice_attempts, subtopic_quiz_attempts,
--   ai_chat_sessions, learning_gaps, user_weak_topics.
--
-- NECO subject id -> WAEC subject id (28 pairs, confirmed by exact
-- case/whitespace-insensitive name match):
--   68->32 Agricultural Science   66->30 Biology            65->29 Chemistry
--   63->27 Civic Education        70->36 Commerce           81->55 Computer Studies
--   75->43 CRS                    82->56 Data Processing    69->35 Economics
--   61->25 English Language       71->37 Financial Accounting
--   86->51 Fine Arts              84->53 Food and Nutrition 77->45 French
--   67->31 Further Mathematics    74->41 Geography          72->40 Government
--   80->48 Hausa                  88->42 History             85->52 Home Management
--   79->47 Igbo                   76->44 IRS                 73->39 Literature in English
--   62->26 Mathematics            87->50 Music               64->28 Physics
--   83->57 Technical Drawing      78->46 Yoruba
--
-- UNIQUE-CONSTRAINT GUARDS: student_subjects UNIQUE(student_id, subject_id),
-- teacher_subjects UNIQUE(teacher_id, subject_id), class_subjects
-- UNIQUE(class_id, subject_id) -- confirmed via schema. The remap on these
-- three tables is guarded with NOT EXISTS so it cannot violate the
-- constraint (skips a row only in the unlikely case a student/teacher/class
-- already has a row for the matching WAEC subject too -- that duplicate
-- association is simply left on the old NECO subject id, now deactivated,
-- rather than silently dropped). The remaining 12 tables have no
-- subject-linked uniqueness constraint and are remapped unconditionally.
--
-- student_exam_types (board-level enrollment) is moved from board 3 to
-- board 2 the same guarded way migration_017 moved board 14's students to
-- board 21.
--
-- After remapping, NECO's 28 now-empty subject rows and the NECO board
-- itself are deactivated (not deleted) -- reversible, matches
-- migration_016/019's convention.
--
-- Run inside a transaction, sanity-check before COMMIT, against a database
-- you've just pg_dump'd.

BEGIN;

-- Re-confirm the 28-pair mapping still holds exactly as captured above --
-- if this returns anything other than 28, STOP and ROLLBACK; the DB has
-- changed since 2026-08-28 and this migration must not proceed as written.
WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
SELECT COUNT(*) AS mapping_pairs_should_be_28,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM subjects WHERE id = sm.neco_id AND exam_board_id = 3 AND is_active = true)
           AND EXISTS (SELECT 1 FROM subjects WHERE id = sm.waec_id AND exam_board_id = 2 AND is_active = true)
       ) AS still_valid_should_be_28
FROM subject_map sm;

-- ── Guarded remaps (unique-constrained tables) ──────────────────────────────
WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE student_subjects ss SET subject_id = sm.waec_id
FROM subject_map sm
WHERE ss.subject_id = sm.neco_id
  AND NOT EXISTS (SELECT 1 FROM student_subjects x WHERE x.student_id = ss.student_id AND x.subject_id = sm.waec_id);

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE teacher_subjects ts SET subject_id = sm.waec_id
FROM subject_map sm
WHERE ts.subject_id = sm.neco_id
  AND NOT EXISTS (SELECT 1 FROM teacher_subjects x WHERE x.teacher_id = ts.teacher_id AND x.subject_id = sm.waec_id);

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE class_subjects cs SET subject_id = sm.waec_id
FROM subject_map sm
WHERE cs.subject_id = sm.neco_id
  AND NOT EXISTS (SELECT 1 FROM class_subjects x WHERE x.class_id = cs.class_id AND x.subject_id = sm.waec_id);

-- ── Unconditional remaps (no subject-linked uniqueness constraint) ─────────
WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE topics t SET subject_id = sm.waec_id FROM subject_map sm WHERE t.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE subtopics st SET subject_id = sm.waec_id FROM subject_map sm WHERE st.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE resources r SET subject_id = sm.waec_id FROM subject_map sm WHERE r.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE past_papers pp SET subject_id = sm.waec_id FROM subject_map sm WHERE pp.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE questions q SET subject_id_uuid = sm.waec_id FROM subject_map sm WHERE q.subject_id_uuid = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE courses c SET subject_id = sm.waec_id FROM subject_map sm WHERE c.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE custom_tests ct SET subject_id = sm.waec_id FROM subject_map sm WHERE ct.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE practice_attempts pa SET subject_id = sm.waec_id FROM subject_map sm WHERE pa.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE subtopic_quiz_attempts sqa SET subject_id = sm.waec_id FROM subject_map sm WHERE sqa.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE ai_chat_sessions acs SET subject_id = sm.waec_id FROM subject_map sm WHERE acs.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE learning_gaps lg SET subject_id = sm.waec_id FROM subject_map sm WHERE lg.subject_id = sm.neco_id;

WITH subject_map(neco_id, waec_id) AS (VALUES
  (68,32),(66,30),(65,29),(63,27),(70,36),(81,55),(75,43),(82,56),(69,35),
  (61,25),(71,37),(86,51),(84,53),(77,45),(67,31),(74,41),(72,40),(80,48),
  (88,42),(85,52),(79,47),(76,44),(73,39),(62,26),(87,50),(64,28),(83,57),
  (78,46)
)
UPDATE user_weak_topics uwt SET subject_id = sm.waec_id FROM subject_map sm WHERE uwt.subject_id = sm.neco_id;

-- ── Board-level enrollment (student_exam_types), same guard style as
--    migration_017's Step 2 ──────────────────────────────────────────────
UPDATE student_exam_types SET exam_board_id = 2
 WHERE exam_board_id = 3
   AND NOT EXISTS (
     SELECT 1 FROM student_exam_types set2
      WHERE set2.student_id = student_exam_types.student_id
        AND set2.exam_board_id = 2
   );

-- ── Deactivate NECO's now-empty subjects and the board itself ──────────────
UPDATE subjects SET is_active = false, updated_at = NOW()
 WHERE exam_board_id = 3 AND is_active = true;

UPDATE exam_boards SET is_active = false, updated_at = NOW()
 WHERE id = 3 AND is_active = true;

-- Sanity checks before committing.
SELECT COUNT(*) AS neco_subjects_still_active_should_be_0
  FROM subjects WHERE exam_board_id = 3 AND is_active = true;
SELECT COUNT(*) AS neco_student_subjects_remaining_should_be_0
  FROM student_subjects ss JOIN subjects s ON s.id = ss.subject_id WHERE s.exam_board_id = 3;
SELECT COUNT(*) AS neco_board_students_remaining_should_be_0
  FROM student_exam_types WHERE exam_board_id = 3;
SELECT COUNT(*) AS waec_subjects_should_be_37
  FROM subjects WHERE exam_board_id = 2 AND is_active = true;
SELECT id, code, name, is_active FROM exam_boards WHERE id IN (2, 3);

-- COMMIT;
-- ROLLBACK;
