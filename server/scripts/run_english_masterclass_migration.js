#!/usr/bin/env node
// server/scripts/run_english_masterclass_migration.js
// Creates all tables for the English Masterclass module.
// Safe to re-run — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
//
// Run:
//   node server/scripts/run_english_masterclass_migration.js
//   OR inside docker:
//   docker exec aischool_api node /app/scripts/run_english_masterclass_migration.js

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
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
      console.error(`  ❌  ${label}: ${e.message}`);
    }
  }
}

async function run() {
  console.log('\n🇬🇧 English Masterclass — DB Migration\n');

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  await exec('em_categories table', `
    CREATE TABLE IF NOT EXISTS em_categories (
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
    )
  `);

  // ── WORDS ─────────────────────────────────────────────────────────────────
  await exec('em_words table', `
    CREATE TABLE IF NOT EXISTS em_words (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id     UUID NOT NULL REFERENCES em_categories(id) ON DELETE CASCADE,
      word            TEXT NOT NULL,
      phonetic        TEXT,          -- British IPA e.g. /ˈwɒtə/
      definition      TEXT,          -- AI-generated British English definition
      example_sentence TEXT,         -- AI-generated example
      audio_url       TEXT,          -- future: stored audio file
      difficulty      TEXT NOT NULL DEFAULT 'Beginner'
                        CHECK (difficulty IN ('Beginner','Intermediate','Advanced')),
      order_index     INT  NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await exec('em_words unique constraint', `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'em_words_category_word_unique'
      ) THEN
        ALTER TABLE em_words ADD CONSTRAINT em_words_category_word_unique
          UNIQUE (category_id, word);
      END IF;
    END $$
  `);

  // ── PER-WORD USER PROGRESS ────────────────────────────────────────────────
  await exec('em_word_progress table', `
    CREATE TABLE IF NOT EXISTS em_word_progress (
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
    )
  `);

  // ── PRACTICE SESSIONS ─────────────────────────────────────────────────────
  await exec('em_practice_sessions table', `
    CREATE TABLE IF NOT EXISTS em_practice_sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id   UUID REFERENCES em_categories(id) ON DELETE SET NULL,
      category_name TEXT,
      total_words   INT NOT NULL DEFAULT 0,
      correct_words INT NOT NULL DEFAULT 0,
      accuracy      NUMERIC(5,2) NOT NULL DEFAULT 0,
      duration_secs INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── AGGREGATE USER STATS ──────────────────────────────────────────────────
  await exec('em_user_stats table', `
    CREATE TABLE IF NOT EXISTS em_user_stats (
      user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      words_learned        INT     NOT NULL DEFAULT 0,
      words_mastered       INT     NOT NULL DEFAULT 0,
      practice_streak      INT     NOT NULL DEFAULT 0,
      longest_streak       INT     NOT NULL DEFAULT 0,
      total_sessions       INT     NOT NULL DEFAULT 0,
      total_practice_secs  INT     NOT NULL DEFAULT 0,
      overall_accuracy     NUMERIC(5,2) NOT NULL DEFAULT 0,
      last_practice_date   DATE,
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── INDEXES ───────────────────────────────────────────────────────────────
  await exec('idx em_words category', `
    CREATE INDEX IF NOT EXISTS idx_em_words_category ON em_words(category_id) WHERE is_active = true
  `);
  await exec('idx em_word_progress user', `
    CREATE INDEX IF NOT EXISTS idx_em_word_progress_user ON em_word_progress(user_id)
  `);
  await exec('idx em_practice_sessions user', `
    CREATE INDEX IF NOT EXISTS idx_em_sessions_user ON em_practice_sessions(user_id, created_at DESC)
  `);

  // ── SEED: INITIAL CATEGORIES ──────────────────────────────────────────────
  console.log('\n  Seeding initial British English categories...');

  const categories = [
    ['Everyday British', 'Common words used in everyday British conversation', 'Beginner',   '🇬🇧', 1],
    ['British Idioms',   'Popular idioms and expressions used in Britain',     'Intermediate','💬', 2],
    ['Formal English',   'Vocabulary for professional and formal settings',    'Intermediate','📝', 3],
    ['British Slang',    'Informal slang terms used across Britain',           'Advanced',    '😄', 4],
    ['Pronunciation',    'Words commonly mispronounced by non-native speakers','Advanced',    '🎙️', 5],
    ['Spelling Patterns','Common British spelling patterns vs American',       'Beginner',    '✏️', 6],
  ];

  for (const [name, description, difficulty, icon, order_index] of categories) {
    await exec(`seed category: ${name}`, `
      INSERT INTO em_categories (name, description, difficulty, icon_emoji, order_index)
      VALUES ('${name}', '${description}', '${difficulty}', '${icon}', ${order_index})
      ON CONFLICT DO NOTHING
    `);
  }

  // ── SEED: INITIAL WORDS ───────────────────────────────────────────────────
  console.log('\n  Seeding initial British English words...');

  // We seed via category name lookup to avoid hardcoding UUIDs
  const wordsByCategoryName = {
    'Everyday British': [
      ['queue',      '/kjuː/',        'A line of people or vehicles waiting for something', 'Please join the queue at the bus stop.'],
      ['fortnight',  '/ˈfɔːtnaɪt/',  'A period of two weeks',                              'I shall return in a fortnight.'],
      ['biscuit',    '/ˈbɪskɪt/',    'A small, flat, crisp, baked unleavened cake',         'Would you like a biscuit with your tea?'],
      ['rubbish',    '/ˈrʌbɪʃ/',     'Waste material; also used to mean nonsense',           'Please put the rubbish in the bin.'],
      ['brilliant',  '/ˈbrɪliənt/',  'Excellent; very good (informal British usage)',        'That film was absolutely brilliant!'],
      ['bloke',      '/bləʊk/',       'An informal British word for a man',                  'He seems like a decent bloke.'],
      ['flat',       '/flæt/',        'An apartment in British English',                     'She lives in a flat in London.'],
      ['jumper',     '/ˈdʒʌmpə/',    'A knitted garment covering the upper body; a sweater', 'It\'s cold — put your jumper on.'],
      ['autumn',     '/ˈɔːtəm/',     'The season between summer and winter',                 'The leaves are beautiful in autumn.'],
      ['pavement',   '/ˈpeɪvmənt/',  'A raised paved path for pedestrians beside a road',   'Please walk on the pavement, not the road.'],
    ],
    'British Idioms': [
      ['chuffed',           '/tʃʌft/',         'Very pleased or satisfied',                            'She was chuffed to bits with her results.'],
      ['gobsmacked',        '/ˈɡɒbsmækt/',     'Utterly astonished; speechless with surprise',         'I was absolutely gobsmacked by the news.'],
      ['over the moon',     '/ˌəʊvə ðə ˈmuːn/','Extremely happy or pleased',                          'He was over the moon when he got the job.'],
      ['taking the mickey', '/ˌteɪkɪŋ ðə ˈmɪki/','Making fun of someone; to mock',                   'Are you taking the mickey out of me?'],
      ['Bob\'s your uncle', '/ˌbɒbz jɔː ˈʌŋkl/','And there it is; it\'s as easy as that',             'Add the flour, stir well, and Bob\'s your uncle!'],
      ['gutted',            '/ˈɡʌtɪd/',        'Bitterly disappointed',                               'I was absolutely gutted when we lost the match.'],
      ['knackered',         '/ˈnækəd/',        'Extremely tired; worn out',                            'I\'m absolutely knackered after that long shift.'],
      ['blimey',            '/ˈblaɪmi/',       'An exclamation of surprise or shock',                  'Blimey, that\'s a lot of money!'],
    ],
    'Formal English': [
      ['commence',     '/kəˈmens/',       'To begin or start something',                          'The ceremony will commence at noon.'],
      ['endeavour',    '/ɪnˈdevə/',       'To try hard to achieve something (British spelling)',  'We shall endeavour to resolve this matter promptly.'],
      ['subsequently', '/ˈsʌbsɪkwəntli/','At a later time; following on from something',         'He subsequently withdrew his application.'],
      ['pertaining',   '/pəˈteɪnɪŋ/',    'Relating to or connected with something',              'Please submit all documents pertaining to the matter.'],
      ['forthwith',    '/ˌfɔːθˈwɪð/',    'Immediately; without delay',                           'You are required to respond forthwith.'],
      ['hitherto',     '/ˌhɪðəˈtuː/',    'Until now; until the point in time being discussed',   'This was a hitherto unseen approach.'],
      ['notwithstanding', '/ˌnɒtwɪθˈstændɪŋ/', 'Despite; in spite of',                         'Notwithstanding the difficulties, progress was made.'],
    ],
    'British Slang': [
      ['cheeky',   '/ˈtʃiːki/',   'Slightly rude but in a playful way',                'Don\'t be cheeky to your teacher!'],
      ['miffed',   '/mɪft/',      'Slightly annoyed or offended',                       'She was a bit miffed at being left out.'],
      ['dodgy',    '/ˈdɒdʒi/',    'Dishonest, illegal, or of poor quality',             'That restaurant looks a bit dodgy to me.'],
      ['peckish',  '/ˈpekɪʃ/',   'Slightly hungry',                                    'I\'m feeling a bit peckish — fancy a biscuit?'],
      ['waffle',   '/ˈwɒfl/',     'To talk at length without saying anything meaningful','He waffled on for an hour without making his point.'],
      ['naff',     '/næf/',        'Lacking taste or style; inferior',                   'That outfit is a bit naff, isn\'t it?'],
      ['faff',     '/fæf/',        'To waste time on unimportant things',                'Stop faffing about and get ready!'],
    ],
    'Pronunciation': [
      ['colonel',    '/ˈkɜːnl/',       'A senior military officer rank',                       'The colonel gave the order to advance.'],
      ['worcestershire', '/ˈwʊstəʃə/', 'A county in England; also a famous sauce',             'Please pass the Worcestershire sauce.'],
      ['choir',      '/ˈkwaɪə/',       'A group of singers who perform together',               'She sings in the school choir.'],
      ['Wednesday',  '/ˈwenzdɪ/',      'The day of the week between Tuesday and Thursday',     'The meeting is scheduled for Wednesday.'],
      ['February',   '/ˈfebruəri/',    'The second month of the year',                         'February is the shortest month.'],
      ['Leicester',  '/ˈlɛstə/',       'A city in the East Midlands of England',               'Leicester is known for its football club.'],
      ['Edinburgh',  '/ˈedɪnbrə/',     'The capital city of Scotland',                         'Edinburgh Castle sits atop an ancient volcano.'],
    ],
    'Spelling Patterns': [
      ['colour',     '/ˈkʌlə/',        'The British spelling of color',                        'The colour of the sky is a deep blue.'],
      ['honour',     '/ˈɒnə/',         'The British spelling of honor; high respect',           'It is an honour to meet you.'],
      ['realise',    '/ˈrɪəlaɪz/',     'The British spelling of realize; to become aware of',  'I didn\'t realise you were here already.'],
      ['centre',     '/ˈsentə/',       'The British spelling of center; the middle point',      'Meet me at the town centre at three.'],
      ['defence',    '/dɪˈfens/',      'The British spelling of defense; protection',           'The country\'s defence budget has increased.'],
      ['travelled',  '/ˈtrævld/',      'Past tense of travel (British doubles the l)',          'She had travelled extensively across Europe.'],
      ['catalogue',  '/ˈkætəlɒɡ/',    'The British spelling of catalog; a list of items',      'Please refer to the product catalogue.'],
      ['licence',    '/ˈlaɪsns/',      'British noun form (license is the verb)',               'You need a licence to drive in the UK.'],
    ],
  };

  for (const [categoryName, words] of Object.entries(wordsByCategoryName)) {
    for (const [word, phonetic, definition, example] of words) {
      const safeWord       = word.replace(/'/g, "''");
      const safePhonetic   = phonetic.replace(/'/g, "''");
      const safeDef        = definition.replace(/'/g, "''");
      const safeExample    = example.replace(/'/g, "''");
      await exec(`seed word: ${word}`, `
        INSERT INTO em_words (category_id, word, phonetic, definition, example_sentence)
        SELECT c.id, '${safeWord}', '${safePhonetic}', '${safeDef}', '${safeExample}'
        FROM em_categories c
        WHERE c.name = '${categoryName}'
        LIMIT 1
        ON CONFLICT (category_id, word) DO NOTHING
      `);
    }
  }

  console.log('\n✅ English Masterclass migration complete.\n');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
