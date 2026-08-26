-- migration_009_structured_question_type.sql
--
-- Phase 5 — adds 'structured' as a valid value on the Postgres enum type
-- backing questions.type, so Structured-question rows can be inserted and
-- queried (server/models/Question.js already lists 'structured' in its
-- Sequelize ENUM as of the Phase 5 commit; this migration is what makes the
-- underlying database column actually accept it).
--
-- SAFETY MODEL: purely ADDITIVE.
--   - One new enum label. No existing column, table, row, or constraint is
--     touched. No existing enum value is removed or renamed.
--   - Idempotent: safe to re-run. Step 1 only fires if 'structured' isn't
--     already present.
--
-- WHY \gexec INSTEAD OF A HARDCODED "ALTER TYPE enum_questions_type ...":
-- The enum type name backing questions.type is resolved dynamically from
-- pg_catalog rather than assumed, in case it doesn't match Sequelize's
-- default naming convention on this database. That resolution has to
-- produce a plain top-level ALTER TYPE statement (via psql's \gexec) rather
-- than running inside a DO block, because ALTER TYPE ... ADD VALUE cannot
-- execute inside a DO block's implicit subtransaction (a hard Postgres
-- restriction, independent of version) — it must run as a standalone
-- top-level statement.
--
-- Run this the same way as every other migration in this repo: against a
-- database you have just taken a fresh pg_dump backup of.
--   psql "$DATABASE_URL" -f database/migration_009_structured_question_type.sql

-- 1. Resolve the enum type name behind questions.type and build the ALTER
--    TYPE statement — only produces a row (and therefore only runs via
--    \gexec) if 'structured' is not already a valid label, so re-running
--    this file is a safe no-op.
SELECT format('ALTER TYPE %I ADD VALUE %L', t.typname, 'structured')
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_type t  ON t.oid = a.atttypid
WHERE c.relname = 'questions'
  AND a.attname = 'type'
  AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    WHERE e.enumtypid = t.oid AND e.enumlabel = 'structured'
  )
\gexec

-- 2. Verify resolution succeeded unambiguously and the value is now present.
--    RAISE EXCEPTION (not NOTICE) on any failure — deploy scripts relying on
--    this migration should treat an EXCEPTION here as a hard stop.
DO $$
DECLARE
  v_typename text;
  v_typecount int;
BEGIN
  SELECT t.typname, COUNT(*) OVER ()
    INTO v_typename, v_typecount
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_type t  ON t.oid = a.atttypid
  WHERE c.relname = 'questions' AND a.attname = 'type';

  IF v_typename IS NULL THEN
    RAISE EXCEPTION 'migration_009: could not resolve an enum type for questions.type — column not found, or column is not an enum';
  END IF;

  IF v_typecount > 1 THEN
    RAISE EXCEPTION 'migration_009: ambiguous resolution — % candidate type(s) found for questions.type', v_typecount;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = v_typename AND e.enumlabel = 'structured'
  ) THEN
    RAISE EXCEPTION 'migration_009: resolved enum type % but "structured" is still not a valid label after the ALTER TYPE step', v_typename;
  END IF;

  RAISE NOTICE 'migration_009: resolved enum type = %', v_typename;
END $$;

-- 3. Report the full, final list of enum values — both as a NOTICE (per the
--    self-verifying convention this migration was specified with) and as a
--    plain SELECT so any client/UI running this file gets a visible result
--    set, not just server-side log output.
DO $$
DECLARE
  v_typename text;
  v_values   text;
BEGIN
  SELECT t.typname INTO v_typename
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_type t  ON t.oid = a.atttypid
  WHERE c.relname = 'questions' AND a.attname = 'type';

  SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
    INTO v_values
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = v_typename;

  RAISE NOTICE 'migration_009: % values = %', v_typename, v_values;
END $$;

SELECT t.typname AS enum_type, e.enumlabel AS value, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_attribute a ON a.atttypid = t.oid
JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relname = 'questions' AND a.attname = 'type'
ORDER BY e.enumsortorder;
