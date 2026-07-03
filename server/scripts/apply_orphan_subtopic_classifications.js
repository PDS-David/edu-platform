#!/usr/bin/env node
// server/scripts/apply_orphan_subtopic_classifications.js
//
// Restores subtopic_id on orphaned questions using the classification
// backup provided by Dawood (server/scripts/data/orphan_questions_classified_MASTER.csv).
//
// BACKGROUND: a production dump (2026-07-03) showed 965 of 1140 questions
// (85%) had subtopic_id = NULL. GET /questions/random was recently fixed
// to correctly EXCLUDE orphaned questions from subject-filtered results
// (previously they leaked into every subject's pool — the "GNS practice
// showed Chemistry/Physics/Biology questions" bug). That fix is correct,
// but its side effect is that most subjects/subtopics now have very few
// or zero eligible questions, producing "No questions available for this
// subtopic/mock exam" — because the questions were never really lost,
// just never linked to a subtopic in the first place.
//
// The attached CSV is the output of an AI classification pass over all
// 965 orphans, reviewed down to a `final_subtopic_id` for the ones with
// high enough confidence (576 of 965 in the MASTER version — the rest are
// left for manual review and are simply skipped here).
//
// Of the 761 orphans that are already status='approved' (i.e. content
// that already passed review and is just missing its subtopic link),
// this script is what actually makes them visible to students again.
//
// SAFE BY DEFAULT: dry run unless --apply is passed. Never overwrites a
// subtopic_id that's already set (only touches WHERE subtopic_id IS NULL),
// so it's safe to re-run and safe even if some rows were already fixed
// manually since the CSV was generated.
//
// Run:
//   node server/scripts/apply_orphan_subtopic_classifications.js            # dry run
//   node server/scripts/apply_orphan_subtopic_classifications.js --apply    # commit
//   docker exec aischool_api node /app/scripts/apply_orphan_subtopic_classifications.js --apply

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APPLY    = process.argv.includes('--apply');
const CSV_PATH = path.join(__dirname, 'data', 'orphan_questions_classified_MASTER.csv');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// Minimal RFC4180 CSV parser — handles quoted fields containing commas,
// quotes ("" escape), and newlines, which plain String.split(',') can't
// (several question_text values in this CSV contain commas).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // skip, \n handles the row break
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0] !== '');
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '▶ Running in APPLY mode — changes will be committed.\n'
                       : '▶ Running in DRY-RUN mode — no changes will be made. Pass --apply to commit.\n');

    const raw  = fs.readFileSync(CSV_PATH, 'utf8');
    const rows = parseCSV(raw);
    const header = rows[0];
    const col = name => header.indexOf(name);
    const iId = col('id'), iFinal = col('final_subtopic_id'),
          iSubject = col('predicted_subject'), iName = col('predicted_subtopic_name');

    if ([iId, iFinal, iSubject, iName].some(i => i === -1)) {
      throw new Error(`CSV header missing expected column(s). Found: ${header.join(', ')}`);
    }

    const classifications = rows.slice(1)
      .map(r => ({
        id: parseInt(r[iId], 10),
        finalSubtopicId: r[iFinal] ? parseInt(parseFloat(r[iFinal]), 10) : null,
        subject: r[iSubject],
        subtopicName: r[iName],
      }))
      .filter(r => Number.isInteger(r.id) && Number.isInteger(r.finalSubtopicId));

    console.log(`Loaded ${rows.length - 1} classified rows from CSV; ${classifications.length} have a final_subtopic_id ready to apply.`);

    // Validate every referenced subtopic actually exists before touching anything.
    const subtopicIds = [...new Set(classifications.map(c => c.finalSubtopicId))];
    const { rows: existingSubtopics } = await client.query(
      `SELECT id FROM subtopics WHERE id = ANY($1::integer[])`, [subtopicIds]
    );
    const existingSet = new Set(existingSubtopics.map(r => r.id));
    const invalid = classifications.filter(c => !existingSet.has(c.finalSubtopicId));
    const valid   = classifications.filter(c => existingSet.has(c.finalSubtopicId));
    if (invalid.length) {
      console.log(`⚠ ${invalid.length} row(s) reference a subtopic_id not found in subtopics — will be skipped:`);
      for (const c of invalid.slice(0, 10)) {
        console.log(`   question ${c.id} -> subtopic ${c.finalSubtopicId} ("${c.subtopicName}")`);
      }
      if (invalid.length > 10) console.log(`   ...and ${invalid.length - 10} more`);
      console.log('');
    }

    // Always run in a transaction, even dry-run — dry run gets its accurate
    // preview by rolling back rather than skipping the writes.
    await client.query('BEGIN');

    let applied = 0, alreadySetOrMissing = 0;
    const bySubject = {};
    for (const c of valid) {
      const r = await client.query(
        `UPDATE questions SET subtopic_id = $1, updated_at = NOW()
          WHERE id = $2 AND subtopic_id IS NULL
          RETURNING status`,
        [c.finalSubtopicId, c.id]
      );
      if (r.rowCount) {
        applied++;
        bySubject[c.subject] = (bySubject[c.subject] || 0) + 1;
      } else {
        alreadySetOrMissing++;
      }
    }

    console.log('Summary:');
    console.log(`  Questions given a subtopic_id: ${applied}`);
    console.log(`  Skipped (already set, or id no longer exists): ${alreadySetOrMissing}`);
    console.log(`  Skipped (subtopic_id in CSV not found in DB): ${invalid.length}`);
    console.log(`  Still unclassified after this run: ${rows.length - 1 - classifications.length} (need manual review — see review_tier column in the CSV)`);
    console.log('');
    console.log('  By subject:');
    for (const [subj, n] of Object.entries(bySubject).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${subj}: ${n}`);
    }
    console.log('');

    if (APPLY) {
      await client.query('COMMIT');
      console.log('✅ Committed.');
    } else {
      await client.query('ROLLBACK');
      console.log('This was a dry run — all of the above was rolled back, nothing was changed.');
      console.log('Re-run with --apply to commit these changes for real.');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(APPLY
      ? '❌ Error — rolled back all changes. Nothing was modified.'
      : '❌ Error during dry run (rolled back, nothing was ever going to be kept):');
    console.error(`   ${e.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
