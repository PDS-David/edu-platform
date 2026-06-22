#!/usr/bin/env node
// server/scripts/run_complete_migration.js
// Run inside the API container:
//   docker exec aischool_api node /app/scripts/run_complete_migration.js
//
// Covers every table, column, enum, and seed the app needs.
// Safe to re-run — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.

'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Run a single SQL statement, log result
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

async function run() {
  console.log('\n🔧 AISchoolonair — Complete DB Migration\n');

  // ── ENUMS ─────────────────────────────────────────────────────────────────
  await exec('enum: free_trial subscription status', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='free_trial'
        AND enumtypid=(SELECT oid FROM pg_type WHERE typname='enum_users_subscription_status'))
      THEN ALTER TYPE enum_users_subscription_status ADD VALUE 'free_trial'; END IF;
    EXCEPTION WHEN others THEN NULL; END $$`);

  await exec('enum: teacher role', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
        WHERE t.typname='enum_users_role' AND e.enumlabel='teacher')
      THEN ALTER TYPE enum_users_role ADD VALUE 'teacher'; END IF;
    EXCEPTION WHEN others THEN NULL; END $$`);

  // ── COLUMN PATCHES ────────────────────────────────────────────────────────
  await exec('topics: add title, created_by', `
    ALTER TABLE topics
      ADD COLUMN IF NOT EXISTS title      VARCHAR(255),
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`);
  await exec('topics: backfill title from name', `UPDATE topics SET title=name WHERE title IS NULL`);

  await exec('subtopics: add created_by', `
    ALTER TABLE subtopics ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`);

  // subjects.exam_board_id must be INTEGER (matching exam_boards.id which is SERIAL int).
  // A previous bad migration added it as UUID — detect and correct that here.
  await exec('subjects: ensure exam_board_id is INTEGER (fix if UUID)', `
    DO $$ DECLARE col_type TEXT; BEGIN
      SELECT data_type INTO col_type FROM information_schema.columns
      WHERE table_name='subjects' AND column_name='exam_board_id';
      IF col_type IS NULL THEN
        -- Column missing entirely: add as INTEGER
        ALTER TABLE subjects ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id) ON DELETE SET NULL;
      ELSIF col_type = 'uuid' THEN
        -- Wrongly added as UUID by a previous migration: drop and re-add as INTEGER
        ALTER TABLE subjects DROP COLUMN exam_board_id;
        ALTER TABLE subjects ADD COLUMN exam_board_id INTEGER REFERENCES exam_boards(id) ON DELETE SET NULL;
      END IF;
      -- If col_type is already 'integer', nothing to do.
    EXCEPTION WHEN others THEN NULL; END $$`);

  // After the UUID→INTEGER column fix above, existing subjects that previously had
  // exam_board_id populated may now have exam_board_id = NULL because the column was
  // dropped and re-added. Repopulate using exam_board_code if present on the subject.
  await exec('subjects: backfill exam_board_id from exam_board_code', `
    UPDATE subjects s
    SET    exam_board_id = eb.id
    FROM   exam_boards eb
    WHERE  UPPER(eb.code)        = UPPER(s.exam_board_code)
      AND  s.exam_board_id       IS NULL
      AND  s.exam_board_code     IS NOT NULL
      AND  s.exam_board_code     <> ''`);

  // Second-pass backfill: subjects whose exam_board_code is also NULL
  // (created via POST /catalog/types/:id/subjects which did not write exam_board_code).
  // Assign them to the JAMB exam board — this installation only has JAMB content.
  // Uses a subquery to find the first active exam board with JAMB in the code/name.
  // Safe: only updates rows where exam_board_id IS still NULL after the first pass.
  await exec('subjects: backfill NULL exam_board_id to JAMB board', `
    UPDATE subjects
    SET    exam_board_id = (
      SELECT id FROM exam_boards
      WHERE  is_active = true
        AND  (UPPER(code) LIKE '%JAMB%' OR UPPER(name) LIKE '%JAMB%')
      ORDER BY id
      LIMIT 1
    )
    WHERE  exam_board_id IS NULL
      AND  EXISTS (
        SELECT 1 FROM exam_boards
        WHERE  is_active = true
          AND  (UPPER(code) LIKE '%JAMB%' OR UPPER(name) LIKE '%JAMB%')
      )`);

  // teacher_subjects.exam_board_id is already INTEGER in the live DB — no change needed.
  // Just ensure it exists if somehow missing.
  await exec('teacher_subjects: ensure exam_board_id column exists as INTEGER', `
    ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS exam_board_id INTEGER REFERENCES exam_boards(id) ON DELETE SET NULL`);

  // teacher_subjects: add UNIQUE(teacher_id, subject_id) if not already present
  // Needed for ON CONFLICT upsert in POST /admin/teacher-assignments
  await exec('teacher_subjects: add UNIQUE(teacher_id, subject_id) constraint', `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teacher_subjects_teacher_id_subject_id_key'
          AND conrelid = 'teacher_subjects'::regclass
      ) THEN
        ALTER TABLE teacher_subjects ADD CONSTRAINT teacher_subjects_teacher_id_subject_id_key
          UNIQUE (teacher_id, subject_id);
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$`);

  // past_papers: add columns the code expects
  await exec('past_papers: add exam_board, paper_type, file_size_bytes, created_by', `
    ALTER TABLE past_papers
      ADD COLUMN IF NOT EXISTS exam_board       VARCHAR(100),
      ADD COLUMN IF NOT EXISTS paper_type       VARCHAR(50),
      ADD COLUMN IF NOT EXISTS question_type    VARCHAR(50),
      ADD COLUMN IF NOT EXISTS file_size_bytes  BIGINT,
      ADD COLUMN IF NOT EXISTS created_by       UUID`);

  // student_answers: create if missing (needed by admin platform-stats)
  await exec('student_answers: create table if missing', `
    CREATE TABLE IF NOT EXISTS student_answers (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id  UUID,
      question_id UUID,
      answer      TEXT,
      is_correct  BOOLEAN DEFAULT false,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`);

  // quiz_attempts: ensure all needed columns exist
  await exec('quiz_attempts: add missing columns', `
    ALTER TABLE quiz_attempts
      ADD COLUMN IF NOT EXISTS student_id      UUID,
      ADD COLUMN IF NOT EXISTS quiz_id         UUID,
      ADD COLUMN IF NOT EXISTS score           INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS percentage      NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status          VARCHAR(20) DEFAULT 'completed',
      ADD COLUMN IF NOT EXISTS start_time      TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS end_time        TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW()`);
  await exec('subjects: add icon/color/category/image', `
    ALTER TABLE subjects
      ADD COLUMN IF NOT EXISTS exam_board_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS icon_emoji      VARCHAR(10),
      ADD COLUMN IF NOT EXISTS color           VARCHAR(20),
      ADD COLUMN IF NOT EXISTS category        VARCHAR(50),
      ADD COLUMN IF NOT EXISTS image_url       TEXT`);

  await exec('questions: status/difficulty/type columns', `
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS status               VARCHAR(20)  NOT NULL DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS difficulty           VARCHAR(10)  DEFAULT 'medium',
      ADD COLUMN IF NOT EXISTS question_type        VARCHAR(50)  DEFAULT 'mcq',
      ADD COLUMN IF NOT EXISTS question_sub_type    VARCHAR(50)  DEFAULT 'mcq',
      ADD COLUMN IF NOT EXISTS topic                VARCHAR(255),
      ADD COLUMN IF NOT EXISTS year                 INTEGER,
      ADD COLUMN IF NOT EXISTS source               VARCHAR(100),
      ADD COLUMN IF NOT EXISTS subject_id_uuid      INTEGER      REFERENCES subjects(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS is_ai_generated      BOOLEAN      NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ai_generation_source VARCHAR(100),
      ADD COLUMN IF NOT EXISTS concept_hint         TEXT,
      ADD COLUMN IF NOT EXISTS hints                JSONB,
      ADD COLUMN IF NOT EXISTS exam_board_id        UUID`);

  await exec('questions: indexes', `
    CREATE INDEX IF NOT EXISTS idx_questions_status     ON questions(status);
    CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id_uuid);
    CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty)`);

  await exec('resources: is_staged/push_type/content_kind/mime/size', `
    ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS is_staged         BOOLEAN      DEFAULT false,
      ADD COLUMN IF NOT EXISTS push_type         VARCHAR(50)  DEFAULT 'learning_material',
      ADD COLUMN IF NOT EXISTS content_kind      VARCHAR(32)  DEFAULT 'learning_material',
      ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
      ADD COLUMN IF NOT EXISTS mime_type         VARCHAR(100),
      ADD COLUMN IF NOT EXISTS file_size_bytes   INTEGER`);

  await exec('past_papers: exam_board/question_type', `
    ALTER TABLE past_papers
      ADD COLUMN IF NOT EXISTS exam_board    VARCHAR(100),
      ADD COLUMN IF NOT EXISTS question_type VARCHAR(50)`);

  await exec('exam_boards: is_active/display_order/icon/full_name/country', `
    ALTER TABLE exam_boards
      ADD COLUMN IF NOT EXISTS is_active     BOOLEAN      DEFAULT true,
      ADD COLUMN IF NOT EXISTS display_order INTEGER      DEFAULT 0,
      ADD COLUMN IF NOT EXISTS icon_emoji    VARCHAR(10),
      ADD COLUMN IF NOT EXISTS full_name     VARCHAR(255),
      ADD COLUMN IF NOT EXISTS country       VARCHAR(100) DEFAULT 'Nigeria'`);

  await exec('classes: student_count', `
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS student_count INTEGER DEFAULT 0`);

  await exec('clean duplicate email constraints', `
    DO $$ DECLARE i INTEGER; BEGIN
      FOR i IN 1..69 LOOP
        BEGIN EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key%s', i);
        EXCEPTION WHEN others THEN NULL; END;
      END LOOP;
    END $$`);

  // ── CORE TABLES ───────────────────────────────────────────────────────────
  const tables = [
    ['answer_options', `CREATE TABLE IF NOT EXISTS answer_options (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id INTEGER     NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_text TEXT        NOT NULL,
      is_correct  BOOLEAN     NOT NULL DEFAULT false,
      order_index INTEGER     NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_ao_qid ON answer_options(question_id)`],

    ['subtopic_progress', `CREATE TABLE IF NOT EXISTS subtopic_progress (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subtopic_id    INTEGER     NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
      quiz_completed BOOLEAN     NOT NULL DEFAULT false,
      notes_viewed   BOOLEAN     NOT NULL DEFAULT false,
      video_watched  BOOLEAN     NOT NULL DEFAULT false,
      completed_at   TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, subtopic_id)
    ); CREATE INDEX IF NOT EXISTS idx_sp_sid ON subtopic_progress(student_id)`],

    ['quiz_attempts', `CREATE TABLE IF NOT EXISTS quiz_attempts (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id     UUID,
      student_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score       INTEGER,
      total_marks INTEGER,
      percentage  NUMERIC(5,2),
      start_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_time    TIMESTAMPTZ,
      status      VARCHAR(20) NOT NULL DEFAULT 'completed',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_qa_sid ON quiz_attempts(student_id)`],

    ['student_answers', `CREATE TABLE IF NOT EXISTS student_answers (
      id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id         UUID    NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id        TEXT    NOT NULL,
      selected_option_id TEXT,
      is_correct         BOOLEAN NOT NULL DEFAULT false,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_sa_aid ON student_answers(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_sa_qid ON student_answers(question_id)`],

    ['subtopic_quiz_attempts', `CREATE TABLE IF NOT EXISTS subtopic_quiz_attempts (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subtopic_id   INTEGER     REFERENCES subtopics(id) ON DELETE SET NULL,
      subject_id    INTEGER     REFERENCES subjects(id)  ON DELETE SET NULL,
      exam_board_id UUID,
      paper_type    VARCHAR(50),
      total_score   INTEGER     NOT NULL DEFAULT 0,
      max_score     INTEGER     NOT NULL DEFAULT 0,
      accuracy_pct  NUMERIC(5,2),
      time_taken_ms INTEGER,
      completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_sqa_sid ON subtopic_quiz_attempts(student_id)`],

    ['subtopic_quiz_answers', `CREATE TABLE IF NOT EXISTS subtopic_quiz_answers (
      id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id         UUID    NOT NULL REFERENCES subtopic_quiz_attempts(id) ON DELETE CASCADE,
      question_id        INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option_id UUID    REFERENCES answer_options(id) ON DELETE SET NULL,
      typed_answer       TEXT,
      is_correct         BOOLEAN NOT NULL DEFAULT false,
      marks_awarded      NUMERIC(4,2) NOT NULL DEFAULT 0,
      max_marks          NUMERIC(4,2) NOT NULL DEFAULT 1,
      time_taken_ms      INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_sqans_aid ON subtopic_quiz_answers(attempt_id)`],

    ['concepts', `CREATE TABLE IF NOT EXISTS concepts (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      subtopic_id       INTEGER     NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
      name              VARCHAR(255) NOT NULL,
      description       TEXT,
      difficulty_level  INTEGER     NOT NULL DEFAULT 1 CHECK(difficulty_level BETWEEN 1 AND 5),
      estimated_minutes INTEGER     NOT NULL DEFAULT 10,
      order_index       INTEGER     NOT NULL DEFAULT 0,
      created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_concepts_stid ON concepts(subtopic_id)`],

    ['concept_dependencies', `CREATE TABLE IF NOT EXISTS concept_dependencies (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      child_concept_id  UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      dependency_type   VARCHAR(50) NOT NULL DEFAULT 'prerequisite',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(parent_concept_id, child_concept_id)
    )`],

    ['question_concepts', `CREATE TABLE IF NOT EXISTS question_concepts (
      id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      concept_id  UUID    NOT NULL REFERENCES concepts(id)  ON DELETE CASCADE,
      weight      NUMERIC(3,2) NOT NULL DEFAULT 1.0,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE(question_id, concept_id)
    )`],

    ['student_concept_mastery', `CREATE TABLE IF NOT EXISTS student_concept_mastery (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id    UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      concept_id    UUID         NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      mastery_score NUMERIC(5,4) NOT NULL DEFAULT 0.5,
      attempts      INTEGER      NOT NULL DEFAULT 0,
      correct       INTEGER      NOT NULL DEFAULT 0,
      last_practiced TIMESTAMPTZ,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, concept_id)
    )`],

    ['user_badges', `CREATE TABLE IF NOT EXISTS user_badges (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_code VARCHAR(50) NOT NULL,
      earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, badge_code)
    ); CREATE INDEX IF NOT EXISTS idx_ub_uid ON user_badges(user_id)`],

    ['notifications', `CREATE TABLE IF NOT EXISTS notifications (
      id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      VARCHAR(255) NOT NULL,
      message    TEXT,
      type       VARCHAR(50)  NOT NULL DEFAULT 'info',
      is_read    BOOLEAN      NOT NULL DEFAULT false,
      action_url VARCHAR(500),
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notif_uid ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(user_id, is_read)`],

    ['ai_chat_sessions', `CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id  UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id  INTEGER REFERENCES subjects(id)       ON DELETE SET NULL,
      subtopic_id INTEGER REFERENCES subtopics(id)      ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_acs_sid ON ai_chat_sessions(student_id)`],

    ['ai_chat_messages', `CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID        NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
      role       VARCHAR(20) NOT NULL CHECK(role IN ('user','assistant','system')),
      content    TEXT        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_acm_sesid ON ai_chat_messages(session_id)`],

    ['ai_explanation_cache', `CREATE TABLE IF NOT EXISTS ai_explanation_cache (
      id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      topic_id               INTEGER REFERENCES topics(id)    ON DELETE SET NULL,
      subtopic_id            INTEGER REFERENCES subtopics(id) ON DELETE SET NULL,
      original_explanation   TEXT,
      simplified_explanation TEXT,
      key_points             JSONB,
      source_question_count  INTEGER NOT NULL DEFAULT 0,
      model_used             VARCHAR(100),
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],

    ['user_learning_profile', `CREATE TABLE IF NOT EXISTS user_learning_profile (
      id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id             UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      overall_accuracy_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
      total_questions_done   INTEGER      NOT NULL DEFAULT 0,
      total_quiz_attempts    INTEGER      NOT NULL DEFAULT 0,
      total_subtopic_quizzes INTEGER      NOT NULL DEFAULT 0,
      study_streak_days      INTEGER      NOT NULL DEFAULT 0,
      xp_points              INTEGER      NOT NULL DEFAULT 0,
      accuracy_trend         VARCHAR(20)  DEFAULT 'stable',
      active_gap_count       INTEGER      NOT NULL DEFAULT 0,
      critical_gap_count     INTEGER      NOT NULL DEFAULT 0,
      last_activity_at       TIMESTAMPTZ,
      profile_updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`],

    ['learning_gaps', `CREATE TABLE IF NOT EXISTS learning_gaps (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id          INTEGER     REFERENCES subjects(id) ON DELETE SET NULL,
      topic_name          TEXT        NOT NULL,
      topic_id            INTEGER,
      gap_severity        NUMERIC(4,2),
      accuracy_in_topic   NUMERIC(4,2),
      questions_attempted INTEGER     DEFAULT 0,
      questions_failed    INTEGER     DEFAULT 0,
      last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, topic_name)
    ); CREATE INDEX IF NOT EXISTS idx_lg_sid ON learning_gaps(student_id)`],

    ['user_weak_topics', `CREATE TABLE IF NOT EXISTS user_weak_topics (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id        INTEGER      REFERENCES subjects(id)        ON DELETE SET NULL,
      topic_name        VARCHAR(255) NOT NULL,
      subtopic_id       INTEGER      REFERENCES subtopics(id)       ON DELETE SET NULL,
      accuracy_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
      attempts_count    INTEGER      NOT NULL DEFAULT 0,
      last_attempted_at TIMESTAMPTZ,
      severity          VARCHAR(20)  NOT NULL DEFAULT 'moderate',
      learning_gap_id   UUID,
      refreshed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_uwt_sid ON user_weak_topics(student_id)`],

    ['courses', `CREATE TABLE IF NOT EXISTS courses (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_id       INTEGER      NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      teacher_id       UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      exam_board_id    UUID,
      title            VARCHAR(255) NOT NULL,
      description      TEXT,
      difficulty_level VARCHAR(20)  DEFAULT 'intermediate',
      is_published     BOOLEAN      NOT NULL DEFAULT false,
      start_date       DATE,
      end_date         DATE,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_courses_subj ON courses(subject_id);
    CREATE INDEX IF NOT EXISTS idx_courses_tchr ON courses(teacher_id)`],

    ['enrollments', `CREATE TABLE IF NOT EXISTS enrollments (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id          UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      course_id           UUID        NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
      enrollment_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
      status              VARCHAR(20)  NOT NULL DEFAULT 'active',
      UNIQUE(student_id, course_id)
    ); CREATE INDEX IF NOT EXISTS idx_enroll_sid ON enrollments(student_id)`],

    ['videos', `CREATE TABLE IF NOT EXISTS videos (
      id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id              UUID         REFERENCES courses(id) ON DELETE SET NULL,
      topic_id               INTEGER      REFERENCES topics(id)  ON DELETE SET NULL,
      title                  VARCHAR(255) NOT NULL,
      description            TEXT,
      original_filename      VARCHAR(255),
      encrypted_playlist_url TEXT,
      encryption_key_id      UUID,
      upload_status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
      duration_seconds       INTEGER,
      is_free                BOOLEAN      NOT NULL DEFAULT false,
      required_tier          VARCHAR(50)  NOT NULL DEFAULT 'active',
      created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_videos_cid ON videos(course_id)`],

    ['revision_notes', `CREATE TABLE IF NOT EXISTS revision_notes (
      id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      subtopic_id INTEGER NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
      title       VARCHAR(255) NOT NULL,
      content_html TEXT,
      created_by  UUID    REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_rn_stid ON revision_notes(subtopic_id)`],

    ['video_progress', `CREATE TABLE IF NOT EXISTS video_progress (
      id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id               UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      video_id                 UUID        NOT NULL REFERENCES videos(id)  ON DELETE CASCADE,
      current_position_seconds INTEGER     NOT NULL DEFAULT 0,
      total_watched_seconds    INTEGER     NOT NULL DEFAULT 0,
      watch_percentage         NUMERIC(5,2) NOT NULL DEFAULT 0,
      is_completed             BOOLEAN     NOT NULL DEFAULT false,
      completed_at             TIMESTAMPTZ,
      last_watched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, video_id)
    ); CREATE INDEX IF NOT EXISTS idx_vp_sid ON video_progress(student_id)`],

    ['study_plans', `CREATE TABLE IF NOT EXISTS study_plans (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      start_date     DATE,
      end_date       DATE,
      topics_per_day INTEGER     NOT NULL DEFAULT 2,
      skip_weekends  BOOLEAN     NOT NULL DEFAULT false,
      plan_json      JSONB,
      summary_json   JSONB
    ); CREATE INDEX IF NOT EXISTS idx_sp_uid ON study_plans(user_id)`],

    ['student_analytics', `CREATE TABLE IF NOT EXISTS student_analytics (
      id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id         UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      total_attempts     INTEGER      NOT NULL DEFAULT 0,
      correct_attempts   INTEGER      NOT NULL DEFAULT 0,
      accuracy_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
      total_time_seconds INTEGER      NOT NULL DEFAULT 0,
      last_active        TIMESTAMPTZ,
      updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`],

    ['ai_question_logs', `CREATE TABLE IF NOT EXISTS ai_question_logs (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id  INTEGER     REFERENCES questions(id) ON DELETE SET NULL,
      generated_by UUID        REFERENCES users(id)     ON DELETE SET NULL,
      model_used   VARCHAR(100),
      prompt_used  TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],

    ['classes', `CREATE TABLE IF NOT EXISTS classes (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      teacher_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(255) NOT NULL,
      join_code     VARCHAR(20)  NOT NULL UNIQUE,
      subject_ids   JSONB        NOT NULL DEFAULT '[]',
      student_count INTEGER      DEFAULT 0,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_cls_tid ON classes(teacher_id)`],

    ['class_memberships', `CREATE TABLE IF NOT EXISTS class_memberships (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id   UUID        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cm_cid ON class_memberships(class_id);
    CREATE INDEX IF NOT EXISTS idx_cm_sid ON class_memberships(student_id)`],

    ['custom_tests', `CREATE TABLE IF NOT EXISTS custom_tests (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      teacher_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id       INTEGER      REFERENCES subjects(id) ON DELETE SET NULL,
      title            VARCHAR(255) NOT NULL,
      duration_minutes INTEGER      NOT NULL DEFAULT 30,
      total_marks      INTEGER      NOT NULL DEFAULT 10,
      passing_marks    INTEGER      NOT NULL DEFAULT 5,
      is_published     BOOLEAN      NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_ct_tid ON custom_tests(teacher_id)`],

    ['test_questions', `CREATE TABLE IF NOT EXISTS test_questions (
      id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      test_id         UUID    NOT NULL REFERENCES custom_tests(id) ON DELETE CASCADE,
      question_id     INTEGER NOT NULL REFERENCES questions(id)    ON DELETE CASCADE,
      question_order  INTEGER NOT NULL DEFAULT 0,
      marks_allocated INTEGER NOT NULL DEFAULT 1,
      UNIQUE(test_id, question_id)
    ); CREATE INDEX IF NOT EXISTS idx_tq_tid ON test_questions(test_id)`],

    ['test_assignments', `CREATE TABLE IF NOT EXISTS test_assignments (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      test_id     UUID        NOT NULL REFERENCES custom_tests(id) ON DELETE CASCADE,
      student_id  UUID        NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
      class_id    UUID,
      due_date    TIMESTAMPTZ,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(test_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ta_tid ON test_assignments(test_id);
    CREATE INDEX IF NOT EXISTS idx_ta_sid ON test_assignments(student_id);
    ALTER TABLE test_assignments
      ADD COLUMN IF NOT EXISTS score         INTEGER,
      ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS total_time_ms BIGINT`],

    ['student_subjects', `CREATE TABLE IF NOT EXISTS student_subjects (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      subject_id INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      is_active  BOOLEAN     NOT NULL DEFAULT true,
      added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, subject_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ss_sid ON student_subjects(student_id);
    ALTER TABLE student_subjects
      ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS enrollment_source TEXT NOT NULL DEFAULT 'explicit'`],

    ['class_subjects', `CREATE TABLE IF NOT EXISTS class_subjects (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id    UUID        NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
      subject_id  INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, subject_id)
    ); CREATE INDEX IF NOT EXISTS idx_csub_cid ON class_subjects(class_id)`],

    ['teacher_subjects', `CREATE TABLE IF NOT EXISTS teacher_subjects (
      id            SERIAL      PRIMARY KEY,
      teacher_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      subject_id    INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      exam_board_id UUID,
      assigned_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
      is_active     BOOLEAN     NOT NULL DEFAULT true,
      assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(teacher_id, subject_id)
    ); CREATE INDEX IF NOT EXISTS idx_ts_tid ON teacher_subjects(teacher_id)`],

    ['subscription_plans', `CREATE TABLE IF NOT EXISTS subscription_plans (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_code        VARCHAR(50)  NOT NULL UNIQUE,
      plan_name        VARCHAR(100) NOT NULL,
      price_monthly    INTEGER,
      price_yearly     INTEGER,
      currency         VARCHAR(10)  NOT NULL DEFAULT 'NGN',
      has_analytics    BOOLEAN      NOT NULL DEFAULT true,
      has_video_access BOOLEAN      NOT NULL DEFAULT true,
      has_test_builder BOOLEAN      NOT NULL DEFAULT true,
      is_active        BOOLEAN      NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`],

    ['subscription_plans seed', `
      INSERT INTO subscription_plans (plan_code, plan_name, price_monthly, price_yearly, currency, has_analytics, has_video_access, has_test_builder, is_active)
      VALUES
        ('FREE_TRIAL',      'Free Trial',      NULL,   NULL,   'NGN', true, true, false, true),
        ('STUDENT_MONTHLY', 'Student Monthly', 200000, NULL,   'NGN', true, true, true,  true),
        ('STUDENT_YEARLY',  'Student Annual',  NULL,   600000, 'NGN', true, true, true,  true)
      ON CONFLICT (plan_code) DO NOTHING`],

    ['payment_transactions', `CREATE TABLE IF NOT EXISTS payment_transactions (
      id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      transaction_reference VARCHAR(100) NOT NULL UNIQUE,
      paystack_reference    VARCHAR(100),
      payment_gateway       VARCHAR(50)  NOT NULL DEFAULT 'paystack',
      amount                INTEGER      NOT NULL,
      currency              VARCHAR(10)  NOT NULL DEFAULT 'NGN',
      status                VARCHAR(20)  NOT NULL DEFAULT 'pending',
      metadata              JSONB,
      created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pt_uid ON payment_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_pt_ref ON payment_transactions(transaction_reference)`],

    ['user_subscriptions', `CREATE TABLE IF NOT EXISTS user_subscriptions (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID        NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
      plan_id           UUID        NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
      start_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date          TIMESTAMPTZ NOT NULL,
      status            VARCHAR(20) NOT NULL DEFAULT 'active',
      payment_reference VARCHAR(100),
      amount_paid       INTEGER,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_us_uid ON user_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_us_status ON user_subscriptions(status)`],

    ['resource_assignments', `CREATE TABLE IF NOT EXISTS resource_assignments (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_id UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
      student_id  UUID        REFERENCES users(id) ON DELETE CASCADE,
      class_id    UUID,
      push_type   VARCHAR(50) DEFAULT 'learning_material',
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ra_rid ON resource_assignments(resource_id);
    CREATE INDEX IF NOT EXISTS idx_ra_sid ON resource_assignments(student_id)`],

    ['resource_user_assignments', `CREATE TABLE IF NOT EXISTS resource_user_assignments (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_id UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
      push_type   VARCHAR(50) DEFAULT 'learning_material',
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_rua_resource_user UNIQUE (resource_id, user_id, push_type)
    );
    CREATE INDEX IF NOT EXISTS idx_rua_uid ON resource_user_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_rua_rid ON resource_user_assignments(resource_id)`],

    ['student_exam_types (UUID)', `
      DO $$ DECLARE col_type TEXT; BEGIN
        SELECT data_type INTO col_type FROM information_schema.columns
        WHERE table_name='student_exam_types' AND column_name='exam_board_id';
        IF col_type IS NULL THEN
          -- Table doesn't exist: create fresh with INTEGER
          CREATE TABLE IF NOT EXISTS student_exam_types (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            exam_board_id   INTEGER     NOT NULL REFERENCES exam_boards(id) ON DELETE CASCADE,
            subscription_id UUID,
            status          TEXT        NOT NULL DEFAULT 'approved',
            granted_at      TIMESTAMPTZ DEFAULT NOW(),
            expires_at      TIMESTAMPTZ,
            is_active       BOOLEAN     DEFAULT true,
            UNIQUE(student_id, exam_board_id)
          );
        ELSIF col_type = 'uuid' THEN
          -- Wrong type: drop and recreate with INTEGER
          -- (existing data is unusable anyway — UUID values were never valid exam_board IDs)
          DROP TABLE IF EXISTS student_exam_types CASCADE;
          CREATE TABLE student_exam_types (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            exam_board_id   INTEGER     NOT NULL REFERENCES exam_boards(id) ON DELETE CASCADE,
            subscription_id UUID,
            status          TEXT        NOT NULL DEFAULT 'approved',
            granted_at      TIMESTAMPTZ DEFAULT NOW(),
            expires_at      TIMESTAMPTZ,
            is_active       BOOLEAN     DEFAULT true,
            UNIQUE(student_id, exam_board_id)
          );
        END IF;
        -- If already integer, nothing to do
      EXCEPTION WHEN others THEN NULL; END $$;
      CREATE INDEX IF NOT EXISTS idx_set_sid ON student_exam_types(student_id);
      CREATE INDEX IF NOT EXISTS idx_set_bid ON student_exam_types(exam_board_id)`],

    ['exam_boards unique code constraint', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='exam_boards_code_unique')
        THEN ALTER TABLE exam_boards ADD CONSTRAINT exam_boards_code_unique UNIQUE(code); END IF;
      EXCEPTION WHEN others THEN NULL; END $$`],

    ['users: onboarding + study preference columns', `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS onboarding_complete   BOOLEAN      DEFAULT false,
        ADD COLUMN IF NOT EXISTS daily_goal            INTEGER      DEFAULT 50,
        ADD COLUMN IF NOT EXISTS preferred_study_days  JSONB        DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS preferred_study_time  VARCHAR(20)  DEFAULT 'evening',
        ADD COLUMN IF NOT EXISTS xp_points             INTEGER      DEFAULT 0,
        ADD COLUMN IF NOT EXISTS study_streak_days     INTEGER      DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_activity_date    DATE,
        ADD COLUMN IF NOT EXISTS last_login            TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS avatar_url            TEXT,
        ADD COLUMN IF NOT EXISTS phone                 VARCHAR(30),
        ADD COLUMN IF NOT EXISTS country               VARCHAR(100),
        ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS subscription_status   VARCHAR(20)  DEFAULT 'free_trial'`],

    ['expire stale free trials', `
      UPDATE users SET subscription_status='expired', updated_at=NOW()
      WHERE subscription_status='free_trial'
        AND subscription_expires_at IS NOT NULL
        AND subscription_expires_at < NOW()`],

    // ── FORENSIC AUDIT FIXES ─────────────────────────────────────────────────

    // C-1: practice_attempts — core analytics table, may never have been created
    ['practice_attempts (C-1: core analytics table)', `CREATE TABLE IF NOT EXISTS practice_attempts (
      id                 SERIAL      PRIMARY KEY,
      student_id         UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
      question_id        INTEGER     NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      is_correct         BOOLEAN,
      answer_given       TEXT,
      time_taken_seconds INTEGER     NOT NULL DEFAULT 0,
      attempted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pa_student_id   ON practice_attempts(student_id);
    CREATE INDEX IF NOT EXISTS idx_pa_question_id  ON practice_attempts(question_id);
    CREATE INDEX IF NOT EXISTS idx_pa_student_date ON practice_attempts(student_id, attempted_at DESC)`],

    // C-1b: add selected_option_text to practice_attempts (stores what student chose)
    ['practice_attempts: add selected_option_text', `
      ALTER TABLE practice_attempts
        ADD COLUMN IF NOT EXISTS selected_option_text TEXT`],

    // C-2: subtopic_progress column divergence between model and migration
    ['subtopic_progress: ensure all 5 task columns exist (C-2)', `
      ALTER TABLE subtopic_progress
        ADD COLUMN IF NOT EXISTS resources_completed BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS practice_completed  BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS notes_viewed        BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS video_watched       BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_accessed       TIMESTAMPTZ`],

    // C-3: resource_assignments CHECK constraint missing from migration path
    ['resource_assignments: add target CHECK constraint (C-3)', `
      DO $$ BEGIN
        ALTER TABLE resource_assignments
          ADD CONSTRAINT ra_target_check
          CHECK (student_id IS NOT NULL OR class_id IS NOT NULL);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`],

    // H-1: Remove permanently-NULL FK to unpopulated answer_options table
    ['student_answers: drop broken answer_options FK (H-1)', `
      ALTER TABLE student_answers
        DROP CONSTRAINT IF EXISTS student_answers_selected_option_id_fkey`],
    ['subtopic_quiz_answers: drop broken answer_options FK (H-1)', `
      ALTER TABLE subtopic_quiz_answers
        DROP CONSTRAINT IF EXISTS subtopic_quiz_answers_selected_option_id_fkey`],

    // H-2: Missing indexes on core FK columns (every subject/topic/question query)
    ['core table FK indexes (H-2)', `
      CREATE INDEX IF NOT EXISTS idx_topics_subject_id      ON topics(subject_id);
      CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id     ON subtopics(topic_id);
      CREATE INDEX IF NOT EXISTS idx_subtopics_subject_id   ON subtopics(subject_id);
      CREATE INDEX IF NOT EXISTS idx_questions_subtopic_id  ON questions(subtopic_id);
      CREATE INDEX IF NOT EXISTS idx_past_papers_subject_id ON past_papers(subject_id);
      CREATE INDEX IF NOT EXISTS idx_pa_student_question    ON practice_attempts(student_id, question_id)`],

    // H-5: test_assignments missing class_id column
    ['test_assignments: add class_id column (H-5)', `
      ALTER TABLE test_assignments
        ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_ta_class_id ON test_assignments(class_id)`],

    // M-2: idx_questions_subject_id indexes unused column — replace with useful one
    ['questions: replace unused subject_id_uuid index with subtopic_id index (M-2)', `
      DROP INDEX IF EXISTS idx_questions_subject_id;
      CREATE INDEX IF NOT EXISTS idx_questions_subtopic_id ON questions(subtopic_id)`],

    // M-3: Performance indexes for analytics queries
    ['subtopic_quiz_attempts: analytics performance indexes (M-3)', `
      CREATE INDEX IF NOT EXISTS idx_sqa_exam_board   ON subtopic_quiz_attempts(exam_board_id)
        WHERE exam_board_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_sqa_completed_at ON subtopic_quiz_attempts(student_id, completed_at DESC)`],

    // M-4: Notifications unread query performance
    ['notifications: partial index for unread count queries (M-4)', `
      CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read)
        WHERE is_read = false`],

    // M-6: Consistent indexes on dual resource assignment tables
    ['resource_assignments: consistent assignment lookup indexes (M-6)', `
      CREATE INDEX IF NOT EXISTS idx_ra_student_resource ON resource_assignments(student_id, resource_id)
        WHERE student_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_rua_user_resource   ON resource_user_assignments(user_id, resource_id)`],

    // M-7: Backfill assigned_by on live DBs created before the column was added
    ['resource_assignments: add assigned_by column if missing (M-7)', `
      ALTER TABLE resource_assignments
        ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id)`],
    ['resource_user_assignments: add assigned_by column if missing (M-7)', `
      ALTER TABLE resource_user_assignments
        ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id)`],
  ];

  for (const [label, sql] of tables) {
    await exec(label, sql);
  }

  // ── MIGRATION 005: Enrollment lifecycle ───────────────────────────────────
  await exec('enrollments: add lifecycle columns (expires_at, suspended_at, suspended_reason, cancelled_at, user_id)', `
    ALTER TABLE enrollments
      ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS suspended_reason  TEXT,
      ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS user_id           UUID REFERENCES users(id)`);

  await exec('enrollments: widen status from ENUM to TEXT (if still enum)', `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'enrollments'
           AND column_name  = 'status'
           AND data_type    = 'USER-DEFINED'
      ) THEN
        ALTER TABLE enrollments ALTER COLUMN status TYPE TEXT USING status::TEXT;
      END IF;
    END $$`);

  await exec('enrollments: backfill completed → expired', `
    UPDATE enrollments SET status = 'expired' WHERE status = 'completed'`);

  await exec('enrollments: set status default active', `
    ALTER TABLE enrollments ALTER COLUMN status SET DEFAULT 'active'`);

  await exec('enrollments: set status NOT NULL', `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'enrollments'
           AND column_name  = 'status'
           AND is_nullable  = 'YES'
      ) THEN
        UPDATE enrollments SET status = 'active' WHERE status IS NULL;
        ALTER TABLE enrollments ALTER COLUMN status SET NOT NULL;
      END IF;
    END $$`);

  await exec('enrollments: add CHECK constraint on status', `
    DO $$
    BEGIN
      ALTER TABLE enrollments
        ADD CONSTRAINT chk_enrollment_status
        CHECK (status IN ('pending','active','expired','cancelled','suspended'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);

  await exec('enrollments: lifecycle indexes', `
    CREATE INDEX IF NOT EXISTS idx_enrollments_student_id     ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course_id      ON enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_status         ON enrollments(status);
    CREATE INDEX IF NOT EXISTS idx_enrollments_student_course ON enrollments(student_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_user_id        ON enrollments(user_id) WHERE user_id IS NOT NULL`);

  await exec('enrollment_audit_log table', `
    CREATE TABLE IF NOT EXISTS enrollment_audit_log (
      id            BIGSERIAL   PRIMARY KEY,
      enrollment_id UUID        REFERENCES enrollments(id) ON DELETE SET NULL,
      student_id    UUID        REFERENCES users(id)        ON DELETE SET NULL,
      course_id     UUID,
      actor_id      UUID        REFERENCES users(id)        ON DELETE SET NULL,
      event         VARCHAR(60) NOT NULL,
      from_status   VARCHAR(20),
      to_status     VARCHAR(20),
      reason        TEXT,
      ip            VARCHAR(45),
      user_agent    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await exec('enrollment_audit_log: indexes', `
    CREATE INDEX IF NOT EXISTS idx_eal_enrollment_id ON enrollment_audit_log(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_eal_student_id    ON enrollment_audit_log(student_id);
    CREATE INDEX IF NOT EXISTS idx_eal_created_at    ON enrollment_audit_log(created_at DESC)`);

  // ── AUTH HARDENING (AUTH-001 → AUTH-006) ─────────────────────────────────
  // migration_auth_hardening.sql — was orphaned (never referenced by this runner).
  // Adds the three schema objects the auth stack requires to function:
  //   1. users.failed_login_count + users.locked_until  (AUTH-001 lockout)
  //   2. auth_tokens table                              (AUTH-002-005 token registry)
  //   3. auth_audit_log table                           (AUTH-006 audit trail)
  // Every statement is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

  console.log('\n🔐 Auth Hardening Schema (AUTH-001 → AUTH-006)\n');

  await exec('users: add failed_login_count + locked_until (AUTH-001)', `
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS failed_login_count INTEGER     NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ`);

  await exec('auth_tokens table (AUTH-002 / 003 / 004 / 005)', `
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      jti                VARCHAR(64) NOT NULL UNIQUE,
      refresh_token      VARCHAR(64) UNIQUE,
      remember_me        BOOLEAN     NOT NULL DEFAULT FALSE,
      device_hint        VARCHAR(255),
      ip_address         INET,
      user_agent         TEXT,
      issued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at         TIMESTAMPTZ NOT NULL,
      refresh_expires_at TIMESTAMPTZ,
      last_used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked            BOOLEAN     NOT NULL DEFAULT FALSE,
      revoked_at         TIMESTAMPTZ,
      revoked_reason     VARCHAR(64)
    )`);

  await exec('auth_tokens: indexes', `
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_jti     ON auth_tokens(jti);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_refresh ON auth_tokens(refresh_token)
      WHERE refresh_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_revoked ON auth_tokens(revoked, expires_at)`);

  await exec('auth_audit_log table (AUTH-006)', `
    CREATE TABLE IF NOT EXISTS auth_audit_log (
      id          BIGSERIAL    PRIMARY KEY,
      event_type  VARCHAR(64)  NOT NULL,
      user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
      email       VARCHAR(255),
      ip_address  INET,
      user_agent  TEXT,
      metadata    JSONB        NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`);

  await exec('auth_audit_log: indexes', `
    CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id    ON auth_audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_event_type ON auth_audit_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at DESC)`);

  // ── SECURITY HARDENING (migration_005_security.sql) ───────────────────────
  // audit_logs, tamper-resistance trigger, soft-delete columns, last-admin
  // guard trigger — was also orphaned. All statements are idempotent.

  console.log('\n🛡️  Security Hardening Schema (migration_005_security)\n');

  await exec('audit_logs table', `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
      actor_email  TEXT,
      actor_role   TEXT,
      action       TEXT         NOT NULL,
      target_type  TEXT,
      target_id    TEXT,
      target_email TEXT,
      metadata     JSONB        NOT NULL DEFAULT '{}',
      ip_address   INET,
      user_agent   TEXT,
      severity     TEXT         NOT NULL DEFAULT 'info'
                                CHECK (severity IN ('info','warning','critical')),
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`);

  await exec('audit_logs: indexes', `
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id   ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id   ON audit_logs(target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_severity    ON audit_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_security_events ON audit_logs(created_at DESC)
      WHERE severity IN ('warning','critical')`);

  await exec('audit_logs: tamper-resistance trigger', `
    CREATE OR REPLACE FUNCTION audit_logs_immutable()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs is immutable — UPDATE and DELETE are forbidden';
    END;
    $$`);

  await exec('audit_logs: attach immutability trigger', `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_audit_logs_immutable'
          AND tgrelid = 'audit_logs'::regclass
      ) THEN
        CREATE TRIGGER trg_audit_logs_immutable
          BEFORE UPDATE OR DELETE ON audit_logs
          FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$`);

  await exec('users: soft-delete columns (deleted_at, deleted_by, delete_reason)', `
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deleted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS delete_reason TEXT`);

  await exec('users: partial index for active-user lookups', `
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)
      WHERE deleted_at IS NULL`);

  await exec('users: last-admin guard function', `
    CREATE OR REPLACE FUNCTION guard_last_admin()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      active_admin_count INTEGER;
    BEGIN
      IF OLD.role = 'admin' THEN
        SELECT COUNT(*) INTO active_admin_count
        FROM users
        WHERE role       = 'admin'
          AND is_active  = true
          AND deleted_at IS NULL
          AND id        != OLD.id;

        IF active_admin_count = 0 THEN
          IF NEW.role != 'admin' THEN
            RAISE EXCEPTION 'LAST_ADMIN_PROTECTION: Cannot demote the last active admin';
          END IF;
          IF NEW.is_active = false THEN
            RAISE EXCEPTION 'LAST_ADMIN_PROTECTION: Cannot deactivate the last active admin';
          END IF;
          IF NEW.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'LAST_ADMIN_PROTECTION: Cannot delete the last active admin';
          END IF;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$`);

  await exec('users: attach last-admin guard trigger', `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_guard_last_admin'
          AND tgrelid = 'users'::regclass
      ) THEN
        CREATE TRIGGER trg_guard_last_admin
          BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION guard_last_admin();
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$`);

  // ── VERIFICATION ──────────────────────────────────────────────────────────
  console.log('\n📊 Verification:\n');
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM exam_boards WHERE is_active=true)::int  AS exam_boards,
        (SELECT COUNT(*) FROM subjects WHERE is_active=true)::int      AS subjects,
        (SELECT COUNT(*) FROM questions)::int                          AS questions,
        (SELECT COUNT(*) FROM answer_options)::int                     AS answer_options,
        (SELECT COUNT(*) FROM users)::int                              AS users,
        (SELECT COUNT(*) FROM resources)::int                          AS resources,
        (SELECT COUNT(*) FROM subscription_plans)::int                 AS subscription_plans,
        (SELECT COUNT(*) FROM notifications)::int                      AS notifications,
        (SELECT COUNT(*) FROM practice_attempts)::int                  AS practice_attempts,
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name='subtopic_progress'
            AND column_name IN ('resources_completed','practice_completed','notes_viewed','video_watched')
        )::int                                                         AS subtopic_progress_cols,
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name='test_assignments' AND column_name='class_id')::int AS test_assignments_class_id,
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename='topics'
          AND indexname='idx_topics_subject_id')::int                  AS idx_topics_subject_id,
        -- Auth hardening checks
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name='users'
            AND column_name IN ('failed_login_count','locked_until')
        )::int                                                         AS users_lockout_cols,
        (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_name='auth_tokens')::int                         AS auth_tokens_table,
        (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_name='auth_audit_log')::int                      AS auth_audit_log_table,
        -- Security hardening checks
        (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_name='audit_logs')::int                          AS audit_logs_table,
        (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name='users'
            AND column_name IN ('deleted_at','deleted_by','delete_reason')
        )::int                                                         AS users_softdelete_cols,
        (SELECT COUNT(*) FROM pg_trigger
          WHERE tgname = 'trg_guard_last_admin')::int                  AS last_admin_trigger,
        (SELECT COUNT(*) FROM pg_trigger
          WHERE tgname = 'trg_audit_logs_immutable')::int              AS audit_immutability_trigger
    `);
    console.table(rows[0]);
    const r = rows[0];

    // Original checks
    if (r.practice_attempts !== undefined)       console.log('  ✅  practice_attempts table exists');
    else                                         console.log('  ❌  practice_attempts table MISSING');
    if (parseInt(r.subtopic_progress_cols) >= 4) console.log('  ✅  subtopic_progress all 4 task columns present');
    else                                         console.log(`  ⚠️   subtopic_progress only ${r.subtopic_progress_cols}/4 task columns`);
    if (parseInt(r.test_assignments_class_id) === 1) console.log('  ✅  test_assignments.class_id exists');
    else                                             console.log('  ❌  test_assignments.class_id MISSING');
    if (parseInt(r.idx_topics_subject_id) === 1) console.log('  ✅  Core FK indexes present');
    else                                          console.log('  ⚠️   Core FK indexes may be missing');

    // Auth hardening checks
    if (parseInt(r.users_lockout_cols) === 2)    console.log('  ✅  users: failed_login_count + locked_until present (AUTH-001)');
    else                                         console.log('  ❌  users: lockout columns MISSING — login will 500');
    if (parseInt(r.auth_tokens_table) === 1)     console.log('  ✅  auth_tokens table present (AUTH-002-005)');
    else                                         console.log('  ❌  auth_tokens table MISSING — successful login will 500');
    if (parseInt(r.auth_audit_log_table) === 1)  console.log('  ✅  auth_audit_log table present (AUTH-006)');
    else                                         console.log('  ⚠️   auth_audit_log table MISSING — auth events will not be logged');

    // Security hardening checks
    if (parseInt(r.audit_logs_table) === 1)      console.log('  ✅  audit_logs table present');
    else                                         console.log('  ❌  audit_logs table MISSING');
    if (parseInt(r.users_softdelete_cols) === 3) console.log('  ✅  users: soft-delete columns present');
    else                                         console.log(`  ⚠️   users: only ${r.users_softdelete_cols}/3 soft-delete columns`);
    if (parseInt(r.last_admin_trigger) === 1)    console.log('  ✅  last-admin guard trigger active');
    else                                         console.log('  ❌  last-admin guard trigger MISSING — no protection against admin lockout');
    if (parseInt(r.audit_immutability_trigger) === 1) console.log('  ✅  audit_logs immutability trigger active');
    else                                              console.log('  ⚠️   audit_logs immutability trigger MISSING');
  } catch (e) {
    console.log('  (verification query failed:', e.message, ')');
  }

  // Approve legacy AI-generated questions with NULL status — these were
  // generated before the status column was introduced. Non-AI questions
  // (teacher-submitted, bulk-imported) do not require approval.
  await exec('questions: approve legacy NULL-status AI-generated entries',
    `UPDATE questions SET status = 'approved', updated_at = NOW()
      WHERE status IS NULL AND is_active = true AND COALESCE(is_ai_generated, false) = true`
  );

  // Ensure Platform Admin user has role='admin' — the seed in
  // migrate_roles_and_curricula.sql may not have run on the live DB,
  // leaving the account with the default 'student' role from registration,
  // which causes 403 on all /api/admin/* endpoints.
  await exec('Platform Admin: ensure role=admin',
    `UPDATE users SET role = 'admin', updated_at = NOW()
      WHERE email = 'admin@aischoolonair.com'
        AND role != 'admin'`
  );

  console.log('\n✅ Migration complete.\n');
  await pool.end();

  // ── migration_006: subtopic_progress missing columns (2026-06-21) ──────────
  // resources_completed and practice_completed were referenced by the service
  // and many analytics queries but were never added to the original schema.
  // completion_pct added for efficient progress-bar queries.
  await exec('subtopic_progress: add resources_completed, practice_completed, completion_pct',
    `ALTER TABLE subtopic_progress
       ADD COLUMN IF NOT EXISTS resources_completed BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS practice_completed  BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS completion_pct      SMALLINT NOT NULL DEFAULT 0
         CHECK (completion_pct BETWEEN 0 AND 100)`
  );

  // Recompute completion_pct for existing rows that now have the column
  await exec('subtopic_progress: backfill completion_pct',
    `UPDATE subtopic_progress
     SET completion_pct = (
       (CASE WHEN resources_completed THEN 33 ELSE 0 END) +
       (CASE WHEN practice_completed  THEN 33 ELSE 0 END) +
       (CASE WHEN quiz_completed      THEN 34 ELSE 0 END)
     )
     WHERE completion_pct = 0
       AND (quiz_completed = true)`
  );

  console.log('\n✅ Migration complete.\n');
  await pool.end();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
