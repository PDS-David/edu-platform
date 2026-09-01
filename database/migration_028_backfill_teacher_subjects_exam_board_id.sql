-- migration_028_backfill_teacher_subjects_exam_board_id.sql
--
-- ASSIGN-1 (APP_WIDE_AUDIT.md section 8): server/routes/adminRoutes.js's
-- POST /teacher-assignments, POST /teacher-subjects, and PUT
-- /teacher-assignments/:id all used to insert/update teacher_subjects
-- without ever setting exam_board_id, even though the other three
-- assignment endpoints in the codebase (catalogRoutes.js, schoolRoutes.js)
-- correctly derive it from the subject being assigned. Since the column is
-- nullable, this silently succeeded and left it NULL. That code path is now
-- fixed — this migration is only for teacher_subjects rows that were
-- already created or edited through the buggy endpoints before the fix
-- landed; it does not change any application behavior going forward.
--
-- Safety model:
--   - Purely corrective: only fills in exam_board_id where it is currently
--     NULL. Never touches a row that already has a non-NULL value, so an
--     already-correct assignment (made through one of the three working
--     endpoints) is completely untouched.
--   - The correct value is derived the same way the working endpoints
--     already derive it — straight from subjects.exam_board_id for the
--     subject_id already on each row. This is a plain UPDATE ... FROM,
--     not a guess or a default.
--   - A teacher_subjects row whose subject_id no longer exists, or whose
--     subject somehow also has a NULL exam_board_id, is left untouched
--     (not touched by design — the UPDATE's JOIN simply won't match it) and
--     is called out by the second sanity-check SELECT below, rather than
--     silently ignored.
--
-- Run interactively (paste through the SELECT, review, then COMMIT
-- yourself), same as every other migration in this repo.

BEGIN;

-- Before: how many rows are affected, and a small sample so you can see
-- real examples before committing.
SELECT COUNT(*) AS teacher_subjects_missing_board_before
  FROM teacher_subjects ts
  JOIN subjects s ON s.id = ts.subject_id
 WHERE ts.exam_board_id IS NULL
   AND s.exam_board_id IS NOT NULL;

SELECT ts.id, ts.teacher_id, ts.subject_id, s.name AS subject_name, s.exam_board_id AS will_be_set_to
  FROM teacher_subjects ts
  JOIN subjects s ON s.id = ts.subject_id
 WHERE ts.exam_board_id IS NULL
   AND s.exam_board_id IS NOT NULL
 LIMIT 20;

UPDATE teacher_subjects ts
   SET exam_board_id = s.exam_board_id
  FROM subjects s
 WHERE ts.subject_id = s.id
   AND ts.exam_board_id IS NULL
   AND s.exam_board_id IS NOT NULL;

-- After: should read 0 — every fixable row was fixed.
SELECT COUNT(*) AS teacher_subjects_missing_board_after_should_be_0
  FROM teacher_subjects ts
  JOIN subjects s ON s.id = ts.subject_id
 WHERE ts.exam_board_id IS NULL
   AND s.exam_board_id IS NOT NULL;

-- Rows that are STILL NULL after the update above are not fixable by this
-- migration (their subject itself has no exam_board_id, or was deleted) —
-- not necessarily 0, and that's fine; this is informational, so you know
-- what (if anything) is left rather than assuming everything is now clean.
SELECT COUNT(*) AS teacher_subjects_still_null_unfixable
  FROM teacher_subjects ts
 WHERE ts.exam_board_id IS NULL;

-- COMMIT;
-- ROLLBACK;
