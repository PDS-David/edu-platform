#!/usr/bin/env node
// server/scripts/check_language_consistency.js
//
// "Which Language Masterclass languages are live" is decided
// independently in three places, and nothing used to check they
// agreed:
//   1. ENABLED_LANGUAGES (Set)      in server/routes/languageMasterclassRoutes.js
//   2. LANGUAGE_META[code].enabled  in client/src/pages/lang/constants.js
//   3. ADMIN_LANGUAGES (array)      in client/src/pages/AdminLanguageMasterclass.jsx
//      (deliberately excludes 'english', which has its own dedicated
//      AdminEnglishMasterclass.jsx admin page — that's expected, not a
//      mismatch)
//
// This script parses all three straight out of the source files (no
// build step, no live server needed) and fails loudly if they've drifted.
// If DATABASE_URL is set, it also cross-checks that every backend-enabled
// language has supports_pronunciation = true (pronunciation is the one
// exercise every language route treats as mandatory to advance a
// session — see LangPracticeSession.jsx's "Next word" gate), since an
// enabled language with no supported exercise at all would strand
// students entirely. The DB check is skipped (not failed) if no
// DATABASE_URL is available, e.g. running this in CI without a DB.
//
// Run: node scripts/check_language_consistency.js
// (wired up as `npm run check:languages` in package.json)

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ROUTES_FILE = path.join(ROOT, 'server/routes/languageMasterclassRoutes.js');
const CONSTANTS_FILE = path.join(ROOT, 'client/src/pages/lang/constants.js');
const ADMIN_FILE = path.join(ROOT, 'client/src/pages/AdminLanguageMasterclass.jsx');

const ADMIN_EXCLUDES_ENGLISH_BY_DESIGN = true; // English has its own AdminEnglishMasterclass.jsx

function readFile(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Expected file not found: ${p}`);
  }
  return fs.readFileSync(p, 'utf8');
}

function parseEnabledLanguages(src) {
  const m = src.match(/const ENABLED_LANGUAGES\s*=\s*new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error('Could not find ENABLED_LANGUAGES in ' + ROUTES_FILE);
  return m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
}

function parseLanguageMetaEnabled(src) {
  // Pull each `<code>: { ... enabled: <bool> ... }` block. Simple and
  // deliberately not a full JS parser — this file's shape is stable and
  // hand-written, and a false negative here (failing to match a language)
  // is preferable to silently skipping a real drift, so we fail loudly
  // if the expected block for any known language code is missing rather
  // than assuming "no match = not present".
  const result = {};
  const codeBlockRe = /(\w+):\s*\{([^}]*)\}/g;
  let m;
  while ((m = codeBlockRe.exec(src))) {
    const [, code, body] = m;
    const enabledMatch = body.match(/enabled:\s*(true|false)/);
    if (enabledMatch) {
      result[code] = enabledMatch[1] === 'true';
    }
  }
  return result;
}

function parseAdminLanguages(src) {
  const m = src.match(/const ADMIN_LANGUAGES\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('Could not find ADMIN_LANGUAGES in ' + ADMIN_FILE);
  return m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
}

async function checkDbSupportsPronunciation(enabledLanguages) {
  if (!process.env.DATABASE_URL) {
    console.log('  ⏭️   DATABASE_URL not set — skipping DB supports_pronunciation check');
    return [];
  }
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  try {
    const { rows } = await pool.query(
      `SELECT code, supports_pronunciation FROM languages WHERE code = ANY($1)`,
      [enabledLanguages]
    );
    const byCode = Object.fromEntries(rows.map(r => [r.code, r.supports_pronunciation]));
    const problems = [];
    for (const lang of enabledLanguages) {
      if (!(lang in byCode)) {
        problems.push(`'${lang}' is in ENABLED_LANGUAGES but has no row in the languages table at all`);
      } else if (!byCode[lang]) {
        problems.push(`'${lang}' is in ENABLED_LANGUAGES but supports_pronunciation is false — students would be stuck, since pronunciation is required to advance a session (see LangPracticeSession.jsx's "Next word" gate)`);
      }
    }
    return problems;
  } finally {
    await pool.end();
  }
}

async function main() {
  const problems = [];

  const enabledLanguages = parseEnabledLanguages(readFile(ROUTES_FILE));
  const languageMetaEnabled = parseLanguageMetaEnabled(readFile(CONSTANTS_FILE));
  const adminLanguages = parseAdminLanguages(readFile(ADMIN_FILE));

  const enabledSet = new Set(enabledLanguages);
  const adminSet = new Set(adminLanguages);

  // 1. Every language ENABLED_LANGUAGES lists must be enabled:true in LANGUAGE_META, and vice versa.
  for (const code of Object.keys(languageMetaEnabled)) {
    const backendEnabled = enabledSet.has(code);
    const frontendEnabled = languageMetaEnabled[code];
    if (backendEnabled !== frontendEnabled) {
      problems.push(
        `'${code}': backend ENABLED_LANGUAGES says ${backendEnabled}, frontend LANGUAGE_META.enabled says ${frontendEnabled} — these must match.`
      );
    }
  }
  for (const code of enabledSet) {
    if (!(code in languageMetaEnabled)) {
      problems.push(`'${code}' is in ENABLED_LANGUAGES but has no LANGUAGE_META entry in constants.js at all.`);
    }
  }

  // 2. Every backend-enabled language except English should be manageable in the admin CMS.
  for (const code of enabledSet) {
    if (code === 'english' && ADMIN_EXCLUDES_ENGLISH_BY_DESIGN) continue;
    if (!adminSet.has(code)) {
      problems.push(`'${code}' is in ENABLED_LANGUAGES but missing from ADMIN_LANGUAGES in AdminLanguageMasterclass.jsx — an admin won't be able to manage its content.`);
    }
  }
  for (const code of adminSet) {
    if (!enabledSet.has(code)) {
      problems.push(`'${code}' is in ADMIN_LANGUAGES but not in ENABLED_LANGUAGES — admins can edit content for a language students can't reach yet (may be intentional pre-launch prep, but flagging it).`);
    }
  }

  // 3. Optional live-DB check.
  const dbProblems = await checkDbSupportsPronunciation(enabledLanguages);
  problems.push(...dbProblems);

  if (problems.length) {
    console.error(`\n❌  Language consistency check failed (${problems.length} issue(s)):\n`);
    problems.forEach(p => console.error(`   - ${p}`));
    console.error('');
    process.exit(1);
  }

  console.log(`✅  Language consistency check passed. Enabled languages: ${enabledLanguages.join(', ')}`);
}

main().catch(err => {
  console.error('❌  Language consistency check errored:', err.message);
  process.exit(1);
});
