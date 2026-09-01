-- migration_026_exam_board_subject_count_standards.sql
--
-- Every exam board on this platform currently enforces a MAXIMUM subject
-- count via exam_boards.max_subjects (migration_008_exam_board_limits.sql),
-- but there is no MINIMUM enforcement anywhere -- the column doesn't exist.
-- A school admin can currently assign a JAMB student just 1 subject, a WAEC
-- student 2 subjects, etc., which no real exam board actually permits.
-- Separately, several boards were never given a max_subjects value at all
-- (BECE, CAMBAL, CAMBOL all sit at NULL = completely unrestricted today),
-- and JUPEB's existing max_subjects value is itself wrong.
--
-- Every figure below is the exam board's own official/structural
-- registration rule, researched individually (not "what most students
-- happen to pick") -- sources noted per board. Where a board's real-world
-- range genuinely differs by track/state/institution, that is called out
-- explicitly rather than silently picking one.
--
-- JAMB/UTME: FIXED at exactly 4 (English Language, compulsory, + 3
--   electives) -- not a range. Every current UTME guide agrees on this.
--   min = max = 4. No change to the existing max_subjects = 4; this just
--   adds the matching min.
--
-- WAEC (SSCE) / NECO: FIXED range of 8-9, confirmed directly from WAEC's
--   own registration portal ("a minimum of Eight (8) and a maximum of Nine
--   (9) subjects are allowed") and repeated consistently across every
--   2026/2027-dated guide checked. min = 8, max = 9 for both -- existing
--   max_subjects = 9 for both is already correct; this adds the missing
--   min = 8.
--
-- JUPEB: FIXED at exactly 3 subjects (plus a compulsory, non-elective
--   General Studies course that isn't a subject choice) -- every current
--   JUPEB source agrees on exactly 3, none mention 4. THE EXISTING
--   max_subjects = 4 FOR JUPEB IS WRONG and is corrected here to 3, along
--   with the matching min = 3.
--
-- Cambridge GCE A' Level (CAMBAL): no board-mandated minimum exists (A
--   Level is genuinely elective, unlike the Nigerian exams above), but the
--   near-universal practical standard across every current Cambridge/
--   school guide checked is 3 subjects as the norm, up to 4 for strong
--   students (occasionally 5, but 4 is the commonly cited practical
--   ceiling). min = 3, max = 4.
--
-- Cambridge GCE O' Level / IGCSE (CAMBOL): Cambridge's own published
--   curriculum-wide floor and ceiling is 5 and 14 respectively (most
--   students in practice sit 7-10, but that's a recommendation, not the
--   board's actual allowed range). min = 5, max = 14.
--
-- BECE (Junior WAEC): GENUINELY AMBIGUOUS, flagged rather than guessed
--   confidently -- Nigeria runs two distinct BECE tracks with different
--   published ranges: the federal NECO-administered track (min 9, max 10,
--   per NECO's own current registration guidance) and state-run/WAEC-style
--   tracks (commonly cited as min 10-11, max 13). Set here to the widest
--   union of everything found (min = 9, max = 13) so a legitimate
--   registration under EITHER track is never wrongly blocked -- but this
--   is the one figure in this migration worth double-checking against
--   which specific track your schools actually register under, and
--   narrowing later via a simple UPDATE if you confirm just one applies.
--
-- IELTS / TOEFL / SAT: untouched -- these are already correctly modelled
--   via requires_all_subjects = true (a single comprehensive test, not a
--   "pick N subjects" exam), which the application code already treats as
--   exempt from any min/max check. No board-appropriate concept of a
--   subject minimum/maximum applies to them.
--
-- SAFETY MODEL: additive column (nullable, so any exam board not
-- explicitly listed below simply keeps min_subjects = NULL = no minimum
-- enforced, same "no limit" meaning NULL already carries for
-- max_subjects). The one behavior CHANGE here is JUPEB's max_subjects
-- 4 -> 3 correction -- cannot break any *existing* student_subjects row
-- (a CHECK constraint on a count is enforced at application level in
-- schoolRoutes.js, not a DB constraint, so no historical row is
-- retroactively invalidated by this), but will change what a school admin
-- can newly assign going forward for JUPEB from this point on.

BEGIN;

ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS min_subjects INTEGER;

UPDATE exam_boards SET min_subjects = 4  WHERE UPPER(code) = 'JAMB';
UPDATE exam_boards SET min_subjects = 8  WHERE UPPER(code) = 'WAEC';
UPDATE exam_boards SET min_subjects = 8  WHERE UPPER(code) = 'NECO';
UPDATE exam_boards SET min_subjects = 3, max_subjects = 3 WHERE UPPER(code) = 'JUPEB';
UPDATE exam_boards SET min_subjects = 3, max_subjects = 4 WHERE UPPER(code) = 'CAMBAL';
UPDATE exam_boards SET min_subjects = 5, max_subjects = 14 WHERE UPPER(code) = 'CAMBOL';
UPDATE exam_boards SET min_subjects = 9, max_subjects = 13 WHERE UPPER(code) = 'BECE';

-- Sanity check before committing.
SELECT code, name, min_subjects, max_subjects, requires_all_subjects
  FROM exam_boards
 WHERE is_active = true
 ORDER BY display_order;

-- Expect:
--   JAMB   | min 4  | max 4
--   WAEC   | min 8  | max 9
--   NECO   | min 8  | max 9
--   BECE   | min 9  | max 13 (flagged above -- confirm your actual track)
--   JUPEB  | min 3  | max 3  (corrected from max 4)
--   CAMBAL | min 3  | max 4
--   CAMBOL | min 5  | max 14
--   IELTS/TOEFL/SAT | min/max NULL, requires_all_subjects = true (unchanged)

-- COMMIT;
-- ROLLBACK;
