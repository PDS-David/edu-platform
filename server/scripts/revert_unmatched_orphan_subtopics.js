#!/usr/bin/env node
// server/scripts/revert_unmatched_orphan_subtopics.js
//
// Piece 1 of reconciling apply_orphan_subtopic_classifications.js (already
// run against production, commit 61c5178) against the independently-reviewed
// classification on branch chore/orphan-question-subtopic-backfill.
//
// The two files classify the exact same 965 orphan question IDs, but for
// question ids 439 and 270, MASTER.csv (the one already applied to
// production) forced a best-guess subtopic assignment even though the
// branch's human-reviewed pass explicitly found NO real matching subtopic
// exists in the curriculum for either question:
//   - id 439: a Physics question about stable equilibrium/centre of
//     gravity — no such subtopic exists anywhere in the Physics taxonomy.
//   - id 270: a Chemistry question about fractional distillation — no
//     separation-techniques subtopic exists in the Chemistry taxonomy.
// Production currently has these forced into subtopic 215 and 33
// respectively, which is worse than leaving them unclassified: a student
// studying those subtopics would see unrelated content.
//
// This reverts exactly those 2 rows to subtopic_id = NULL, and nothing
// else. It does NOT re-run the classification for any other row.
//
// SAFE BY DEFAULT: dry run unless --apply is passed (same pattern as
// apply_orphan_subtopic_classifications.js). Only touches a row if its
// subtopic_id currently matches the exact value MASTER.csv assigned, so
// it can't accidentally clobber a value someone has since fixed by hand.
//
// Run:
//   node server/scripts/revert_unmatched_orphan_subtopics.js            # dry run
//   node server/scripts/revert_unmatched_orphan_subtopics.js --apply    # commit
//   docker exec aischool_api node /app/scripts/revert_unmatched_orphan_subtopics.js --apply

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

// [question id, subtopic_id it was force-assigned to by MASTER.csv, reason]
const REVERTS = [
  { id: 439, expectedCurrent: 215, reason: 'Physics: stable equilibrium/centre of gravity — no matching subtopic in curriculum' },
  { id: 270, expectedCurrent: 33,  reason: 'Chemistry: fractional distillation — no separation-techniques subtopic in curriculum' },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '▶ Running in APPLY mode — changes will be committed.\n'
                       : '▶ Running in DRY-RUN mode — no changes will be made. Pass --apply to commit.\n');

    await client.query('BEGIN');

    let reverted = 0, skippedMismatch = 0;
    for (const r of REVERTS) {
      const { rows } = await client.query(`SELECT subtopic_id FROM questions WHERE id = $1`, [r.id]);
      if (!rows.length) {
        console.log(`⚠ question ${r.id} no longer exists — skipping.`);
        continue;
      }
      const current = rows[0].subtopic_id;
      if (current !== r.expectedCurrent) {
        console.log(`⚠ question ${r.id}: expected subtopic_id ${r.expectedCurrent}, found ${current} — someone already changed this, skipping to avoid clobbering it.`);
        skippedMismatch++;
        continue;
      }
      await client.query(
        `UPDATE questions SET subtopic_id = NULL, updated_at = NOW() WHERE id = $1`,
        [r.id]
      );
      console.log(`✓ question ${r.id}: reverted subtopic_id ${r.expectedCurrent} -> NULL (${r.reason})`);
      reverted++;
    }

    console.log('');
    console.log('Summary:');
    console.log(`  Reverted to NULL: ${reverted}`);
    console.log(`  Skipped (already changed by someone else): ${skippedMismatch}`);
    console.log('');

    if (APPLY) {
      await client.query('COMMIT');
      console.log('✅ Committed.');
    } else {
      await client.query('ROLLBACK');
      console.log('This was a dry run — rolled back, nothing was changed. Re-run with --apply to commit.');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error — rolled back. Nothing was modified.');
    console.error(`   ${e.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
