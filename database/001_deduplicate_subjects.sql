-- ============================================================
-- MIGRATION 001 — Deduplicate subjects
-- For each subject name keep the UUID that appears most in
-- questions.subject_id_uuid, re-point all question rows to it,
-- delete the orphan rows, then add a uniqueness constraint.
-- Run in psql: \i 001_deduplicate_subjects.sql
-- ============================================================

BEGIN;

-- Step 1: For every duplicate subject name, find the canonical id
-- (the one referenced by the most questions — or the first created if tied)
CREATE TEMP TABLE subject_canonical AS
SELECT DISTINCT ON (s.name, s.exam_board_id)
       s.name,
       s.exam_board_id,
       s.id AS canonical_id
FROM subjects s
ORDER BY
  s.name,
  s.exam_board_id,
  (SELECT COUNT(*) FROM questions q WHERE q.subject_id_uuid = s.id) DESC,
  s.created_at ASC;

-- Step 2: Re-point questions to the canonical id
UPDATE questions q
SET subject_id_uuid = sc.canonical_id
FROM subjects s
JOIN subject_canonical sc
  ON sc.name = s.name
 AND sc.exam_board_id = s.exam_board_id
WHERE q.subject_id_uuid = s.id
  AND s.id <> sc.canonical_id;

-- Step 3: Re-point topics to the canonical id
UPDATE topics t
SET subject_id = sc.canonical_id
FROM subjects s
JOIN subject_canonical sc
  ON sc.name = s.name
 AND sc.exam_board_id = s.exam_board_id
WHERE t.subject_id = s.id
  AND s.id <> sc.canonical_id;

-- Step 4: Delete the duplicate rows (keep only canonical)
DELETE FROM subjects s
USING subject_canonical sc
WHERE s.name = sc.name
  AND s.exam_board_id = sc.exam_board_id
  AND s.id <> sc.canonical_id;

DROP TABLE subject_canonical;

-- Step 5: Add uniqueness constraint to prevent future duplication
ALTER TABLE subjects
  ADD CONSTRAINT subjects_name_board_unique UNIQUE (name, exam_board_id);

-- Verify
SELECT name, COUNT(*) AS cnt
FROM subjects
GROUP BY name
HAVING COUNT(*) > 1;
-- Should return 0 rows

COMMIT;
