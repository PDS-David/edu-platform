#!/usr/bin/env node
// server/scripts/seed_new_languages.js
//
// Seeds the same deliberately-incomplete Beginner-only shape already
// established for French/German (see run_complete_migration.js) for the
// 5 new languages: Mandarin, Arabic, Spanish, Swahili, Yoruba. Per the
// consolidation prompt: do not seed more than this without checking with
// Da first -- the incompleteness is intentional, not a gap to fill in.
//
// Safe to re-run — ON CONFLICT / WHERE NOT EXISTS guards throughout.
// Run inside the API container:
//   docker exec aischool_api node /app/scripts/seed_new_languages.js

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
    console.error(`  ❌  ${label}`);
    console.error(`       ${e.message}`);
  }
}

// Same 8-word shape as French/German: Hello, Thank you, Yes, No, Please,
// Goodbye, Water, Bread. icon_emoji reused identically to French/German's
// seed for the same concepts, so the UI's icon language is consistent
// across all 8 languages.
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

async function run() {
  console.log('\n🌍 Seeding content for 5 new languages\n');

  // Pre-flight: confirm French/German content is already present rather
  // than assuming — the prompt asked to "confirm" it, not re-seed it.
  const { rows: existing } = await pool.query(
    `SELECT language, count(*)::int AS n FROM lang_words w
       JOIN lang_categories c ON c.id = w.category_id
      WHERE c.language IN ('french','german') GROUP BY language`
  );
  console.log('  ℹ️   existing French/German word counts:', JSON.stringify(existing));
  if (!existing.some(r => r.language === 'french') || !existing.some(r => r.language === 'german')) {
    console.warn('  ⚠️   French or German has zero words — expected content from run_complete_migration.js is missing. Investigate before relying on this script alone.');
  }

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

  console.log('\n✅ New-language content seed complete.\n');
  await pool.end();
}

function LANGUAGE_LABEL(code) {
  return { mandarin: 'Mandarin', arabic: 'Arabic', spanish: 'Spanish', swahili: 'Swahili', yoruba: 'Yoruba' }[code];
}

run().catch((e) => { console.error(e); process.exit(1); });
