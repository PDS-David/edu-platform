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

// The 8 supported Language Masterclass language codes, for every CHECK
// constraint in the language-unification steps folded in below (originally
// server/scripts/migrate_language_unification.js — that script was never
// wired into deploy.sh, so its tables/join-tables never actually got
// created outside whatever environment it was manually run against.
// Folding it in here as permanent idempotent steps, matching this file's
// existing single-source-of-truth pattern, fixes that for good.
const LANGUAGES = ['english', 'french', 'german', 'mandarin', 'arabic', 'spanish', 'swahili', 'yoruba'];
const LANG_CHECK_LIST = LANGUAGES.map((l) => `'${l}'`).join(', ');

// Content seed for the 5 new languages (folded in from seed_new_languages.js —
// same deploy-wiring gap as above, folded in for the same reason).
const CONTENT = {
  mandarin: {
    flag: '🇨🇳',
    categoryName: 'Everyday Mandarin',
    description: 'Common everyday Mandarin words and greetings',
    words: [
      ['你好',   'Nǐ hǎo',   'Hello',       '你好，你好吗？',            '👋'],
      ['谢谢',   'Xièxiè',   'Thank you',    '谢谢你的帮助。',            '🙏'],
      ['是',     'Shì',      'Yes',          '是的，我明白了。',          '✅'],
      ['不',     'Bù',       'No',           '不，谢谢。',                '❌'],
      ['请',     'Qǐng',     'Please',       '请给我一杯水。',            '🙂'],
      ['再见',   'Zàijiàn',  'Goodbye',      '再见，明天见！',            '👋'],
      ['水',     'Shuǐ',     'Water',        '我想要一杯水。',            '💧'],
      ['面包',   'Miànbāo',  'Bread',        '今天早上的面包很新鲜。',    '🥖'],
    ],
  },
  arabic: {
    flag: '🇸🇦',
    categoryName: 'Everyday Arabic',
    description: 'Common everyday Arabic words and greetings',
    isRtl: true,
    words: [
      ['مرحبا',        'marḥaban',        'Hello',      'مرحبا، كيف حالك؟',           '👋'],
      ['شكرا',         'shukran',         'Thank you',  'شكرا جزيلا على مساعدتك.',    '🙏'],
      ['نعم',          'naʿam',           'Yes',        'نعم، أفهم.',                  '✅'],
      ['لا',           'lā',              'No',         'لا، شكرا.',                    '❌'],
      ['من فضلك',      'min faḍlik',      'Please',     'كوب ماء من فضلك.',            '🙂'],
      ['مع السلامة',   'maʿa as-salāma',  'Goodbye',    'مع السلامة، أراك غدا!',       '👋'],
      ['ماء',          'māʾ',             'Water',      'أريد كوب ماء.',                '💧'],
      ['خبز',          'khubz',           'Bread',      'الخبز طازج هذا الصباح.',       '🥖'],
    ],
  },
  spanish: {
    flag: '🇪🇸',
    categoryName: 'Everyday Spanish',
    description: 'Common everyday Spanish words and greetings',
    words: [
      ['Hola',       '/ˈo.la/',        'Hello',      '¡Hola! ¿Cómo estás?',          '👋'],
      ['Gracias',    '/ˈɡɾa.θjas/',    'Thank you',  'Gracias por tu ayuda.',        '🙏'],
      ['Sí',         '/si/',           'Yes',        'Sí, entiendo.',                '✅'],
      ['No',         '/no/',           'No',         'No, gracias.',                 '❌'],
      ['Por favor',  '/poɾ faˈβoɾ/',   'Please',     'Un vaso de agua, por favor.',  '🙂'],
      ['Adiós',      '/aˈðjos/',       'Goodbye',    'Adiós, ¡hasta mañana!',        '👋'],
      ['Agua',       '/ˈa.ɣwa/',       'Water',      'Quiero un vaso de agua.',      '💧'],
      ['Pan',        '/pan/',          'Bread',      'El pan está fresco hoy.',      '🥖'],
    ],
  },
  swahili: {
    flag: '🇰🇪',
    categoryName: 'Everyday Swahili',
    description: 'Common everyday Swahili words and greetings',
    words: [
      ['Jambo',      'JAM-boh',     'Hello',      'Jambo, habari yako?',        '👋'],
      ['Asante',     'ah-SAHN-teh', 'Thank you',  'Asante kwa msaada wako.',    '🙏'],
      ['Ndiyo',      'n-DEE-yoh',   'Yes',        'Ndiyo, naelewa.',            '✅'],
      ['Hapana',     'ha-PAH-nah',  'No',         'Hapana, asante.',            '❌'],
      ['Tafadhali',  'ta-fa-DHA-li','Please',     'Glasi ya maji, tafadhali.',  '🙂'],
      ['Kwaheri',    'kwa-HEH-ri',  'Goodbye',    'Kwaheri, tuonane kesho!',    '👋'],
      ['Maji',       'MAH-ji',      'Water',      'Nataka glasi ya maji.',      '💧'],
      ['Mkate',      'm-KAH-teh',   'Bread',      'Mkate ni mpya asubuhi hii.', '🥖'],
    ],
  },
  yoruba: {
    flag: '🇳🇬',
    categoryName: 'Everyday Yoruba',
    description: 'Common everyday Yoruba words and greetings',
    words: [
      ['Ẹ n lẹ́',    'eh n leh',     'Hello',      'Ẹ n lẹ́, ṣé dáadáa ni?',       '👋'],
      ['Ẹ ṣé',       'eh sheh',      'Thank you',  'Ẹ ṣé fún ìrànlọ́wọ́ yín.',      '🙏'],
      ['Bẹ́ẹ̀ni',      'beh-eh-ni',    'Yes',        'Bẹ́ẹ̀ni, mo yé mi.',            '✅'],
      ['Rárá',       'rah-rah',      'No',         'Rárá, ẹ ṣé.',                  '❌'],
      ['Jọ̀wọ́',       'jaw-waw',      'Please',     'Ago omi kan, jọ̀wọ́.',          '🙂'],
      ['Ó dàbọ̀',     'oh dah-baw',   'Goodbye',    'Ó dàbọ̀, á rí ọ ọ̀la!',         '👋'],
      ['Omi',        'oh-mi',        'Water',      'Mo fẹ́ ago omi kan.',           '💧'],
      ['Búrẹ́dì',     'boo-reh-dee',  'Bread',      'Búrẹ́dì náà ṣẹ̀ṣẹ̀ dáa ní òwúrọ̀.', '🥖'],
    ],
  },
};

function LANGUAGE_LABEL(code) {
  return { mandarin: 'Mandarin', arabic: 'Arabic', spanish: 'Spanish', swahili: 'Swahili', yoruba: 'Yoruba' }[code];
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

  // past_papers.updated_at is NOT NULL with no DB-level default — confirmed
  // live that this broke every upload via POST /past-papers, whose INSERT
  // never set it. Fixed at the call site too; a DB-level default closes
  // this off for any other/future writer of this table.
  await exec('past_papers: updated_at gets a DB-level default',
    `ALTER TABLE past_papers ALTER COLUMN updated_at SET DEFAULT NOW()`);

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

  // BUGFIX (2026-07-04): createSubject (server/controllers/subjects.js) had
  // no duplicate check at all -- no pre-check query, no DB constraint --
  // so POST /subjects could create the same (name, exam_board_id) twice.
  // Confirmed against a production dump: 'Mathematics'/CB and 'CRS'/JUPEB
  // each exist as two rows, with the older one manually set is_active=false
  // via direct DB access as an ad-hoc workaround (no admin UI exists to do
  // this through the app). A plain UNIQUE constraint would conflict with
  // that existing is_active=false row, so this is a PARTIAL unique index:
  // it only enforces uniqueness among *active* subjects, so the historical
  // deactivated duplicates are left alone but a second active subject with
  // the same name+exam board can no longer be created going forward.
  await exec('subjects: unique active (name, exam_board_id)', `
    CREATE UNIQUE INDEX IF NOT EXISTS subjects_active_name_examboard_unique
      ON subjects (name, exam_board_id) WHERE is_active = true`);

  await exec('questions: submitted_by + status/difficulty/type columns', `
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS submitted_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
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

  // Seed all exam boards the platform supports.
  // ON CONFLICT (code) DO UPDATE means this is safe to re-run — it only
  // adds missing boards and reactivates any that were accidentally deactivated.
  // Cambridge boards (CAMBAL, CAMBOL) and others were missing from the DB,
  // causing them to not appear in the registration curriculum dropdown even
  // though they were in the frontend fallback list.
  // esc() doubles embedded single quotes (SQL string-literal escaping) — without
  // it, "GCE A' Levels" interpolated directly into '${name}' breaks the
  // generated SQL at the embedded apostrophe. exec() swallows errors per
  // statement, so this was failing silently rather than crashing the deploy.
  const esc = (s) => String(s).replace(/'/g, "''");
  const BOARD_UPSERT = (code, name, fullName, displayOrder) => `
    INSERT INTO exam_boards (code, name, full_name, country, is_active, display_order, created_at, updated_at)
    VALUES ('${esc(code)}', '${esc(name)}', '${esc(fullName)}', 'NG', true, ${displayOrder}, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET
      name          = EXCLUDED.name,
      full_name     = EXCLUDED.full_name,
      is_active     = true,
      display_order = EXCLUDED.display_order,
      updated_at    = NOW()`;

  await exec('exam_boards: seed JAMB',          BOARD_UPSERT('JAMB',    'JAMB/UTME',             'Joint Admissions and Matriculation Board',                    1));
  await exec('exam_boards: seed WAEC',          BOARD_UPSERT('WAEC',    'WAEC/NECO (SSCE)',       'West African Examinations Council Senior School Certificate',  2));
  await exec('exam_boards: seed NECO',          BOARD_UPSERT('NECO',    'NECO',                   'National Examinations Council',                               3));
  await exec('exam_boards: seed BECE',          BOARD_UPSERT('BECE',    'Junior WAEC (BECE)',     'Basic Education Certificate Examination',                     4));
  await exec('exam_boards: seed GCE_AL',        BOARD_UPSERT('GCE_AL',  "GCE A' Levels",         'General Certificate of Education Advanced Level',             5));
  await exec('exam_boards: seed JUPEB',         BOARD_UPSERT('JUPEB',   'JUPEB',                  'Joint Universities Preliminary Examinations Board',           6));
  await exec('exam_boards: seed CAMBAL',        BOARD_UPSERT('CAMBAL',  'Cambridge A Level',      'Cambridge International AS & A Level',                        7));
  await exec('exam_boards: seed CAMBOL',        BOARD_UPSERT('CAMBOL',  'Cambridge O Level',      'Cambridge International O Level / IGCSE',                     8));
  await exec('exam_boards: seed AQAAL',         BOARD_UPSERT('AQAAL',   'AQA A Level',            'AQA Advanced Level Qualifications',                           9));
  await exec('exam_boards: seed EDXAL',         BOARD_UPSERT('EDXAL',   'Edexcel A Level',        'Pearson Edexcel Advanced Level Qualifications',               10));
  await exec('exam_boards: seed IELTS',         BOARD_UPSERT('IELTS',   'IELTS',                  'International English Language Testing System',               11));
  await exec('exam_boards: seed TOEFL',         BOARD_UPSERT('TOEFL',   'TOEFL',                  'Test of English as a Foreign Language',                       12));
  await exec('exam_boards: seed SAT',           BOARD_UPSERT('SAT',     'SAT',                    'Scholastic Assessment Test',                                  13));
  await exec('exam_boards: seed LANG_EN',       BOARD_UPSERT('LANG_EN', 'Language Lab – English', 'English Language Laboratory',                                 14));
  await exec('exam_boards: seed LANG_FR',       BOARD_UPSERT('LANG_FR', 'Language Lab – French',  'French Language Laboratory',                                  15));
  await exec('exam_boards: seed LANG_YO',       BOARD_UPSERT('LANG_YO', 'Language Lab – Yoruba',  'Yoruba Language Laboratory',                                  16));
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
    CREATE INDEX IF NOT EXISTS idx_pt_ref ON payment_transactions(transaction_reference);
    -- BUGFIX (2026-07-13): GET /payments/verify (server/routes/paymentRoutes.js)
    -- has always written completed_at/subscription_id/payment_method on the
    -- final "mark transaction successful" UPDATE, and completed_at again on
    -- the "mark failed" branch — but none of these 3 columns were ever
    -- actually added to this table, in this file or the original
    -- migration_002.sql definition. Verified against a live Postgres instance
    -- built from this exact schema: after a successful Paystack payment, the
    -- user_subscriptions row IS created and users.subscription_status IS set
    -- to 'active' correctly (both those statements only touch real columns),
    -- but the very next statement — marking payment_transactions successful —
    -- throws "column subscription_id does not exist", which propagates to the
    -- route's catch block and returns an error to the student. Net effect:
    -- the student is charged and access is actually granted, but they see a
    -- failure message. Adding the columns (not stripping them from the
    -- code) since they're clearly-intended, valuable audit-trail fields, not
    -- unused/speculative ones. FK to user_subscriptions added separately
    -- below, after that table exists (it's defined in the next tuple).
    ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(50),
      ADD COLUMN IF NOT EXISTS subscription_id UUID`],

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

    // FK for payment_transactions.subscription_id — added here (not in the
    // payment_transactions tuple above) because user_subscriptions must
    // exist first. See the BUGFIX comment on the payment_transactions
    // ALTER TABLE above for the full story.
    ['payment_transactions: subscription_id FK', `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_subscription_id_fkey'
        ) THEN
          ALTER TABLE payment_transactions
            ADD CONSTRAINT payment_transactions_subscription_id_fkey
            FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL;
        END IF;
      EXCEPTION WHEN others THEN NULL; END $$`],

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
        ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email_updates":true,"weekly_digest":true,"new_assignments":true}',
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

    // C-1c: add paper_type, subject_id, session_id to practice_attempts for history features
    ['practice_attempts: add paper_type, subject_id, session_id', `
      ALTER TABLE practice_attempts
        ADD COLUMN IF NOT EXISTS paper_type  VARCHAR(20) DEFAULT 'quiz',
        ADD COLUMN IF NOT EXISTS subject_id  INTEGER,
        ADD COLUMN IF NOT EXISTS session_id  UUID`],

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

  // Approve legacy questions with NULL status — these were imported before the
  // status column was introduced. COALESCE(status,'pending') treats them as
  // pending, inflating the review queue count (was showing 204) with questions
  // that are already live/active and can never be found via the review UI.
  await exec('questions: approve legacy NULL-status entries',
    `UPDATE questions SET status = 'approved', updated_at = NOW()
      WHERE status IS NULL AND is_active = true`
  );

  // Ensure Platform Admin user has role='admin'
  await exec('Platform Admin: ensure role=admin',
    `UPDATE users SET role = 'admin', updated_at = NOW()
      WHERE email = 'admin@aischoolonair.com'
        AND role != 'admin'`
  );

  // ── migration_006: subtopic_progress missing columns ──────────────────────
  await exec('subtopic_progress: add resources_completed, practice_completed, completion_pct',
    `ALTER TABLE subtopic_progress
       ADD COLUMN IF NOT EXISTS resources_completed BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS practice_completed  BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS completion_pct      SMALLINT NOT NULL DEFAULT 0
         CHECK (completion_pct BETWEEN 0 AND 100)`
  );
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

  // ── English Masterclass tables ────────────────────────────────────────────
  await exec('em_categories: create table',
    `CREATE TABLE IF NOT EXISTS em_categories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      description TEXT,
      difficulty  TEXT NOT NULL DEFAULT 'Beginner'
                    CHECK (difficulty IN ('Beginner','Intermediate','Advanced')),
      icon_emoji  TEXT DEFAULT '📚',
      order_index INT  NOT NULL DEFAULT 0,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  // BUGFIX (2026-07-03): em_categories had no unique constraint, so the
  // 'ON CONFLICT DO NOTHING' on the seed insert below had nothing to key
  // off of — every re-run of this migration (i.e. every deploy, since
  // deploy.sh runs this script unconditionally) inserted 6 more duplicate
  // categories. This is what produced the wall of ~40 identical "Everyday
  // British" cards on the student dashboard. Adding the constraint here
  // stops NEW duplicates; existing duplicates must be merged separately
  // (see server/scripts/dedupe_em_categories.js) before this ALTER can
  // succeed — until then it will safely no-op via the exec() catch below.
  await exec('em_categories: add unique constraint (name, difficulty)',
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'em_categories_name_difficulty_unique'
      ) THEN
        ALTER TABLE em_categories ADD CONSTRAINT em_categories_name_difficulty_unique
          UNIQUE (name, difficulty);
      END IF;
    END $$`
  );
  await exec('em_words: create table',
    `CREATE TABLE IF NOT EXISTS em_words (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id      UUID NOT NULL REFERENCES em_categories(id) ON DELETE CASCADE,
      word             TEXT NOT NULL,
      phonetic         TEXT,
      definition       TEXT,
      example_sentence TEXT,
      audio_url        TEXT,
      difficulty       TEXT NOT NULL DEFAULT 'Beginner'
                         CHECK (difficulty IN ('Beginner','Intermediate','Advanced')),
      order_index      INT  NOT NULL DEFAULT 0,
      is_active        BOOLEAN NOT NULL DEFAULT true,
      created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await exec('em_words: add unique constraint',
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'em_words_category_word_unique'
      ) THEN
        ALTER TABLE em_words ADD CONSTRAINT em_words_category_word_unique
          UNIQUE (category_id, word);
      END IF;
    END $$`
  );
  await exec('em_word_progress: create table',
    `CREATE TABLE IF NOT EXISTS em_word_progress (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word_id          UUID NOT NULL REFERENCES em_words(id) ON DELETE CASCADE,
      correct_attempts INT NOT NULL DEFAULT 0,
      total_attempts   INT NOT NULL DEFAULT 0,
      mastered         BOOLEAN NOT NULL DEFAULT false,
      last_practiced   TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, word_id)
    )`
  );
  await exec('em_practice_sessions: create table',
    `CREATE TABLE IF NOT EXISTS em_practice_sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id   UUID REFERENCES em_categories(id) ON DELETE SET NULL,
      category_name TEXT,
      total_words   INT NOT NULL DEFAULT 0,
      correct_words INT NOT NULL DEFAULT 0,
      accuracy      NUMERIC(5,2) NOT NULL DEFAULT 0,
      duration_secs INT NOT NULL DEFAULT 0,
      pronunciation_score NUMERIC(5,2),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  // Mic-based pronunciation practice (added for the speaking-scoring feature).
  // ADD COLUMN IF NOT EXISTS so this applies to the already-live production
  // table, not just fresh installs picked up by the CREATE TABLE above.
  await exec('em_practice_sessions: add pronunciation_score column',
    `ALTER TABLE em_practice_sessions ADD COLUMN IF NOT EXISTS pronunciation_score NUMERIC(5,2)`
  );
  // Freeze the category's difficulty onto the session row at save-time,
  // rather than looking it up live via em_categories on every level-progress
  // query. Confirmed live (2026-07-14): em_practice_sessions.category_id is
  // ON DELETE SET NULL, so deleting a category used to silently drop every
  // session that played it out of the level-unlock totals (INNER JOIN on a
  // now-NULL category_id excludes the row) — a student could lose an
  // already-earned level unlock the moment an admin deleted an old category.
  // difficulty column removes that dependency entirely: once a session is
  // saved, its contribution to level-unlock math no longer depends on the
  // category continuing to exist.
  await exec('em_practice_sessions: add difficulty column',
    `ALTER TABLE em_practice_sessions ADD COLUMN IF NOT EXISTS difficulty TEXT`
  );
  await exec('em_practice_sessions: backfill difficulty from em_categories',
    `UPDATE em_practice_sessions ps
        SET difficulty = c.difficulty
       FROM em_categories c
      WHERE ps.category_id = c.id
        AND ps.difficulty IS NULL`
  );
  await exec('em_user_stats: create table',
    `CREATE TABLE IF NOT EXISTS em_user_stats (
      user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      words_learned       INT          NOT NULL DEFAULT 0,
      words_mastered      INT          NOT NULL DEFAULT 0,
      practice_streak     INT          NOT NULL DEFAULT 0,
      longest_streak      INT          NOT NULL DEFAULT 0,
      total_sessions      INT          NOT NULL DEFAULT 0,
      total_practice_secs INT          NOT NULL DEFAULT 0,
      overall_accuracy    NUMERIC(5,2) NOT NULL DEFAULT 0,
      last_practice_date  DATE,
      updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`
  );
  await exec('em_*: create indexes',
    `CREATE INDEX IF NOT EXISTS idx_em_words_category ON em_words(category_id) WHERE is_active = true;
     CREATE INDEX IF NOT EXISTS idx_em_word_progress_user ON em_word_progress(user_id);
     CREATE INDEX IF NOT EXISTS idx_em_sessions_user ON em_practice_sessions(user_id, created_at DESC)`
  );
  // BUGFIX (2026-07-05): the original em_categories/em_words seed data
  // branded this course as British-English-specific ('Everyday British',
  // 'British Idioms', 'British Slang', 🇬🇧 icon, definitions like "An
  // informal British word for a man"). English Masterclass teaches
  // English generally, not one regional variety — this renames the
  // existing categories IN PLACE (UPDATE, not a new INSERT) so the
  // category id, all its words, and every student's existing progress on
  // those words are preserved untouched; only the name/description/icon
  // change. This must run BEFORE the seed INSERT below in the same
  // migration execution: the seed INSERT's ON CONFLICT (name, difficulty)
  // needs to see the already-renamed row to correctly no-op, rather than
  // creating a duplicate empty category under the new name (which is
  // exactly the em_categories duplicate-row bug fixed earlier — see
  // dedupe_em_categories.js). Safe to run on every deploy: after the
  // first run these UPDATEs simply match 0 rows.
  await exec('em_categories: rename British-branded categories to neutral English framing', `
    UPDATE em_categories SET
      name = 'Everyday English',
      description = 'Common words used in everyday English conversation',
      icon_emoji = '🗣️'
      WHERE name = 'Everyday British' AND difficulty = 'Beginner';
    UPDATE em_categories SET
      name = 'English Idioms',
      description = 'Popular idioms and expressions used in everyday English'
      WHERE name = 'British Idioms' AND difficulty = 'Intermediate';
    UPDATE em_categories SET
      name = 'Everyday Slang',
      description = 'Informal, everyday slang terms'
      WHERE name = 'British Slang' AND difficulty = 'Advanced';
    UPDATE em_categories SET
      description = 'Common spelling variations across English-speaking regions'
      WHERE name = 'Spelling Patterns' AND difficulty = 'Beginner';
  `);
  await exec('em_categories: seed default categories',
    `INSERT INTO em_categories (name, description, difficulty, icon_emoji, order_index)
     VALUES
       ('Everyday English', 'Common words used in everyday English conversation', 'Beginner',     '🗣️', 1),
       ('English Idioms',   'Popular idioms and expressions used in everyday English', 'Intermediate', '💬',  2),
       ('Formal English',    'Vocabulary for professional and formal settings',     'Intermediate', '📝',  3),
       ('Everyday Slang',   'Informal, everyday slang terms',                       'Advanced',     '😄',  4),
       ('Pronunciation',     'Words commonly mispronounced by non-native speakers', 'Advanced',     '🎙️', 5),
       ('Spelling Patterns', 'Common spelling variations across English-speaking regions', 'Beginner',     '✏️', 6)
     ON CONFLICT (name, difficulty) DO NOTHING`
  );
  // Same rename-in-place treatment for em_words that had explicit British
  // callouts baked into their definition text (category_id, word identity,
  // and all em_word_progress rows are untouched — only the definition text
  // changes). Matched by (category name at time of seeding, word) via a
  // join so this doesn't depend on knowing specific word ids.
  await exec('em_words: neutralise British-only definition wording', `
    UPDATE em_words SET definition = 'Excellent; very good (informal)'
      WHERE word = 'brilliant' AND definition = 'Excellent; very good (informal British)';
    UPDATE em_words SET definition = 'An informal word for a man'
      WHERE word = 'bloke' AND definition = 'An informal British word for a man';
    UPDATE em_words SET definition = 'A word for an apartment'
      WHERE word = 'flat' AND definition = 'An apartment in British English';
    UPDATE em_words SET definition = 'Also spelled "color" in American English'
      WHERE word = 'colour' AND definition = 'British spelling of color';
    UPDATE em_words SET definition = 'Also spelled "honor" in American English'
      WHERE word = 'honour' AND definition = 'British spelling of honor';
    UPDATE em_words SET definition = 'Also spelled "realize" in American English'
      WHERE word = 'realise' AND definition = 'British spelling of realize';
    UPDATE em_words SET definition = 'Also spelled "center" in American English'
      WHERE word = 'centre' AND definition = 'British spelling of center';
    UPDATE em_words SET definition = 'Also spelled "defense" in American English'
      WHERE word = 'defence' AND definition = 'British spelling of defense';
    UPDATE em_words SET definition = 'Noun form (the verb is "license"); American English uses "license" for both'
      WHERE word = 'licence' AND definition = 'British noun form (license is verb)';
  `);
  await exec('em_words: seed default words',
    `INSERT INTO em_words (category_id, word, phonetic, definition, example_sentence)
     SELECT c.id, v.word, v.phonetic, v.definition, v.example_sentence
     FROM em_categories c
     JOIN (VALUES
       ('Everyday English','queue','/kjuː/','A line of people or vehicles waiting','Please join the queue at the bus stop.'),
       ('Everyday English','fortnight','/ˈfɔːtnaɪt/','A period of two weeks','I shall return in a fortnight.'),
       ('Everyday English','biscuit','/ˈbɪskɪt/','A small flat crisp baked cake','Would you like a biscuit with your tea?'),
       ('Everyday English','rubbish','/ˈrʌbɪʃ/','Waste material; also means nonsense','Please put the rubbish in the bin.'),
       ('Everyday English','brilliant','/ˈbrɪliənt/','Excellent; very good (informal)','That film was absolutely brilliant!'),
       ('Everyday English','bloke','/bləʊk/','An informal word for a man','He seems like a decent bloke.'),
       ('Everyday English','flat','/flæt/','A word for an apartment','She lives in a flat in London.'),
       ('Everyday English','jumper','/ˈdʒʌmpə/','A knitted sweater','It''s cold — put your jumper on.'),
       ('Everyday English','autumn','/ˈɔːtəm/','The season between summer and winter','The leaves are beautiful in autumn.'),
       ('Everyday English','pavement','/ˈpeɪvmənt/','A raised path for pedestrians','Please walk on the pavement, not the road.'),
       ('English Idioms','chuffed','/tʃʌft/','Very pleased or satisfied','She was chuffed to bits with her results.'),
       ('English Idioms','gobsmacked','/ˈɡɒbsmækt/','Utterly astonished','I was absolutely gobsmacked by the news.'),
       ('English Idioms','over the moon','/ˌəʊvə ðə ˈmuːn/','Extremely happy','He was over the moon when he got the job.'),
       ('English Idioms','gutted','/ˈɡʌtɪd/','Bitterly disappointed','I was gutted when we lost the match.'),
       ('English Idioms','knackered','/ˈnækəd/','Extremely tired; worn out','I''m absolutely knackered after that shift.'),
       ('English Idioms','blimey','/ˈblaɪmi/','An exclamation of surprise','Blimey, that''s a lot of money!'),
       ('Formal English','commence','/kəˈmens/','To begin or start something','The ceremony will commence at noon.'),
       ('Formal English','endeavour','/ɪnˈdevə/','To try hard to achieve something','We shall endeavour to resolve this promptly.'),
       ('Formal English','subsequently','/ˈsʌbsɪkwəntli/','At a later time','He subsequently withdrew his application.'),
       ('Formal English','forthwith','/ˌfɔːθˈwɪð/','Immediately; without delay','You are required to respond forthwith.'),
       ('Formal English','notwithstanding','/ˌnɒtwɪθˈstændɪŋ/','Despite; in spite of','Notwithstanding the difficulties, progress was made.'),
       ('Everyday Slang','cheeky','/ˈtʃiːki/','Slightly rude but playful','Don''t be cheeky to your teacher!'),
       ('Everyday Slang','dodgy','/ˈdɒdʒi/','Dishonest or of poor quality','That restaurant looks a bit dodgy.'),
       ('Everyday Slang','peckish','/ˈpekɪʃ/','Slightly hungry','I''m feeling a bit peckish — fancy a biscuit?'),
       ('Everyday Slang','naff','/næf/','Lacking taste or style; inferior','That outfit is a bit naff.'),
       ('Everyday Slang','faff','/fæf/','To waste time on unimportant things','Stop faffing about and get ready!'),
       ('Pronunciation','colonel','/ˈkɜːnl/','A senior military officer rank','The colonel gave the order to advance.'),
       ('Pronunciation','choir','/ˈkwaɪə/','A group of singers','She sings in the school choir.'),
       ('Pronunciation','Wednesday','/ˈwenzdɪ/','The day between Tuesday and Thursday','The meeting is on Wednesday.'),
       ('Pronunciation','Leicester','/ˈlɛstə/','A city in the East Midlands','Leicester is known for its football club.'),
       ('Pronunciation','Edinburgh','/ˈedɪnbrə/','The capital city of Scotland','Edinburgh Castle sits atop an ancient volcano.'),
       ('Spelling Patterns','colour','/ˈkʌlə/','Also spelled "color" in American English','The colour of the sky is deep blue.'),
       ('Spelling Patterns','honour','/ˈɒnə/','Also spelled "honor" in American English','It is an honour to meet you.'),
       ('Spelling Patterns','realise','/ˈrɪəlaɪz/','Also spelled "realize" in American English','I didn''t realise you were here.'),
       ('Spelling Patterns','centre','/ˈsentə/','Also spelled "center" in American English','Meet me at the town centre.'),
       ('Spelling Patterns','defence','/dɪˈfens/','Also spelled "defense" in American English','The country''s defence budget increased.'),
       ('Spelling Patterns','licence','/ˈlaɪsns/','Noun form (the verb is "license"); American English uses "license" for both','You need a licence to drive in the UK.')
     ) AS v(category_name, word, phonetic, definition, example_sentence)
       ON c.name = v.category_name
     ON CONFLICT (category_id, word) DO NOTHING`
  );

  // ── users: separate English Masterclass registration ───────────────────────
  // Shared `users` table stays, but EM access now requires an explicit one-time
  // registration step distinct from AISchoolOnAir signup — a NULL value here
  // means the user has an AISchoolOnAir account but has never registered for EM.
  await exec('users: add em_registered_at',
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS em_registered_at TIMESTAMPTZ`);

  // Grandfather existing users who already have EM activity — they registered
  // under the old shared-access model, so treat that activity as their
  // registration rather than locking them out retroactively.
  await exec('users: grandfather existing EM users',
    `UPDATE users
        SET em_registered_at = NOW()
      WHERE em_registered_at IS NULL
        AND id IN (
          SELECT user_id FROM em_practice_sessions
          UNION
          SELECT user_id FROM em_word_progress
        )`);

  // ── EM pronunciation + writing grading persistence ──────────────────────────
  // BUG FIX (silent-insert-failure): database/em_grading_persistence.sql
  // defines these tables, but that file is never executed on deploy — only
  // this script is (see the deploy.sh / .dockerignore note elsewhere in this
  // repo re: standalone SQL files under database/). Both POST
  // /english-masterclass/pronunciation-score and /writing-score already
  // INSERT into these tables in production right now; without them existing,
  // every one of those inserts has been silently failing (caught and
  // console.warn'd, so scoring itself still worked — students got feedback,
  // nothing was ever saved for review/audit). Wiring the same DDL in here so
  // it actually runs.
  await exec('em_pronunciation_attempts: create table', `
    CREATE TABLE IF NOT EXISTS em_pronunciation_attempts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word_id          UUID REFERENCES em_words(id) ON DELETE SET NULL,
      word_text        TEXT NOT NULL,
      audio_url        TEXT,
      heard            TEXT,
      score            NUMERIC(5,2) NOT NULL,
      matched          BOOLEAN NOT NULL DEFAULT false,
      feedback         TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await exec('em_pronunciation_attempts: indexes', `
    CREATE INDEX IF NOT EXISTS idx_em_pronunciation_attempts_user ON em_pronunciation_attempts(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_em_pronunciation_attempts_word ON em_pronunciation_attempts(word_id)`
  );

  await exec('em_writing_submissions: create table', `
    CREATE TABLE IF NOT EXISTS em_writing_submissions (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word_id              UUID REFERENCES em_words(id) ON DELETE SET NULL,
      word_text            TEXT NOT NULL,
      prompt               TEXT NOT NULL,
      submission_text      TEXT NOT NULL,
      score                NUMERIC(5,2) NOT NULL,
      used_word_correctly  BOOLEAN NOT NULL DEFAULT false,
      grammar_notes        TEXT,
      feedback             TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await exec('em_writing_submissions: indexes', `
    CREATE INDEX IF NOT EXISTS idx_em_writing_submissions_user ON em_writing_submissions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_em_writing_submissions_word ON em_writing_submissions(word_id)`
  );

  // sentence_count / sentences_written — needed for the multi-sentence
  // writing prompts ("use X in 3 sentences"); nullable so existing rows
  // (single-sentence, from before this existed) are unaffected.
  await exec('em_writing_submissions: add sentence-count columns', `
    ALTER TABLE em_writing_submissions
      ADD COLUMN IF NOT EXISTS sentence_count_required INTEGER,
      ADD COLUMN IF NOT EXISTS sentence_count_written  INTEGER,
      ADD COLUMN IF NOT EXISTS sentence_count_met       BOOLEAN`
  );

  await exec('em_practice_sessions: add writing_score',
    `ALTER TABLE em_practice_sessions ADD COLUMN IF NOT EXISTS writing_score NUMERIC(5,2)`
  );

  // ── SCHOOL TENANCY (initial slice) ──────────────────────────────────────────
  // database/migration_school_tenancy.sql defines this schema, but per the note
  // above, standalone files under database/ are never executed on deploy — only
  // this script is. Wiring the same DDL in here so schools/register, /join, and
  // /me/roster actually have somewhere to read/write on a real deploy.
  await exec('enum: school_admin role', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
        WHERE t.typname='enum_users_role' AND e.enumlabel='school_admin')
      THEN ALTER TYPE enum_users_role ADD VALUE 'school_admin'; END IF;
    EXCEPTION WHEN others THEN NULL; END $$`);

  await exec('schools: create table', `
    CREATE TABLE IF NOT EXISTS schools (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(255) NOT NULL,
      join_code     VARCHAR(20)  NOT NULL UNIQUE,
      address       TEXT,
      contact_email VARCHAR(255),
      is_active     BOOLEAN      NOT NULL DEFAULT true,
      created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`
  );
  await exec('schools: join_code index',
    `CREATE INDEX IF NOT EXISTS idx_schools_join_code ON schools(join_code)`
  );

  await exec('users: add school_id column',
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL`
  );
  await exec('users: school_id index',
    `CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id) WHERE school_id IS NOT NULL`
  );

  // resources.school_id — nullable, additive, same pattern as users.school_id
  // above. NULL means global (visible everywhere, matching every existing
  // resource's current behaviour unchanged); set means private to that one
  // school. Per Da's decision: App Admin's uploads stay global/shared with
  // every school, but resources pushed by a school's own admin or teachers
  // stay within that school only.
  await exec('resources: add school_id column',
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL`
  );
  await exec('resources: school_id index',
    `CREATE INDEX IF NOT EXISTS idx_resources_school_id ON resources(school_id) WHERE school_id IS NOT NULL`
  );

  // schools.enable_aischoolonair / enable_em — lets App Admin register a
  // tenant for AISchoolonair alone, English Masterclass alone, or both.
  // Before this, every school implicitly got both (schoolRoutes.js /join
  // and EM's join_code signup both accepted the same code with no
  // per-service check at all) — this closes that gap. Default keeps every
  // EXISTING school's current behaviour unchanged (AISchoolonair on,
  // EM off) rather than silently granting or revoking access on deploy.
  await exec('schools: add enable_aischoolonair / enable_em columns', `
    ALTER TABLE schools
      ADD COLUMN IF NOT EXISTS enable_aischoolonair BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS enable_em            BOOLEAN NOT NULL DEFAULT false`
  );
  await exec('schools: at-least-one-service check constraint', `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='schools_at_least_one_service')
      THEN ALTER TABLE schools ADD CONSTRAINT schools_at_least_one_service
        CHECK (enable_aischoolonair OR enable_em); END IF;
    EXCEPTION WHEN others THEN NULL; END $$`
  );

  // schools.logo_url — set at registration (App Admin) or updated later by
  // either App Admin or the school's own school_admin. NULL until someone
  // uploads one; the UI falls back to a generic school icon.
  await exec('schools: add logo_url column',
    `ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url TEXT`
  );

  // ═══════════════════════════════════════════════════════════════════════
  // FRENCH / GERMAN MASTERCLASS — proof-of-concept, deliberately incomplete
  // ═══════════════════════════════════════════════════════════════════════
  // Per Da's decision: this is presales/demo collateral, not a finished
  // product — enough to show a prospective client the shape of the thing
  // (levels, categories, real Gemini-scored pronunciation practice) without
  // it being a fully usable course yet. Specifically, on purpose:
  //   - enable_french / enable_german both DEFAULT false, same pattern as
  //     enable_em above — no existing school gets this without someone
  //     deliberately turning it on for a specific demo/client account.
  //   - Only ONE category is seeded per language (Beginner), with a small
  //     handful of words — nowhere near a complete Beginner tier. This is
  //     intentional, not a content-authoring gap to "finish later" blindly;
  //     see TODO.md / the handoff note for what's still deliberately absent
  //     (Intermediate, Advanced, Listening Comprehension, Writing
  //     Composition) before building any of it out.
  //   - No lang_writing_submissions / no writing-score route, and no
  //     listening-dictation check route, at all — those two exercise types
  //     are UI-only "yet to be completed" placeholders on the frontend,
  //     nothing to migrate for them yet.

  await exec('schools: add enable_french / enable_german columns', `
    ALTER TABLE schools
      ADD COLUMN IF NOT EXISTS enable_french BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS enable_german BOOLEAN NOT NULL DEFAULT false`
  );

  await exec('users: add french_registered_at / german_registered_at', `
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS french_registered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS german_registered_at TIMESTAMPTZ`
  );

  await exec('lang_categories: create table', `
    CREATE TABLE IF NOT EXISTS lang_categories (
      id           SERIAL PRIMARY KEY,
      language     VARCHAR(10)  NOT NULL CHECK (language IN ('french','german')),
      name         VARCHAR(100) NOT NULL,
      description  TEXT,
      difficulty   VARCHAR(20)  NOT NULL DEFAULT 'Beginner'
                     CHECK (difficulty IN ('Beginner','Intermediate','Advanced')),
      icon_emoji   VARCHAR(10),
      order_index  INT NOT NULL DEFAULT 0,
      is_active    BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await exec('lang_categories: unique (language, name)',
    `CREATE UNIQUE INDEX IF NOT EXISTS lang_categories_language_name_unique
       ON lang_categories(language, name)`
  );

  await exec('lang_words: create table', `
    CREATE TABLE IF NOT EXISTS lang_words (
      id                SERIAL PRIMARY KEY,
      category_id       INT NOT NULL REFERENCES lang_categories(id) ON DELETE CASCADE,
      word              VARCHAR(150) NOT NULL,
      phonetic          VARCHAR(150),
      definition        TEXT,
      example_sentence  TEXT,
      icon_emoji        VARCHAR(10),
      is_active         BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await exec('lang_words: index on category_id',
    `CREATE INDEX IF NOT EXISTS idx_lang_words_category ON lang_words(category_id)`
  );

  // One row per practice session (mirrors em_practice_sessions' level-math
  // shape exactly, so /level-progress can reuse the same cumulative-
  // across-sessions logic already proven there). difficulty is frozen at
  // save-time for the same reason em_practice_sessions.difficulty is: a
  // category can later be deleted (ON DELETE CASCADE on lang_words, but
  // category_id here is ON DELETE SET NULL) without silently erasing a
  // student's already-earned level progress.
  await exec('lang_practice_sessions: create table', `
    CREATE TABLE IF NOT EXISTS lang_practice_sessions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language       VARCHAR(10)  NOT NULL CHECK (language IN ('french','german')),
      category_id    INT REFERENCES lang_categories(id) ON DELETE SET NULL,
      difficulty     VARCHAR(20),
      total_words    INT NOT NULL DEFAULT 0,
      correct_words  INT NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await exec('lang_practice_sessions: index on (user_id, language)',
    `CREATE INDEX IF NOT EXISTS idx_lang_sessions_user_lang ON lang_practice_sessions(user_id, language)`
  );

  await exec('lang_pronunciation_attempts: create table', `
    CREATE TABLE IF NOT EXISTS lang_pronunciation_attempts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language    VARCHAR(10) NOT NULL CHECK (language IN ('french','german')),
      word_id     INT REFERENCES lang_words(id) ON DELETE SET NULL,
      word_text   VARCHAR(150) NOT NULL,
      audio_url   TEXT,
      heard       TEXT,
      score       INT,
      matched     BOOLEAN,
      feedback    TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await exec('lang_pronunciation_attempts: index on (user_id, language)',
    `CREATE INDEX IF NOT EXISTS idx_lang_pron_user_lang ON lang_pronunciation_attempts(user_id, language)`
  );

  // ── Seed content — deliberately ONE category, a handful of words, per
  // language. This is the entire Beginner tier for now; Intermediate and
  // Advanced categories are seeded as empty placeholders below so the
  // level structure is visible (proves the "levels" concept) without any
  // content existing to practice yet.
  await exec('lang_categories: seed French Beginner category', `
    INSERT INTO lang_categories (language, name, description, difficulty, icon_emoji, order_index)
    VALUES ('french', 'Everyday French', 'Common everyday French words and greetings', 'Beginner', '🇫🇷', 1)
    ON CONFLICT (language, name) DO NOTHING`
  );
  await exec('lang_categories: seed German Beginner category', `
    INSERT INTO lang_categories (language, name, description, difficulty, icon_emoji, order_index)
    VALUES ('german', 'Everyday German', 'Common everyday German words and greetings', 'Beginner', '🇩🇪', 1)
    ON CONFLICT (language, name) DO NOTHING`
  );
  // Intermediate/Advanced categories for French/German — previously empty
  // "Coming soon" placeholders; now seeded with real vocabulary below, to
  // bring French/German up toward English Masterclass's level of content
  // completeness. Descriptions updated via UPDATE (not just the INSERT's
  // ON CONFLICT DO NOTHING) so an already-deployed placeholder row picks up
  // the real copy too, not just newly-created databases.
  await exec('lang_categories: seed Intermediate/Advanced categories', `
    INSERT INTO lang_categories (language, name, description, difficulty, icon_emoji, order_index)
    VALUES
      ('french', 'French Conversation', 'Everyday conversational French — questions, time words, and common connectors', 'Intermediate', '🇫🇷', 2),
      ('french', 'Advanced French',     'Higher-register French — connectors and verbs for nuanced, formal speech and writing', 'Advanced',     '🇫🇷', 3),
      ('german', 'German Conversation', 'Everyday conversational German — questions, time words, and common connectors', 'Intermediate', '🇩🇪', 2),
      ('german', 'Advanced German',     'Higher-register German — connectors and verbs for nuanced, formal speech and writing', 'Advanced',     '🇩🇪', 3)
    ON CONFLICT (language, name) DO NOTHING`
  );
  await exec('lang_categories: update stale "Coming soon" descriptions', `
    UPDATE lang_categories SET description = CASE
      WHEN language = 'french' AND name = 'French Conversation' THEN 'Everyday conversational French — questions, time words, and common connectors'
      WHEN language = 'french' AND name = 'Advanced French'     THEN 'Higher-register French — connectors and verbs for nuanced, formal speech and writing'
      WHEN language = 'german' AND name = 'German Conversation' THEN 'Everyday conversational German — questions, time words, and common connectors'
      WHEN language = 'german' AND name = 'Advanced German'     THEN 'Higher-register German — connectors and verbs for nuanced, formal speech and writing'
      ELSE description
    END
    WHERE description = 'Coming soon'`
  );

  await exec('lang_words: seed French Intermediate words', `
    INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji)
    SELECT c.id, w.word, w.phonetic, w.definition, w.example_sentence, w.icon_emoji
    FROM (VALUES
      ('Comment',       '/kɔ.mɑ̃/',       'How',            'Comment allez-vous aujourd''hui ?',            '❓'),
      ('Pourquoi',      '/puʁ.kwa/',      'Why',            'Pourquoi est-ce que tu pleures ?',              '❓'),
      ('Beaucoup',      '/bo.ku/',        'A lot / very much', 'Merci beaucoup pour ton aide.',              '📈'),
      ('Aujourd''hui',  '/o.ʒuʁ.dɥi/',    'Today',          'Aujourd''hui, il fait beau.',                   '📅'),
      ('Demain',        '/də.mɛ̃/',        'Tomorrow',       'Nous partons demain matin.',                    '📅'),
      ('Toujours',      '/tu.ʒuʁ/',       'Always',         'Il arrive toujours en retard.',                 '♾️'),
      ('Ensemble',      '/ɑ̃.sɑ̃bl/',      'Together',       'Travaillons ensemble sur ce projet.',            '🤝'),
      ('Peut-être',     '/pø.tɛtʁ/',      'Maybe',          'Peut-être qu''il viendra ce soir.',              '🤔'),
      ('Vraiment',      '/vʁɛ.mɑ̃/',       'Really',         'C''est vraiment une bonne idée.',                '💯'),
      ('Rapidement',    '/ʁa.pid.mɑ̃/',   'Quickly',        'Elle a fini son travail rapidement.',            '⚡'),
      ('Difficile',     '/di.fi.sil/',    'Difficult',      'Cet examen était très difficile.',               '😓'),
      ('Facile',        '/fa.sil/',       'Easy',           'Ce jeu est facile à apprendre.',                 '😊')
    ) AS w(word, phonetic, definition, example_sentence, icon_emoji)
    CROSS JOIN (SELECT id FROM lang_categories WHERE language='french' AND name='French Conversation') c
    WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.category_id = c.id AND lw.word = w.word)`
  );

  await exec('lang_words: seed French Advanced words', `
    INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji)
    SELECT c.id, w.word, w.phonetic, w.definition, w.example_sentence, w.icon_emoji
    FROM (VALUES
      ('Néanmoins',      '/ne.ɑ̃.mwɛ̃/',        'Nevertheless',            'Il pleuvait ; néanmoins, nous sommes sortis.',        '⚖️'),
      ('Cependant',       '/sə.pɑ̃.dɑ̃/',        'However',                 'Cependant, je ne suis pas d''accord.',                 '⚖️'),
      ('Davantage',       '/da.vɑ̃.taʒ/',       'Further / more',          'Il faudrait étudier davantage ce dossier.',            '📊'),
      ('Éventuellement',  '/e.vɑ̃.tɥ.ɛl.mɑ̃/',   'Possibly / eventually',   'Éventuellement, nous pourrions changer de plan.',       '🔮'),
      ('Malgré',          '/mal.ɡʁe/',          'Despite',                 'Malgré la pluie, le match a eu lieu.',                 '☔'),
      ('Autrement',       '/o.tʁə.mɑ̃/',        'Otherwise',               'Dépêche-toi, autrement tu vas rater le train.',        '↪️'),
      ('Désormais',       '/de.zɔʁ.mɛ/',        'From now on',             'Désormais, les bureaux ouvrent à neuf heures.',        '🕘'),
      ('Quoique',         '/kwak/',             'Although',                'Quoique fatigué, il a terminé le travail.',            '🔀'),
      ('Approfondir',     '/a.pʁɔ.fɔ̃.diʁ/',    'To explore in depth',     'Nous devons approfondir cette question demain.',       '🔍'),
      ('Envisager',       '/ɑ̃.vi.za.ʒe/',      'To consider',             'Elle envisage de changer de carrière.',                '🤔'),
      ('Souligner',       '/su.li.ɲe/',         'To emphasize',            'Le rapport souligne l''importance du projet.',         '✏️'),
      ('Constater',       '/kɔ̃s.ta.te/',       'To note / observe',       'On peut constater une nette amélioration.',            '👀')
    ) AS w(word, phonetic, definition, example_sentence, icon_emoji)
    CROSS JOIN (SELECT id FROM lang_categories WHERE language='french' AND name='Advanced French') c
    WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.category_id = c.id AND lw.word = w.word)`
  );

  await exec('lang_words: seed German Intermediate words', `
    INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji)
    SELECT c.id, w.word, w.phonetic, w.definition, w.example_sentence, w.icon_emoji
    FROM (VALUES
      ('Wie',        '/viː/',          'How',              'Wie geht es dir heute?',                     '❓'),
      ('Warum',      '/vaˈʁuːm/',      'Why',              'Warum bist du so spät?',                     '❓'),
      ('Heute',      '/ˈhɔʏtə/',       'Today',            'Heute ist ein schöner Tag.',                 '📅'),
      ('Morgen',     '/ˈmɔʁɡn̩/',      'Tomorrow',         'Wir fahren morgen früh los.',                '📅'),
      ('Immer',      '/ˈɪmɐ/',         'Always',           'Er kommt immer zu spät.',                    '♾️'),
      ('Zusammen',   '/tsuˈzamən/',    'Together',         'Lass uns zusammen arbeiten.',                '🤝'),
      ('Vielleicht', '/fiˈlaɪçt/',     'Maybe',            'Vielleicht kommt sie heute Abend.',          '🤔'),
      ('Wirklich',   '/ˈvɪʁklɪç/',     'Really',           'Das ist wirklich eine gute Idee.',           '💯'),
      ('Schnell',    '/ʃnɛl/',         'Fast / quickly',   'Sie hat die Arbeit schnell erledigt.',       '⚡'),
      ('Schwierig',  '/ˈʃviːʁɪç/',     'Difficult',        'Die Prüfung war sehr schwierig.',            '😓'),
      ('Einfach',    '/ˈaɪnfax/',      'Easy / simple',    'Dieses Spiel ist einfach zu lernen.',        '😊'),
      ('Viel',       '/fiːl/',         'A lot / much',     'Ich habe heute viel zu tun.',                 '📈')
    ) AS w(word, phonetic, definition, example_sentence, icon_emoji)
    CROSS JOIN (SELECT id FROM lang_categories WHERE language='german' AND name='German Conversation') c
    WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.category_id = c.id AND lw.word = w.word)`
  );

  await exec('lang_words: seed German Advanced words', `
    INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji)
    SELECT c.id, w.word, w.phonetic, w.definition, w.example_sentence, w.icon_emoji
    FROM (VALUES
      ('Dennoch',           '/ˈdɛnɔx/',                  'Nevertheless',             'Es regnete; dennoch gingen wir spazieren.',            '⚖️'),
      ('Allerdings',        '/ˌalɐˈdɪŋs/',               'However',                  'Allerdings bin ich anderer Meinung.',                   '⚖️'),
      ('Außerdem',          '/ˈaʊsɐdeːm/',               'Besides / moreover',       'Außerdem müssen wir den Bericht fertigstellen.',        '➕'),
      ('Möglicherweise',    '/ˈmøːklɪçɐˌvaɪzə/',         'Possibly',                 'Möglicherweise ändern wir den Plan noch.',              '🔮'),
      ('Obwohl',            '/ɔpˈvoːl/',                 'Although',                 'Obwohl er müde war, arbeitete er weiter.',              '🔀'),
      ('Inzwischen',        '/ɪnˈtsvɪʃn̩/',              'Meanwhile',                'Inzwischen können wir die Unterlagen prüfen.',          '⏳'),
      ('Grundsätzlich',     '/ˈɡʁʊntˌzɛtslɪç/',          'Fundamentally / basically','Grundsätzlich stimme ich dir zu.',                       '🧱'),
      ('Berücksichtigen',   '/bəˈʁʏkzɪçtɪɡn̩/',           'To take into account',     'Wir müssen alle Faktoren berücksichtigen.',             '🧮'),
      ('Betonen',           '/bəˈtoːnən/',               'To emphasize',             'Der Lehrer betonte die Bedeutung der Übung.',            '✏️'),
      ('Voraussichtlich',   '/foˈʁaʊsˌzɪçtlɪç/',         'Presumably / expected',    'Das Projekt wird voraussichtlich pünktlich fertig.',    '📆'),
      ('Zusammenhang',      '/tsuˈzamənˌhaŋ/',           'Context / connection',     'Das ergibt im Zusammenhang mehr Sinn.',                 '🔗'),
      ('Vermeiden',         '/fɛɐ̯ˈmaɪdn̩/',              'To avoid',                 'Wir sollten unnötige Fehler vermeiden.',                '🚫')
    ) AS w(word, phonetic, definition, example_sentence, icon_emoji)
    CROSS JOIN (SELECT id FROM lang_categories WHERE language='german' AND name='Advanced German') c
    WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.category_id = c.id AND lw.word = w.word)`
  );

  await exec('lang_words: seed French Beginner words', `
    INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji)
    SELECT c.id, w.word, w.phonetic, w.definition, w.example_sentence, w.icon_emoji
    FROM (VALUES
      ('Bonjour',  '/bɔ̃.ʒuʁ/',   'Hello / Good morning',        'Bonjour, comment allez-vous ?',        '👋'),
      ('Merci',    '/mɛʁ.si/',    'Thank you',                    'Merci beaucoup pour votre aide.',       '🙏'),
      ('Oui',      '/wi/',        'Yes',                          'Oui, je comprends.',                    '✅'),
      ('Non',      '/nɔ̃/',        'No',                           'Non, merci.',                           '❌'),
      ('S''il vous plaît', '/sil vu plɛ/', 'Please',              'Un café, s''il vous plaît.',            '🙂'),
      ('Au revoir','/o ʁə.vwaʁ/', 'Goodbye',                      'Au revoir, à demain !',                 '👋'),
      ('Eau',      '/o/',         'Water',                        'Je voudrais un verre d''eau.',          '💧'),
      ('Pain',     '/pɛ̃/',        'Bread',                        'Le pain est frais ce matin.',           '🥖')
    ) AS w(word, phonetic, definition, example_sentence, icon_emoji)
    CROSS JOIN (SELECT id FROM lang_categories WHERE language='french' AND name='Everyday French') c
    WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.category_id = c.id AND lw.word = w.word)`
  );

  await exec('lang_words: seed German Beginner words', `
    INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji)
    SELECT c.id, w.word, w.phonetic, w.definition, w.example_sentence, w.icon_emoji
    FROM (VALUES
      ('Hallo',        '/ˈhalo/',        'Hello',                  'Hallo, wie geht es dir?',              '👋'),
      ('Danke',        '/ˈdaŋkə/',       'Thank you',              'Danke schön für deine Hilfe.',         '🙏'),
      ('Ja',           '/jaː/',          'Yes',                    'Ja, das stimmt.',                       '✅'),
      ('Nein',         '/naɪn/',         'No',                     'Nein, danke.',                          '❌'),
      ('Bitte',        '/ˈbɪtə/',        'Please / You''re welcome','Ein Kaffee, bitte.',                   '🙂'),
      ('Auf Wiedersehen','/aʊf ˈviːdɐzeːən/','Goodbye',            'Auf Wiedersehen, bis morgen!',          '👋'),
      ('Wasser',       '/ˈvasɐ/',        'Water',                  'Ich hätte gern ein Glas Wasser.',       '💧'),
      ('Brot',         '/broːt/',        'Bread',                  'Das Brot ist heute frisch.',            '🍞')
    ) AS w(word, phonetic, definition, example_sentence, icon_emoji)
    CROSS JOIN (SELECT id FROM lang_categories WHERE language='german' AND name='Everyday German') c
    WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.category_id = c.id AND lw.word = w.word)`
  );


  // ══════════════════════════════════════════════════════════════════════
  // Language Masterclass unification (folded in from migrate_language_unification.js
  // to fix a deploy-wiring gap: that script existed and was correct, but
  // deploy.sh only ever called this file, so the join tables/lang_* schema
  // changes never ran automatically. Every step below is idempotent (same
  // as the original script), so this is safe to run against a DB that's
  // already been migrated by hand.
  // ══════════════════════════════════════════════════════════════════════
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

  // French/German writing (Written Composition) is now built and wired to
  // real grading (see languageMasterclassRoutes.js's /writing-score) — flip
  // the flag so it stops showing ComingSoon. Needs an explicit UPDATE, not
  // just the seed INSERT above, because ON CONFLICT DO NOTHING means the
  // insert never touches an already-existing row in a deployed DB.
  await exec('languages: enable writing for french/german', `
    UPDATE languages SET supports_writing = true WHERE code IN ('french', 'german')`);

  // Admin CMS support columns (mirrors em_categories/em_words) — needed so
  // the new /:language/admin/* routes can track who created what and when
  // something was last edited, and so a duplicate word can't silently
  // overwrite/duplicate under concurrent admin edits.
  await exec('lang_categories: admin CMS columns', `
    ALTER TABLE lang_categories
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`);
  await exec('lang_words: admin CMS columns', `
    ALTER TABLE lang_words
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`);
  await exec('lang_words: unique (category_id, word)', `
    CREATE UNIQUE INDEX IF NOT EXISTS lang_words_category_word_unique
      ON lang_words(category_id, word)`);

  // pronunciation_score/writing_score on lang_practice_sessions — mirrors
  // em_practice_sessions' same two columns (see GAP 4a in
  // ENGLISH_MASTERCLASS_AGENT_PROMPT.md); needed now that /sessions
  // averages and persists both per session.
  await exec('lang_practice_sessions: score columns', `
    ALTER TABLE lang_practice_sessions
      ADD COLUMN IF NOT EXISTS pronunciation_score NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS writing_score        NUMERIC(5,2)`);

  // ── STEP 4: bring lang_* up to parity with em_*'s full feature set ────────
  // (writing submissions, per-word progress, aggregate user stats) --
  // required so English doesn't lose these when it moves into lang_*, and
  // so the other 7 languages have somewhere for this data to land once
  // their backends grow these features.
  //
  // word_id below is INT, not UUID: lang_words.id is SERIAL (see "lang_words:
  // create table" above), unlike em_words.id which is UUID. This block was
  // originally copied from the em_word_progress/em_writing_submissions
  // pattern and kept word_id as UUID, which meant these two CREATE TABLE
  // statements always failed silently (exec() only logs failures, it never
  // throws) -- so on every environment that ran this script, these two
  // tables never actually existed, and every session save with per-word
  // answers, or every writing-score submission, silently failed to persist
  // progress/history from that point on. If you're running this after
  // upgrading from a version with the bug, this fixed version will create
  // the tables correctly on this run (IF NOT EXISTS never found them
  // before, since the broken CREATE TABLE never succeeded).
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



  // ── New-language content seed (Mandarin/Arabic/Spanish/Swahili/Yoruba) ──
  console.log('\n🌍 Seeding content for 5 new languages\n');
  for (const [language, data] of Object.entries(CONTENT)) {
    await exec(`${language}: seed Beginner category`, `
      INSERT INTO lang_categories (language, name, description, difficulty, icon_emoji, order_index)
      VALUES ('${language}', '${data.categoryName}', '${data.description}', 'Beginner', '${data.flag}', 1)
      ON CONFLICT (language, name) DO NOTHING`);

    await exec(`${language}: seed empty Intermediate/Advanced placeholders`, `
      INSERT INTO lang_categories (language, name, description, difficulty, icon_emoji, order_index)
      VALUES
        ('${language}', '${LANGUAGE_LABEL(language)} Conversation', 'Coming soon', 'Intermediate', '${data.flag}', 2),
        ('${language}', 'Advanced ${LANGUAGE_LABEL(language)}',     'Coming soon', 'Advanced',     '${data.flag}', 3)
      ON CONFLICT (language, name) DO NOTHING`);

    const values = data.words.map(([word, phonetic, definition, example, icon]) => {
      const esc = (s) => s.replace(/'/g, "''");
      return `('${esc(word)}', '${esc(phonetic)}', '${esc(definition)}', '${esc(example)}', '${esc(icon)}')`;
    }).join(',\n      ');

    await exec(`${language}: seed Beginner words`, `
      INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji)
      SELECT c.id, w.word, w.phonetic, w.definition, w.example_sentence, w.icon_emoji
      FROM (VALUES
      ${values}
      ) AS w(word, phonetic, definition, example_sentence, icon_emoji)
      CROSS JOIN (SELECT id FROM lang_categories WHERE language='${language}' AND name='${data.categoryName}') c
      WHERE NOT EXISTS (SELECT 1 FROM lang_words lw WHERE lw.category_id = c.id AND lw.word = w.word)`);
  }

  // Set is_rtl on the languages reference table for Arabic (already seeded
  // true by migrate_language_unification.js, but re-affirm here in case
  // this script ever runs before that one).
  await exec('languages: confirm Arabic is_rtl = true', `
    UPDATE languages SET is_rtl = true WHERE code = 'arabic'`);

  console.log('\n✅ Migration complete.\n');
  await pool.end();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
