-- audit_missing_column_defaults.sql
--
-- READ-ONLY. Changes nothing. Safe to run anytime, no backup needed first.
--
-- WHY THIS EXISTS: two separate live incidents (past_papers.updated_at,
-- then notifications.created_at, then notifications.updated_at as its
-- sibling) all had the exact same root cause: the canonical schema in
-- server/scripts/run_complete_migration.js declares a column with
-- `DEFAULT NOW()`, but because every CREATE TABLE there is guarded by
-- `IF NOT EXISTS`, that default silently never gets applied if the live
-- table already existed before the definition was written or changed.
-- Each incident so far has been caught only when a real insert crashed in
-- production. This audit finds every remaining table with the same latent
-- gap, so they can be reviewed and fixed proactively instead of one
-- complaint at a time.
--
-- WHAT IT DOES: compares every created_at/updated_at column that Postgres
-- reports as having NO default against the ~30 tables where the canonical
-- schema says one should exist. A result here does NOT necessarily mean
-- every insert into that table is broken — some call sites already set
-- the column explicitly (same pattern used to fix notifications and
-- past_papers) and are unaffected either way. It DOES mean the column
-- itself is a landmine for any insert that doesn't set it explicitly,
-- exactly like the incidents above.
--
-- HOW TO USE THE OUTPUT: for each row returned, either (a) confirm every
-- INSERT into that table already sets the column explicitly (safe, no
-- action needed), or (b) write a migration_0XX_<table>_<column>_default.sql
-- following the exact pattern of migration_012/migration_014 for that
-- specific table/column. Don't blanket-fix everything returned here
-- without checking first — some may be genuinely fine.

SELECT c.table_name,
       c.column_name,
       c.is_nullable,
       c.column_default
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_name = c.table_name AND t.table_schema = 'public'
 WHERE c.table_schema = 'public'
   AND c.column_name IN ('created_at', 'updated_at')
   AND c.column_default IS NULL
   AND c.table_name IN (
     -- Every table this session found declaring created_at/updated_at
     -- DEFAULT NOW() in server/scripts/run_complete_migration.js as of
     -- 2026-08-27. Re-derive this list yourself before trusting it fully —
     -- `grep -B5 "created_at.*DEFAULT NOW()\|updated_at.*DEFAULT NOW()" server/scripts/run_complete_migration.js`
     -- — in case the schema has grown since this was written.
     'answer_options', 'subtopic_progress', 'quiz_attempts', 'student_answers',
     'subtopic_quiz_attempts', 'subtopic_quiz_answers', 'concepts',
     'concept_dependencies', 'question_concepts', 'student_concept_mastery',
     'notifications', 'ai_chat_sessions', 'ai_chat_messages',
     'ai_explanation_cache', 'user_learning_profile', 'courses', 'videos',
     'revision_notes', 'video_progress', 'student_analytics',
     'ai_question_logs', 'classes', 'custom_tests', 'subscription_plans',
     'payment_transactions', 'user_subscriptions', 'past_papers'
   )
 ORDER BY c.table_name, c.column_name;
