#!/usr/bin/env node
// server/scripts/dedupe_em_categories.js
//
// ONE-OFF cleanup for the em_categories duplicate-row bug.
//
// ROOT CAUSE: em_categories had no unique constraint on (name, difficulty).
// The seed step in run_complete_migration.js used 'ON CONFLICT DO NOTHING'
// with nothing to key off, so every deploy (deploy.sh runs that migration
// unconditionally) inserted 6 more duplicate categories — and, because
// em_words seeding joins on category name, each duplicate category also
// got its own duplicate set of ~10 words. This is what produced the wall
// of ~40 identical "Everyday British" cards on the student dashboard.
//
// This script merges duplicates safely:
//   1. Groups em_categories by (name, difficulty).
//   2. Picks a canonical row per group (oldest by created_at, tie-broken
//      by lowest order_index then id) — original content, not a re-seed.
//   3. Migrates em_words from duplicate categories into the canonical
//      category, skipping any that are exact text duplicates of a word
//      the canonical category already has (ON CONFLICT DO NOTHING).
//   4. Migrates em_word_progress for the words that get skipped as
//      duplicates, MERGING attempt counts / mastered flag / last_practiced
//      into the canonical word's progress row so no student progress is
//      lost — rather than just deleting it via cascade.
//   5. Repoints em_practice_sessions.category_id from duplicates to the
//      canonical category (session history is preserved either way via
//      the denormalised category_name column, but this keeps the FK
//      meaningful for future queries).
//   6. Deletes the now-empty duplicate category rows (which cascades to
//      delete their now-empty em_words rows).
//
// SAFE BY DEFAULT: running with no flags is a DRY RUN — it reports exactly
// what it would do and changes nothing. Pass --apply to actually run it,
// inside a single transaction that rolls back on any error.
//
// Run:
//   node server/scripts/dedupe_em_categories.js            # dry run (report only)
//   node server/scripts/dedupe_em_categories.js --apply    # actually merge
//   docker exec aischool_api node /app/scripts/dedupe_em_categories.js --apply

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '▶ Running in APPLY mode — changes will be committed.\n'
                       : '▶ Running in DRY-RUN mode — no changes will be made. Pass --apply to commit.\n');

    // ── 1. Find duplicate groups ────────────────────────────────────────────
    const { rows: groups } = await client.query(`
      SELECT name, difficulty, array_agg(id ORDER BY created_at ASC, order_index ASC, id ASC) AS ids,
             COUNT(*)::int AS n
        FROM em_categories
       GROUP BY name, difficulty
      HAVING COUNT(*) > 1
       ORDER BY name, difficulty
    `);

    if (groups.length === 0) {
      console.log('✅ No duplicate categories found. Nothing to do.');
      return;
    }

    console.log(`Found ${groups.length} duplicate group(s):\n`);
    for (const g of groups) {
      console.log(`  • "${g.name}" (${g.difficulty}) — ${g.n} rows, keeping ${g.ids[0]}`);
    }
    console.log('');

    // Always run inside a transaction, even in dry-run mode — dry run gets
    // its accurate preview numbers by actually running the writes and then
    // rolling back, rather than skipping them (which would require
    // duplicating all this logic as read-only SQL and risk drifting out of
    // sync with the real mutation path).
    await client.query('BEGIN');

    let totalWordsMerged = 0, totalWordsDropped = 0, totalProgressMerged = 0,
        totalSessionsRepointed = 0, totalCategoriesRemoved = 0;

    for (const g of groups) {
      const [canonicalId, ...dupIds] = g.ids;

      // ── 2. Migrate words: insert into canonical, skip exact-text dupes ──
      const wordInsert = await client.query(`
        INSERT INTO em_words
          (category_id, word, phonetic, definition, example_sentence, audio_url,
           difficulty, order_index, is_active, created_by, created_at, updated_at)
        SELECT $1, word, phonetic, definition, example_sentence, audio_url,
               difficulty, order_index, is_active, created_by, created_at, updated_at
          FROM em_words
         WHERE category_id = ANY($2::uuid[])
        ON CONFLICT (category_id, word) DO NOTHING
        RETURNING id
      `, [canonicalId, dupIds]);
      totalWordsMerged += wordInsert.rowCount;

      // ── 3. For words that were skipped as dupes, merge their progress
      //        into the canonical word's progress row before we lose them ──
      const progressMerge = await client.query(`
        WITH dup_words AS (
          SELECT dw.id AS dup_word_id, cw.id AS canonical_word_id
            FROM em_words dw
            JOIN em_words cw ON cw.category_id = $1 AND cw.word = dw.word
           WHERE dw.category_id = ANY($2::uuid[])
        ),
        merged AS (
          INSERT INTO em_word_progress
            (user_id, word_id, correct_attempts, total_attempts, mastered, last_practiced, created_at, updated_at)
          SELECT p.user_id, dwids.canonical_word_id,
                 p.correct_attempts, p.total_attempts, p.mastered, p.last_practiced,
                 p.created_at, p.updated_at
            FROM em_word_progress p
            JOIN dup_words dwids ON dwids.dup_word_id = p.word_id
          ON CONFLICT (user_id, word_id) DO UPDATE SET
            correct_attempts = em_word_progress.correct_attempts + EXCLUDED.correct_attempts,
            total_attempts   = em_word_progress.total_attempts + EXCLUDED.total_attempts,
            mastered         = em_word_progress.mastered OR EXCLUDED.mastered,
            last_practiced   = GREATEST(em_word_progress.last_practiced, EXCLUDED.last_practiced),
            updated_at       = NOW()
          RETURNING 1
        )
        SELECT COUNT(*)::int AS n FROM merged
      `, [canonicalId, dupIds]);
      totalProgressMerged += progressMerge.rows[0]?.n || 0;

      // ── 4. Repoint practice sessions to the canonical category ─────────
      const sessionUpdate = await client.query(`
        UPDATE em_practice_sessions SET category_id = $1
         WHERE category_id = ANY($2::uuid[])
      `, [canonicalId, dupIds]);
      totalSessionsRepointed += sessionUpdate.rowCount;

      // ── 5. Delete duplicate categories (cascades to their leftover
      //        em_words / em_word_progress, which are now redundant) ─────
      const catDelete = await client.query(`
        DELETE FROM em_categories WHERE id = ANY($1::uuid[])
      `, [dupIds]);
      totalCategoriesRemoved += catDelete.rowCount;
      totalWordsDropped += dupIds.length; // informational only, exact count logged below is approximate
    }

    console.log('Summary:');
    console.log(`  Words merged into canonical categories: ${totalWordsMerged}`);
    console.log(`  Word-progress rows merged (preserved):  ${totalProgressMerged}`);
    console.log(`  Practice sessions repointed:            ${totalSessionsRepointed}`);
    console.log(`  Duplicate category rows removed:        ${totalCategoriesRemoved}`);
    console.log('');

    if (APPLY) {
      await client.query('COMMIT');
      console.log('✅ Committed. Duplicate categories merged.');
      console.log('   Next: re-run run_complete_migration.js (or just redeploy) so the');
      console.log('   new UNIQUE(name, difficulty) constraint can be added successfully.');
    } else {
      await client.query('ROLLBACK');
      console.log('This was a dry run — all of the above was rolled back, nothing was changed.');
      console.log('Re-run with --apply to commit these changes for real.');
    }
  } catch (e) {
    await client.query('ROLLBACK');
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
