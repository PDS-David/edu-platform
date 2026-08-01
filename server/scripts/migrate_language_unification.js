#!/usr/bin/env node
// server/scripts/migrate_language_unification.js
//
// Consolidates "English Masterclass" (em_*) into the language-agnostic
// "Language Masterclass" (lang_*) system as one of 8 languages, and
// replaces the per-language column model (em_registered_at,
// french_registered_at, german_registered_at / enable_em, enable_french,
// enable_german) with two join tables that scale past 3 languages.
//
// Run inside the API container:
//   docker exec aischool_api node /app/scripts/migrate_language_unification.js
//
// SAFE TO RE-RUN. Every step is idempotent (IF NOT EXISTS / ON CONFLICT DO
// NOTHING / WHERE NOT EXISTS guards). Does NOT drop em_* tables — those stay
// as a rollback safety net; see server/scripts/verify_language_unification.js
// for the before/after row-count + spot-check script that must pass before
// any decision to drop them.
//
// ORDER MATTERS: lang_categories/lang_words PK type conversion (int -> uuid)
// must happen before the em_* -> lang_* data copy, because em_categories.id
// / em_words.id are already UUID and we want the copy to preserve those IDs
// exactly rather than minting new ones.

'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function exec(label, sql) {
  try {
    await pool.query(sql);
    console.log(`  ✅  ${label}`);
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('duplicate')) {
      console.log(`  ⏭️   ${label} (already ok)`);
    } else {
      console.error(`  ❌  ${label}`);
      console.error(`       ${e.message}`);
    }
  }
}

// The 8 supported language codes, for every CHECK constraint below.
const LANGUAGES = ['english', 'french', 'german', 'mandarin', 'arabic', 'spanish', 'swahili', 'yoruba'];
const LANG_CHECK_LIST = LANGUAGES.map((l) => `'${l}'`).join(', ');

async function run() {
  console.log('\n🔧 Language Masterclass — Unification Migration\n');

  // ── STEP 0: sanity-check the tables this script depends on actually exist,
  // matching the current repo state rather than assuming it ─────────────────
  const required = ['em_categories', 'em_words', 'em_practice_sessions',
    'em_pronunciation_attempts', 'em_writing_submissions', 'em_word_progress',
    'em_user_stats', 'lang_categories', 'lang_words', 'lang_practice_sessions',
    'lang_pronunciation_attempts', 'users', 'schools'];
  const { rows: existing } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
    [required]
  );
  const existingSet = new Set(existing.map((r) => r.table_name));
  const missing = required.filter((t) => !existingSet.has(t));
  if (missing.length) {
    console.error(`❌ Aborting — expected tables missing (schema has moved since this was written): ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('  ✅  pre-flight: all expected tables present\n');

  // ── STEP 1: convert lang_categories.id and lang_words.id from INTEGER to
  // UUID. Only French/German POC rows exist today (per commits b76c41a /
  // 3131f3d) — this is a small, low-risk conversion now; it becomes far more
  // disruptive to do later once 8 languages of real traffic depend on the
  // integer PKs. Confirmed the int-vs-uuid mismatch directly against the
  // live schema before writing this (em_categories/em_words are UUID; the
  // French/German POC tables were built as SERIAL int) rather than assuming
  // the prompt's "preserve all IDs" was automatically satisfiable.
  //
  // One-time structural change -- guarded so a re-run doesn't attempt it
  // twice (the ADD COLUMN IF NOT EXISTS steps below are individually
  // idempotent, but the DROP/RENAME sequence as a whole is not, since the
  // "new_*" staging column names are gone once already promoted to "id").
  const { rows: idTypeRows } = await pool.query(`
    SELECT data_type FROM information_schema.columns
     WHERE table_name = 'lang_categories' AND column_name = 'id'`);
  const alreadyConverted = idTypeRows[0]?.data_type === 'uuid';
  if (alreadyConverted) {
    console.log('  ⏭️   lang_categories/lang_words PK conversion (already uuid, skipping)');
  } else {
  await exec('lang_categories: add uuid id column', `
    ALTER TABLE lang_categories ADD COLUMN IF NOT EXISTS new_id UUID DEFAULT gen_random_uuid()`);
  await exec('lang_categories: backfill uuid ids', `
    UPDATE lang_categories SET new_id = gen_random_uuid() WHERE new_id IS NULL`);

  await exec('lang_words: add uuid id + uuid category_id columns', `
    ALTER TABLE lang_words
      ADD COLUMN IF NOT EXISTS new_id UUID DEFAULT gen_random_uuid(),
      ADD COLUMN IF NOT EXISTS new_category_id UUID`);
  await exec('lang_words: backfill uuid category_id from lang_categories.new_id', `
    UPDATE lang_words w SET new_category_id = c.new_id
      FROM lang_categories c WHERE w.category_id = c.id AND w.new_category_id IS NULL`);

  await exec('lang_practice_sessions: add uuid category_id column', `
    ALTER TABLE lang_practice_sessions ADD COLUMN IF NOT EXISTS new_category_id UUID`);
  await exec('lang_practice_sessions: backfill uuid category_id', `
    UPDATE lang_practice_sessions s SET new_category_id = c.new_id
      FROM lang_categories c WHERE s.category_id = c.id AND s.new_category_id IS NULL`);

  await exec('lang_pronunciation_attempts: add uuid word_id column', `
    ALTER TABLE lang_pronunciation_attempts ADD COLUMN IF NOT EXISTS new_word_id UUID`);
  await exec('lang_pronunciation_attempts: backfill uuid word_id', `
    UPDATE lang_pronunciation_attempts a SET new_word_id = w.new_id
      FROM lang_words w WHERE a.word_id = w.id AND a.new_word_id IS NULL`);

  // Swap columns: drop old int PK/FK chain, promote the new uuid columns.
  await exec('lang_pronunciation_attempts: drop old int word_id FK/column', `
    ALTER TABLE lang_pronunciation_attempts
      DROP CONSTRAINT IF EXISTS lang_pronunciation_attempts_word_id_fkey,
      DROP COLUMN IF EXISTS word_id`);
  await exec('lang_practice_sessions: drop old int category_id FK/column', `
    ALTER TABLE lang_practice_sessions
      DROP CONSTRAINT IF EXISTS lang_practice_sessions_category_id_fkey,
      DROP COLUMN IF EXISTS category_id`);
  await exec('lang_words: drop old int category_id FK/column', `
    ALTER TABLE lang_words
      DROP CONSTRAINT IF EXISTS lang_words_category_id_fkey,
      DROP COLUMN IF EXISTS category_id`);
  await exec('lang_words: drop old int id, promote uuid id', `
    ALTER TABLE lang_words
      DROP CONSTRAINT IF EXISTS lang_words_pkey,
      DROP COLUMN IF EXISTS id`);
  await exec('lang_categories: drop old int id, promote uuid id', `
    ALTER TABLE lang_categories
      DROP CONSTRAINT IF EXISTS lang_categories_pkey,
      DROP COLUMN IF EXISTS id`);

  await exec('lang_categories: rename new_id -> id, re-add PK', `
    ALTER TABLE lang_categories RENAME COLUMN new_id TO id`);
  await exec('lang_categories: add PK on id', `
    ALTER TABLE lang_categories ADD CONSTRAINT lang_categories_pkey PRIMARY KEY (id)`);

  await exec('lang_words: rename new_id/new_category_id -> id/category_id', `
    ALTER TABLE lang_words RENAME COLUMN new_id TO id`);
  await exec('lang_words: rename category_id', `
    ALTER TABLE lang_words RENAME COLUMN new_category_id TO category_id`);
  await exec('lang_words: re-add PK + FK', `
    ALTER TABLE lang_words
      ADD CONSTRAINT lang_words_pkey PRIMARY KEY (id),
      ADD CONSTRAINT lang_words_category_id_fkey FOREIGN KEY (category_id)
        REFERENCES lang_categories(id) ON DELETE CASCADE`);
  await exec('lang_words: category_id NOT NULL + index', `
    ALTER TABLE lang_words ALTER COLUMN category_id SET NOT NULL`);
  await exec('lang_words: recreate category index', `
    CREATE INDEX IF NOT EXISTS idx_lang_words_category ON lang_words(category_id)`);

  await exec('lang_practice_sessions: rename + re-add FK', `
    ALTER TABLE lang_practice_sessions RENAME COLUMN new_category_id TO category_id`);
  await exec('lang_practice_sessions: re-add category_id FK', `
    ALTER TABLE lang_practice_sessions
      ADD CONSTRAINT lang_practice_sessions_category_id_fkey FOREIGN KEY (category_id)
        REFERENCES lang_categories(id) ON DELETE SET NULL`);

  await exec('lang_pronunciation_attempts: rename + re-add FK', `
    ALTER TABLE lang_pronunciation_attempts RENAME COLUMN new_word_id TO word_id`);
  await exec('lang_pronunciation_attempts: re-add word_id FK', `
    ALTER TABLE lang_pronunciation_attempts
      ADD CONSTRAINT lang_pronunciation_attempts_word_id_fkey FOREIGN KEY (word_id)
        REFERENCES lang_words(id) ON DELETE SET NULL`);

  await exec('lang_categories: drop old sequence (no longer referenced)', `
    DROP SEQUENCE IF EXISTS lang_categories_id_seq`);
  await exec('lang_words: drop old sequence (no longer referenced)', `
    DROP SEQUENCE IF EXISTS lang_words_id_seq`);
  } // end alreadyConverted guard

  // ── STEP 2: widen the language CHECK constraints to all 8 languages ──────
  await exec('lang_categories: widen language check to 8 languages', `
    ALTER TABLE lang_categories DROP CONSTRAINT IF EXISTS lang_categories_language_check;
    ALTER TABLE lang_categories ADD CONSTRAINT lang_categories_language_check
      CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))`);
  await exec('lang_practice_sessions: widen language check to 8 languages', `
    ALTER TABLE lang_practice_sessions DROP CONSTRAINT IF EXISTS lang_practice_sessions_language_check;
    ALTER TABLE lang_practice_sessions ADD CONSTRAINT lang_practice_sessions_language_check
      CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))`);
  await exec('lang_pronunciation_attempts: widen language check to 8 languages', `
    ALTER TABLE lang_pronunciation_attempts DROP CONSTRAINT IF EXISTS lang_pronunciation_attempts_language_check;
    ALTER TABLE lang_pronunciation_attempts ADD CONSTRAINT lang_pronunciation_attempts_language_check
      CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))`);
  // lang_categories.language / lang_words have no length-10 problem since
  // 'mandarin' (8) / 'swahili' (7) all fit VARCHAR(10); widen anyway in case
  // a future code is longer than 10 chars.
  await exec('lang_categories: widen language column length', `
    ALTER TABLE lang_categories ALTER COLUMN language TYPE VARCHAR(20)`);
  await exec('lang_practice_sessions: widen language column length', `
    ALTER TABLE lang_practice_sessions ALTER COLUMN language TYPE VARCHAR(20)`);
  await exec('lang_pronunciation_attempts: widen language column length', `
    ALTER TABLE lang_pronunciation_attempts ALTER COLUMN language TYPE VARCHAR(20)`);

  // ── STEP 3: per-language exercise-support metadata ────────────────────────
  // Replaces "which exercises actually work per language" being implicit in
  // which route file existed. English: all 3 exercises real. The other 7
  // (including French/German, which per b76c41a/3131f3d only ever shipped
  // real pronunciation scoring): pronunciation only for French/German,
  // nothing yet for the 5 brand-new ones -- seeded conservatively (all
  // false) below and can be flipped on per-language as real backend work
  // for that language's listening/writing lands.
  await exec('languages: create reference table', `
    CREATE TABLE IF NOT EXISTS languages (
      code                  VARCHAR(20) PRIMARY KEY,
      display_name          TEXT NOT NULL,
      supports_pronunciation BOOLEAN NOT NULL DEFAULT false,
      supports_listening     BOOLEAN NOT NULL DEFAULT false,
      supports_writing        BOOLEAN NOT NULL DEFAULT false,
      is_rtl                BOOLEAN NOT NULL DEFAULT false,
      display_order         INTEGER NOT NULL DEFAULT 0
    )`);
  await exec('languages: seed all 8', `
    INSERT INTO languages (code, display_name, supports_pronunciation, supports_listening, supports_writing, is_rtl, display_order) VALUES
      ('english',  'English',  true,  true,  true,  false, 1),
      ('french',   'French',   true,  false, false, false, 2),
      ('german',   'German',   true,  false, false, false, 3),
      ('mandarin', 'Mandarin', false, false, false, false, 4),
      ('arabic',   'Arabic',   false, false, false, true,  5),
      ('spanish',  'Spanish',  false, false, false, false, 6),
      ('swahili',  'Swahili',  false, false, false, false, 7),
      ('yoruba',   'Yoruba',   false, false, false, false, 8)
    ON CONFLICT (code) DO NOTHING`);

  // ── STEP 4: bring lang_* up to parity with em_*'s full feature set ────────
  // (writing submissions, per-word progress, aggregate user stats) --
  // required so English doesn't lose these when it moves into lang_*, and
  // so the other 7 languages have somewhere for this data to land once
  // their backends grow these features.
  await exec('lang_writing_submissions: create table', `
    CREATE TABLE IF NOT EXISTS lang_writing_submissions (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language                VARCHAR(20) NOT NULL,
      word_id                 INT REFERENCES lang_words(id) ON DELETE SET NULL,
      word_text               TEXT NOT NULL,
      prompt                  TEXT NOT NULL,
      submission_text         TEXT NOT NULL,
      score                   NUMERIC(5,2) NOT NULL,
      used_word_correctly     BOOLEAN NOT NULL DEFAULT false,
      grammar_notes           TEXT,
      feedback                TEXT,
      sentence_count_required INTEGER,
      sentence_count_written  INTEGER,
      sentence_count_met      BOOLEAN,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT lang_writing_submissions_language_check
        CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))
    )`);
  await exec('lang_writing_submissions: indexes', `
    CREATE INDEX IF NOT EXISTS idx_lang_writing_user ON lang_writing_submissions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lang_writing_word ON lang_writing_submissions(word_id)`);

  await exec('lang_word_progress: create table', `
    CREATE TABLE IF NOT EXISTS lang_word_progress (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language          VARCHAR(20) NOT NULL,
      word_id           INT NOT NULL REFERENCES lang_words(id) ON DELETE CASCADE,
      correct_attempts  INTEGER NOT NULL DEFAULT 0,
      total_attempts    INTEGER NOT NULL DEFAULT 0,
      mastered          BOOLEAN NOT NULL DEFAULT false,
      last_practiced    TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, word_id),
      CONSTRAINT lang_word_progress_language_check
        CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))
    )`);
  await exec('lang_word_progress: index', `
    CREATE INDEX IF NOT EXISTS idx_lang_word_progress_user ON lang_word_progress(user_id, language)`);

  await exec('lang_user_stats: create table', `
    CREATE TABLE IF NOT EXISTS lang_user_stats (
      user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language            VARCHAR(20) NOT NULL,
      words_learned       INTEGER NOT NULL DEFAULT 0,
      words_mastered      INTEGER NOT NULL DEFAULT 0,
      practice_streak     INTEGER NOT NULL DEFAULT 0,
      longest_streak      INTEGER NOT NULL DEFAULT 0,
      total_sessions      INTEGER NOT NULL DEFAULT 0,
      total_practice_secs INTEGER NOT NULL DEFAULT 0,
      overall_accuracy    NUMERIC(5,2) NOT NULL DEFAULT 0,
      last_practice_date  DATE,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, language),
      CONSTRAINT lang_user_stats_language_check
        CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))
    )`);

  // ── STEP 5: copy every em_* row into lang_* as language='english',
  // preserving original IDs (both sides are UUID after step 1). Idempotent
  // via WHERE NOT EXISTS -- safe to re-run without duplicating rows. ───────
  await exec('data migration: em_categories -> lang_categories', `
    INSERT INTO lang_categories (id, language, name, description, difficulty, icon_emoji, order_index, is_active, created_at)
    SELECT id, 'english', name, description, difficulty, icon_emoji, order_index, is_active, created_at
      FROM em_categories c
     WHERE NOT EXISTS (SELECT 1 FROM lang_categories lc WHERE lc.id = c.id)`);

  await exec('data migration: em_words -> lang_words', `
    INSERT INTO lang_words (id, category_id, word, phonetic, definition, example_sentence, icon_emoji, is_active, created_at)
    SELECT id, category_id, word, phonetic, definition, example_sentence, NULL, is_active, created_at
      FROM em_words w
     WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.id = w.id)`);

  await exec('data migration: em_practice_sessions -> lang_practice_sessions', `
    INSERT INTO lang_practice_sessions (id, user_id, language, category_id, difficulty, total_words, correct_words, created_at)
    SELECT id, user_id, 'english', category_id, difficulty, total_words, correct_words, created_at
      FROM em_practice_sessions s
     WHERE NOT EXISTS (SELECT 1 FROM lang_practice_sessions ls WHERE ls.id = s.id)`);

  await exec('data migration: em_pronunciation_attempts -> lang_pronunciation_attempts', `
    INSERT INTO lang_pronunciation_attempts (id, user_id, language, word_id, word_text, audio_url, heard, score, matched, feedback, created_at)
    SELECT id, user_id, 'english', word_id, word_text, audio_url, heard, score, matched, feedback, created_at
      FROM em_pronunciation_attempts a
     WHERE NOT EXISTS (SELECT 1 FROM lang_pronunciation_attempts la WHERE la.id = a.id)`);

  await exec('data migration: em_writing_submissions -> lang_writing_submissions', `
    INSERT INTO lang_writing_submissions (id, user_id, language, word_id, word_text, prompt, submission_text, score, used_word_correctly, grammar_notes, feedback, sentence_count_required, sentence_count_written, sentence_count_met, created_at)
    SELECT id, user_id, 'english', word_id, word_text, prompt, submission_text, score, used_word_correctly, grammar_notes, feedback, sentence_count_required, sentence_count_written, sentence_count_met, created_at
      FROM em_writing_submissions ws
     WHERE NOT EXISTS (SELECT 1 FROM lang_writing_submissions lws WHERE lws.id = ws.id)`);

  await exec('data migration: em_word_progress -> lang_word_progress', `
    INSERT INTO lang_word_progress (id, user_id, language, word_id, correct_attempts, total_attempts, mastered, last_practiced, created_at, updated_at)
    SELECT id, user_id, 'english', word_id, correct_attempts, total_attempts, mastered, last_practiced, created_at, updated_at
      FROM em_word_progress p
     WHERE NOT EXISTS (SELECT 1 FROM lang_word_progress lp WHERE lp.id = p.id)`);

  await exec('data migration: em_user_stats -> lang_user_stats', `
    INSERT INTO lang_user_stats (user_id, language, words_learned, words_mastered, practice_streak, longest_streak, total_sessions, total_practice_secs, overall_accuracy, last_practice_date, updated_at)
    SELECT user_id, 'english', words_learned, words_mastered, practice_streak, longest_streak, total_sessions, total_practice_secs, overall_accuracy, last_practice_date, updated_at
      FROM em_user_stats s
     WHERE NOT EXISTS (SELECT 1 FROM lang_user_stats ls WHERE ls.user_id = s.user_id AND ls.language = 'english')`);

  // ── STEP 6: registration/enablement join tables ───────────────────────────
  await exec('user_language_registrations: create table', `
    CREATE TABLE IF NOT EXISTS user_language_registrations (
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language      VARCHAR(20) NOT NULL,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, language),
      CONSTRAINT user_language_registrations_language_check
        CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))
    )`);
  await exec('school_enabled_languages: create table', `
    CREATE TABLE IF NOT EXISTS school_enabled_languages (
      school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      language   VARCHAR(20) NOT NULL,
      enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (school_id, language),
      CONSTRAINT school_enabled_languages_language_check
        CHECK (language = ANY (ARRAY[${LANG_CHECK_LIST}]))
    )`);

  // Migrate existing per-column data into the join tables -- every existing
  // registered/enabled account keeps its status exactly, timestamp included.
  await exec('migrate em_registered_at -> user_language_registrations(english)', `
    INSERT INTO user_language_registrations (user_id, language, registered_at)
    SELECT id, 'english', em_registered_at FROM users
     WHERE em_registered_at IS NOT NULL
    ON CONFLICT (user_id, language) DO NOTHING`);
  await exec('migrate french_registered_at -> user_language_registrations(french)', `
    INSERT INTO user_language_registrations (user_id, language, registered_at)
    SELECT id, 'french', french_registered_at FROM users
     WHERE french_registered_at IS NOT NULL
    ON CONFLICT (user_id, language) DO NOTHING`);
  await exec('migrate german_registered_at -> user_language_registrations(german)', `
    INSERT INTO user_language_registrations (user_id, language, registered_at)
    SELECT id, 'german', german_registered_at FROM users
     WHERE german_registered_at IS NOT NULL
    ON CONFLICT (user_id, language) DO NOTHING`);

  await exec('migrate enable_em -> school_enabled_languages(english)', `
    INSERT INTO school_enabled_languages (school_id, language)
    SELECT id, 'english' FROM schools WHERE enable_em = true
    ON CONFLICT (school_id, language) DO NOTHING`);
  await exec('migrate enable_french -> school_enabled_languages(french)', `
    INSERT INTO school_enabled_languages (school_id, language)
    SELECT id, 'french' FROM schools WHERE enable_french = true
    ON CONFLICT (school_id, language) DO NOTHING`);
  await exec('migrate enable_german -> school_enabled_languages(german)', `
    INSERT INTO school_enabled_languages (school_id, language)
    SELECT id, 'german' FROM schools WHERE enable_german = true
    ON CONFLICT (school_id, language) DO NOTHING`);

  console.log('\n✅ Language unification migration complete.\n');
  console.log('NOTE: old columns (em_registered_at, french_registered_at, german_registered_at,');
  console.log('enable_em, enable_french, enable_german) and old tables (em_*) are intentionally');
  console.log('left in place as a rollback safety net -- do not drop until');
  console.log('verify_language_unification.js passes against production data and the app has');
  console.log('run against the new join tables for at least one full deploy cycle.\n');

  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
