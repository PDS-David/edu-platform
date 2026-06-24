-- migration_english_masterclass.sql
-- English Masterclass module — 5 tables + indexes + seed data.
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- ── CATEGORIES ────────────────────────────────────────────────────────────────
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
);

-- ── WORDS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS em_words (
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
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'em_words_category_word_unique'
  ) THEN
    ALTER TABLE em_words ADD CONSTRAINT em_words_category_word_unique
      UNIQUE (category_id, word);
  END IF;
END $$;

-- ── PER-WORD USER PROGRESS ────────────────────────────────────────────────────
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
);

-- ── PRACTICE SESSIONS ─────────────────────────────────────────────────────────
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
);

-- ── AGGREGATE USER STATS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS em_user_stats (
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
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_em_words_category
  ON em_words(category_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_em_word_progress_user
  ON em_word_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_em_sessions_user
  ON em_practice_sessions(user_id, created_at DESC);

-- ── SEED: CATEGORIES ──────────────────────────────────────────────────────────
INSERT INTO em_categories (name, description, difficulty, icon_emoji, order_index)
VALUES
  ('Everyday British',  'Common words used in everyday British conversation',  'Beginner',     '🇬🇧', 1),
  ('British Idioms',    'Popular idioms and expressions used in Britain',      'Intermediate', '💬',  2),
  ('Formal English',    'Vocabulary for professional and formal settings',     'Intermediate', '📝',  3),
  ('British Slang',     'Informal slang terms used across Britain',            'Advanced',     '😄',  4),
  ('Pronunciation',     'Words commonly mispronounced by non-native speakers', 'Advanced',     '🎙️', 5),
  ('Spelling Patterns', 'Common British spelling patterns vs American',        'Beginner',     '✏️', 6)
ON CONFLICT DO NOTHING;

-- ── SEED: WORDS ───────────────────────────────────────────────────────────────
INSERT INTO em_words (category_id, word, phonetic, definition, example_sentence)
SELECT c.id, v.word, v.phonetic, v.definition, v.example_sentence
FROM em_categories c
JOIN (VALUES
  ('Everyday British', 'queue',     '/kjuː/',        'A line of people or vehicles waiting for something',           'Please join the queue at the bus stop.'),
  ('Everyday British', 'fortnight', '/ˈfɔːtnaɪt/',  'A period of two weeks',                                        'I shall return in a fortnight.'),
  ('Everyday British', 'biscuit',   '/ˈbɪskɪt/',    'A small, flat, crisp, baked unleavened cake',                  'Would you like a biscuit with your tea?'),
  ('Everyday British', 'rubbish',   '/ˈrʌbɪʃ/',     'Waste material; also used to mean nonsense',                   'Please put the rubbish in the bin.'),
  ('Everyday British', 'brilliant', '/ˈbrɪliənt/',  'Excellent; very good (informal British usage)',                 'That film was absolutely brilliant!'),
  ('Everyday British', 'bloke',     '/bləʊk/',       'An informal British word for a man',                           'He seems like a decent bloke.'),
  ('Everyday British', 'flat',      '/flæt/',        'An apartment in British English',                              'She lives in a flat in London.'),
  ('Everyday British', 'jumper',    '/ˈdʒʌmpə/',    'A knitted garment covering the upper body; a sweater',          'It''s cold — put your jumper on.'),
  ('Everyday British', 'autumn',    '/ˈɔːtəm/',     'The season between summer and winter',                          'The leaves are beautiful in autumn.'),
  ('Everyday British', 'pavement',  '/ˈpeɪvmənt/',  'A raised paved path for pedestrians beside a road',            'Please walk on the pavement, not the road.'),

  ('British Idioms', 'chuffed',           '/tʃʌft/',               'Very pleased or satisfied',                                    'She was chuffed to bits with her results.'),
  ('British Idioms', 'gobsmacked',        '/ˈɡɒbsmækt/',           'Utterly astonished; speechless with surprise',                 'I was absolutely gobsmacked by the news.'),
  ('British Idioms', 'over the moon',     '/ˌəʊvə ðə ˈmuːn/',     'Extremely happy or pleased',                                   'He was over the moon when he got the job.'),
  ('British Idioms', 'taking the mickey', '/ˌteɪkɪŋ ðə ˈmɪki/',   'Making fun of someone; to mock',                               'Are you taking the mickey out of me?'),
  ('British Idioms', 'gutted',            '/ˈɡʌtɪd/',              'Bitterly disappointed',                                        'I was absolutely gutted when we lost the match.'),
  ('British Idioms', 'knackered',         '/ˈnækəd/',              'Extremely tired; worn out',                                    'I''m absolutely knackered after that long shift.'),
  ('British Idioms', 'blimey',            '/ˈblaɪmi/',             'An exclamation of surprise or shock',                          'Blimey, that''s a lot of money!'),

  ('Formal English', 'commence',        '/kəˈmens/',         'To begin or start something',                                 'The ceremony will commence at noon.'),
  ('Formal English', 'endeavour',       '/ɪnˈdevə/',         'To try hard to achieve something (British spelling)',          'We shall endeavour to resolve this matter promptly.'),
  ('Formal English', 'subsequently',    '/ˈsʌbsɪkwəntli/',  'At a later time; following on from something',                'He subsequently withdrew his application.'),
  ('Formal English', 'pertaining',      '/pəˈteɪnɪŋ/',      'Relating to or connected with something',                     'Please submit all documents pertaining to the matter.'),
  ('Formal English', 'forthwith',       '/ˌfɔːθˈwɪð/',      'Immediately; without delay',                                  'You are required to respond forthwith.'),
  ('Formal English', 'hitherto',        '/ˌhɪðəˈtuː/',      'Until now; until the point in time being discussed',          'This was a hitherto unseen approach.'),
  ('Formal English', 'notwithstanding', '/ˌnɒtwɪθˈstændɪŋ/','Despite; in spite of',                                       'Notwithstanding the difficulties, progress was made.'),

  ('British Slang', 'cheeky',  '/ˈtʃiːki/',  'Slightly rude but in a playful way',                    'Don''t be cheeky to your teacher!'),
  ('British Slang', 'miffed',  '/mɪft/',      'Slightly annoyed or offended',                          'She was a bit miffed at being left out.'),
  ('British Slang', 'dodgy',   '/ˈdɒdʒi/',   'Dishonest, illegal, or of poor quality',                'That restaurant looks a bit dodgy to me.'),
  ('British Slang', 'peckish', '/ˈpekɪʃ/',   'Slightly hungry',                                       'I''m feeling a bit peckish — fancy a biscuit?'),
  ('British Slang', 'waffle',  '/ˈwɒfl/',    'To talk at length without saying anything meaningful',   'He waffled on for an hour without making his point.'),
  ('British Slang', 'naff',    '/næf/',       'Lacking taste or style; inferior',                      'That outfit is a bit naff, isn''t it?'),
  ('British Slang', 'faff',    '/fæf/',       'To waste time on unimportant things',                   'Stop faffing about and get ready!'),

  ('Pronunciation', 'colonel',       '/ˈkɜːnl/',        'A senior military officer rank',                           'The colonel gave the order to advance.'),
  ('Pronunciation', 'worcestershire', '/ˈwʊstəʃə/',     'A county in England; also a famous sauce',                 'Please pass the Worcestershire sauce.'),
  ('Pronunciation', 'choir',         '/ˈkwaɪə/',        'A group of singers who perform together',                  'She sings in the school choir.'),
  ('Pronunciation', 'Wednesday',     '/ˈwenzdɪ/',       'The day of the week between Tuesday and Thursday',         'The meeting is scheduled for Wednesday.'),
  ('Pronunciation', 'February',      '/ˈfebruəri/',     'The second month of the year',                             'February is the shortest month.'),
  ('Pronunciation', 'Leicester',     '/ˈlɛstə/',        'A city in the East Midlands of England',                   'Leicester is known for its football club.'),
  ('Pronunciation', 'Edinburgh',     '/ˈedɪnbrə/',      'The capital city of Scotland',                             'Edinburgh Castle sits atop an ancient volcano.'),

  ('Spelling Patterns', 'colour',    '/ˈkʌlə/',      'The British spelling of color',                             'The colour of the sky is a deep blue.'),
  ('Spelling Patterns', 'honour',    '/ˈɒnə/',       'The British spelling of honor; high respect',               'It is an honour to meet you.'),
  ('Spelling Patterns', 'realise',   '/ˈrɪəlaɪz/',  'The British spelling of realize; to become aware of',       'I didn''t realise you were here already.'),
  ('Spelling Patterns', 'centre',    '/ˈsentə/',     'The British spelling of center; the middle point',           'Meet me at the town centre at three.'),
  ('Spelling Patterns', 'defence',   '/dɪˈfens/',    'The British spelling of defense; protection',               'The country''s defence budget has increased.'),
  ('Spelling Patterns', 'travelled', '/ˈtrævld/',    'Past tense of travel (British doubles the l)',               'She had travelled extensively across Europe.'),
  ('Spelling Patterns', 'catalogue', '/ˈkætəlɒɡ/',  'The British spelling of catalog; a list of items',          'Please refer to the product catalogue.'),
  ('Spelling Patterns', 'licence',   '/ˈlaɪsns/',   'British noun form (license is the verb)',                   'You need a licence to drive in the UK.')
) AS v(category_name, word, phonetic, definition, example_sentence)
  ON c.name = v.category_name
ON CONFLICT (category_id, word) DO NOTHING;
