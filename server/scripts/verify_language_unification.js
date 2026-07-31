#!/usr/bin/env node
// server/scripts/verify_language_unification.js
//
// Run AFTER migrate_language_unification.js. Confirms zero data loss:
// every em_* row count matches its lang_* (language='english') count,
// and a spot-check of specific rows (not just counts) matches field-by-field.
// Exits non-zero on any mismatch -- do not drop em_* tables until this passes.

'use strict';
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

let failures = 0;

async function compareCounts(label, emTable, langTable, langFilter = `language = 'english'`) {
  const [{ rows: [em] }, { rows: [lang] }] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n FROM ${emTable}`),
    pool.query(`SELECT count(*)::int AS n FROM ${langTable} WHERE ${langFilter}`),
  ]);
  const ok = em.n === lang.n;
  console.log(`  ${ok ? '✅' : '❌'}  ${label}: em=${em.n} lang=${lang.n}`);
  if (!ok) failures++;
}

async function spotCheck(label, sql, expectRows) {
  const { rows } = await pool.query(sql);
  const ok = rows.length === expectRows && rows.every((r) => Object.values(r).every((v) => v === true));
  console.log(`  ${ok ? '✅' : '❌'}  ${label}`);
  if (!ok) { failures++; console.log('       ', JSON.stringify(rows)); }
}

async function run() {
  console.log('\n🔍 Language Unification — Verification\n');

  await compareCounts('categories',              'em_categories',              'lang_categories');
  await compareCounts('words',                    'em_words',                   'lang_words w JOIN lang_categories c ON c.id = w.category_id');
  await compareCounts('practice_sessions',        'em_practice_sessions',       'lang_practice_sessions');
  await compareCounts('pronunciation_attempts',   'em_pronunciation_attempts',  'lang_pronunciation_attempts');
  await compareCounts('writing_submissions',      'em_writing_submissions',     'lang_writing_submissions');
  await compareCounts('word_progress',            'em_word_progress',          'lang_word_progress');
  await compareCounts('user_stats',               'em_user_stats',             'lang_user_stats');

  await spotCheck(
    'every em_category row matches its lang_categories row exactly (id, name, difficulty)',
    `SELECT (c.name = lc.name AND c.difficulty::text = lc.difficulty::text AND c.order_index = lc.order_index) AS match
       FROM em_categories c JOIN lang_categories lc ON lc.id = c.id`,
    (await pool.query('SELECT count(*)::int n FROM em_categories')).rows[0].n
  );

  await spotCheck(
    'every em_word row matches its lang_words row exactly (word, phonetic, definition)',
    `SELECT (w.word = lw.word AND COALESCE(w.phonetic,'')=COALESCE(lw.phonetic,'') AND COALESCE(w.definition,'')=COALESCE(lw.definition,'')) AS match
       FROM em_words w JOIN lang_words lw ON lw.id = w.id`,
    (await pool.query('SELECT count(*)::int n FROM em_words')).rows[0].n
  );

  await spotCheck(
    'registration timestamps preserved exactly (em_registered_at -> user_language_registrations)',
    `SELECT (u.em_registered_at = r.registered_at) AS match
       FROM users u JOIN user_language_registrations r
         ON r.user_id = u.id AND r.language = 'english'
      WHERE u.em_registered_at IS NOT NULL`,
    (await pool.query(`SELECT count(*)::int n FROM users WHERE em_registered_at IS NOT NULL`)).rows[0].n
  );

  await spotCheck(
    'schools.enable_em -> school_enabled_languages(english) preserved',
    `SELECT EXISTS (SELECT 1 FROM school_enabled_languages sel WHERE sel.school_id = s.id AND sel.language = 'english') AS match
       FROM schools s WHERE s.enable_em = true`,
    (await pool.query(`SELECT count(*)::int n FROM schools WHERE enable_em = true`)).rows[0].n
  );

  console.log(failures === 0
    ? '\n✅ All checks passed — zero data loss confirmed.\n'
    : `\n❌ ${failures} check(s) failed — do NOT drop em_* tables. Investigate above.\n`);

  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
