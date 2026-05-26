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

  await exec('subjects: add exam_board_id UUID', `
    ALTER TABLE subjects ADD COLUMN IF NOT EXISTS exam_board_id UUID REFERENCES exam_boards(id) ON DELETE SET NULL`);
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
      question_id        INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option_id UUID    REFERENCES answer_options(id) ON DELETE SET NULL,
      is_correct         BOOLEAN NOT NULL DEFAULT false,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); CREATE INDEX IF NOT EXISTS idx_sa_aid ON student_answers(attempt_id)`],

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
      due_date    TIMESTAMPTZ,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(test_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ta_tid ON test_assignments(test_id);
    CREATE INDEX IF NOT EXISTS idx_ta_sid ON test_assignments(student_id)`],

    ['student_subjects', `CREATE TABLE IF NOT EXISTS student_subjects (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      subject_id INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      is_active  BOOLEAN     NOT NULL DEFAULT true,
      added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, subject_id)
    ); CREATE INDEX IF NOT EXISTS idx_ss_sid ON student_subjects(student_id)`],

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
        IF col_type = 'integer' THEN
          DROP TABLE IF EXISTS student_exam_types CASCADE;
        END IF;
      EXCEPTION WHEN others THEN NULL; END $$;
      CREATE TABLE IF NOT EXISTS student_exam_types (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exam_board_id   UUID        NOT NULL,
        subscription_id UUID,
        granted_at      TIMESTAMPTZ DEFAULT NOW(),
        expires_at      TIMESTAMPTZ,
        is_active       BOOLEAN     DEFAULT true,
        UNIQUE(student_id, exam_board_id)
      );
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
  ];

  for (const [label, sql] of tables) {
    await exec(label, sql);
  }

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
        (SELECT COUNT(*) FROM notifications)::int                      AS notifications
    `);
    console.table(rows[0]);
  } catch (e) {
    console.log('  (verification query failed:', e.message, ')');
  }

  console.log('\n✅ Migration complete.\n');
  await pool.end();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
