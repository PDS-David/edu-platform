#!/usr/bin/env node
// server/scripts/fix_live_schema.js
// Run on the server: node server/scripts/fix_live_schema.js
// Or inside Docker: docker exec aischool_api node /app/scripts/fix_live_schema.js
//
// Fixes all known live database schema issues for AISchoolonair.
// Safe to run multiple times — all statements use IF NOT EXISTS / DO blocks.

'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_URL?.includes('render')
    ? { rejectUnauthorized: false }
    : false,
});

const migrations = [
  // 1. subjects table — exam_board_id must be INTEGER (exam_boards.id is SERIAL int)
  `DO $$ DECLARE col_type TEXT; BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name='subjects' AND column_name='exam_board_id';
    IF col_type IS NULL THEN
      ALTER TABLE subjects ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id) ON DELETE SET NULL;
    ELSIF col_type = 'uuid' THEN
      ALTER TABLE subjects DROP COLUMN exam_board_id;
      ALTER TABLE subjects ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id) ON DELETE SET NULL;
    END IF;
  EXCEPTION WHEN others THEN NULL; END $$`,
  `ALTER TABLE subjects ADD COLUMN IF NOT EXISTS exam_board_code VARCHAR(20)`,
  `ALTER TABLE subjects ADD COLUMN IF NOT EXISTS icon_emoji VARCHAR(10)`,
  `ALTER TABLE subjects ADD COLUMN IF NOT EXISTS color VARCHAR(20)`,
  `ALTER TABLE subjects ADD COLUMN IF NOT EXISTS category VARCHAR(50)`,
  `ALTER TABLE subjects ADD COLUMN IF NOT EXISTS image_url TEXT`,

  // 2. past_papers table
  `ALTER TABLE past_papers ADD COLUMN IF NOT EXISTS exam_board VARCHAR(100)`,
  `ALTER TABLE past_papers ADD COLUMN IF NOT EXISTS question_type VARCHAR(50)`,

  // 3. quiz_attempts table (required for admin analytics)
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       UUID        REFERENCES users(id) ON DELETE CASCADE,
    quiz_id          UUID,
    score            INTEGER     DEFAULT 0,
    total_questions  INTEGER     DEFAULT 0,
    percentage       NUMERIC(5,2) DEFAULT 0,
    status           VARCHAR(20) DEFAULT 'completed',
    start_time       TIMESTAMPTZ DEFAULT NOW(),
    end_time         TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id ON quiz_attempts(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quiz_attempts_created_at ON quiz_attempts(created_at)`,

  // 4. student_answers table (required for admin analytics)
  `CREATE TABLE IF NOT EXISTS student_answers (
    id              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id      UUID     REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id     UUID,
    selected_option VARCHAR(5),
    is_correct      BOOLEAN  DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_student_answers_attempt_id ON student_answers(attempt_id)`,

  // 5. resources table columns
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_staged    BOOLEAN DEFAULT false`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT true`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS mime_type    VARCHAR(120)`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_kind VARCHAR(32) DEFAULT 'learning_material'`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS questions_extracted_at TIMESTAMPTZ`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS push_type    VARCHAR(50) DEFAULT 'learning_material'`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS hls_path     TEXT`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_url  TEXT`,

  // 5b. topics table — MUST exist before resources FK below
  `CREATE TABLE IF NOT EXISTS topics (
    id          SERIAL       PRIMARY KEY,
    subject_id  INTEGER      REFERENCES subjects(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    title       VARCHAR(255),
    description TEXT,
    order_index INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id)`,
  `ALTER TABLE topics ADD COLUMN IF NOT EXISTS title VARCHAR(255)`,
  `ALTER TABLE topics ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`,

  // 5c. subtopics table — MUST exist before resources FK below
  `CREATE TABLE IF NOT EXISTS subtopics (
    id          SERIAL       PRIMARY KEY,
    topic_id    INTEGER      REFERENCES topics(id) ON DELETE CASCADE,
    subject_id  INTEGER      REFERENCES subjects(id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    content     TEXT,
    order_index INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id   ON subtopics(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subtopics_subject_id ON subtopics(subject_id)`,
  `ALTER TABLE subtopics ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`,

  // 6. resources FK columns (safe — only adds if missing)
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS topic_id    INTEGER REFERENCES topics(id)    ON DELETE SET NULL`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS subtopic_id INTEGER REFERENCES subtopics(id) ON DELETE SET NULL`,
  `ALTER TABLE resources ADD COLUMN IF NOT EXISTS subject_id  INTEGER REFERENCES subjects(id)  ON DELETE SET NULL`,

  // 7. resource_assignments
  `CREATE TABLE IF NOT EXISTS resource_assignments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    assigned_by UUID        NOT NULL REFERENCES users(id),
    student_id  UUID        REFERENCES users(id)   ON DELETE CASCADE,
    class_id    UUID        REFERENCES classes(id)  ON DELETE CASCADE,
    push_type   VARCHAR(50) DEFAULT 'learning_material',
    assigned_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 8. resource_user_assignments
  `CREATE TABLE IF NOT EXISTS resource_user_assignments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    assigned_by UUID        REFERENCES users(id),
    push_type   VARCHAR(50) DEFAULT 'learning_material',
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_rua_resource_user UNIQUE (resource_id, user_id, push_type)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rua_user_id     ON resource_user_assignments(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rua_resource_id ON resource_user_assignments(resource_id)`,

  // 9. exam_boards columns
  `ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT true`,
  `ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0`,
  `ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS icon_emoji    VARCHAR(10)`,
  `ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS full_name     VARCHAR(255)`,
  `ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS country       VARCHAR(100) DEFAULT 'Nigeria'`,

  // 10. free_trial enum value
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'free_trial'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_users_subscription_status')
    ) THEN
      ALTER TYPE enum_users_subscription_status ADD VALUE 'free_trial';
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END $$`,

  // 11. classes: student_count column
  `ALTER TABLE classes ADD COLUMN IF NOT EXISTS student_count INTEGER DEFAULT 0`,
];

async function run() {
  console.log('🔧 Starting AISchoolonair DB schema fixes...\n');
  let ok = 0; let skip = 0;

  for (const sql of migrations) {
    const label = sql.trim().split('\n')[0].substring(0, 70);
    try {
      await pool.query(sql);
      console.log(`  ✅  ${label}`);
      ok++;
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`  ⏭️  ${label} (already exists)`);
        skip++;
      } else {
        console.error(`  ❌  ${label}`);
        console.error(`       ${err.message}`);
      }
    }
  }

  // Verification
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM exam_boards WHERE is_active = true)::int  AS exam_boards,
        (SELECT COUNT(*) FROM subjects WHERE is_active = true)::int      AS subjects,
        (SELECT COUNT(*) FROM resources)::int                            AS resources,
        (SELECT COUNT(*) FROM quiz_attempts)::int                        AS quiz_attempts
    `);
    console.log('\n📊 Database summary after migrations:');
    console.table(rows[0]);
  } catch (e) { /* ignore */ }

  console.log(`\n✅ Done: ${ok} applied, ${skip} skipped.`);
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
