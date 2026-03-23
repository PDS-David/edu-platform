-- ============================================================
-- MIGRATION 002 — Reconcile topics table
-- Diagnoses the search_path issue, re-seeds topics from
-- questions.topic if the table is empty, merges 3 known
-- duplicate topic names.
-- Run: \i 002_reconcile_topics.sql
-- ============================================================

BEGIN;

-- Step 1: Force public schema so we hit the right table
SET search_path TO public;

-- Step 2: Diagnostic — how many rows exist right now?
-- (comment out if running non-interactively)
-- SELECT COUNT(*) AS topics_count FROM topics;

-- Step 3: Seed topics from questions if the table is empty.
-- Each distinct (topic, subject_id_uuid) pair in questions
-- becomes one row. Skips if a row already exists (ON CONFLICT).
INSERT INTO topics (id, name, subject_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  q.topic,
  q.subject_id_uuid,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT topic, subject_id_uuid
  FROM questions
  WHERE topic IS NOT NULL
    AND topic <> ''
    AND subject_id_uuid IS NOT NULL
) q
ON CONFLICT DO NOTHING;

-- Step 4: Merge duplicate topic names.
-- For each pair we keep the row with more subtopics/questions,
-- re-point children, then delete the loser.

-- 4a — Macroeconomics (two rows, same subject)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY name, subject_id
           ORDER BY (SELECT COUNT(*) FROM subtopics st WHERE st.topic_id = topics.id) DESC,
                    created_at ASC
         ) AS rn
  FROM topics
  WHERE name = 'Macroeconomics'
)
UPDATE subtopics
SET topic_id = (SELECT id FROM ranked WHERE rn = 1 LIMIT 1)
WHERE topic_id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE questions
SET topic = 'Macroeconomics'
WHERE topic = 'Macroeconomics'; -- no-op needed; subtopic_id link is what matters

DELETE FROM topics
WHERE name = 'Macroeconomics'
  AND id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY name, subject_id
               ORDER BY (SELECT COUNT(*) FROM subtopics st WHERE st.topic_id = topics.id) DESC,
                        created_at ASC
             ) AS rn
      FROM topics WHERE name = 'Macroeconomics'
    ) t WHERE rn > 1
  );

-- 4b — Microeconomics
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY name, subject_id
           ORDER BY (SELECT COUNT(*) FROM subtopics st WHERE st.topic_id = topics.id) DESC,
                    created_at ASC
         ) AS rn
  FROM topics WHERE name = 'Microeconomics'
)
UPDATE subtopics
SET topic_id = (SELECT id FROM ranked WHERE rn = 1 LIMIT 1)
WHERE topic_id IN (SELECT id FROM ranked WHERE rn > 1);

DELETE FROM topics
WHERE name = 'Microeconomics'
  AND id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY name, subject_id
               ORDER BY (SELECT COUNT(*) FROM subtopics st WHERE st.topic_id = topics.id) DESC,
                        created_at ASC
             ) AS rn
      FROM topics WHERE name = 'Microeconomics'
    ) t WHERE rn > 1
  );

-- 4c — Comprehension & Summary
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY name, subject_id
           ORDER BY (SELECT COUNT(*) FROM subtopics st WHERE st.topic_id = topics.id) DESC,
                    created_at ASC
         ) AS rn
  FROM topics WHERE name = 'Comprehension & Summary'
)
UPDATE subtopics
SET topic_id = (SELECT id FROM ranked WHERE rn = 1 LIMIT 1)
WHERE topic_id IN (SELECT id FROM ranked WHERE rn > 1);

DELETE FROM topics
WHERE name = 'Comprehension & Summary'
  AND id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY name, subject_id
               ORDER BY (SELECT COUNT(*) FROM subtopics st WHERE st.topic_id = topics.id) DESC,
                        created_at ASC
             ) AS rn
      FROM topics WHERE name = 'Comprehension & Summary'
    ) t WHERE rn > 1
  );

-- Step 5: Verify — should return 0 duplicates
SELECT name, COUNT(*) FROM topics GROUP BY name HAVING COUNT(*) > 1;

COMMIT;
