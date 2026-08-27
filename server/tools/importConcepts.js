#!/usr/bin/env node
// server/tools/importConcepts.js
// ─────────────────────────────────────────────────────────────────────────────
// Bulk concept import from a CSV file.
//
// CSV format (header row required):
//   subtopic_id,concept_name,difficulty_level
//
// Optional extra columns (silently ignored if absent):
//   description,estimated_minutes,order_index
//
// Usage:
//   node server/tools/importConcepts.js <path/to/concepts.csv>
//   node server/tools/importConcepts.js <path/to/concepts.csv> --dry-run
//
// Behaviour:
//   • Validates every row before touching the database.
//   • Skips duplicates: a concept is considered a duplicate when the same
//     (subtopic_id, LOWER(TRIM(name))) pair already exists in the concepts
//     table. The row is counted as "skipped" and processing continues.
//   • Wraps all inserts in a single transaction so a mid-file error leaves
//     the database clean (all-or-nothing per run).
//   • --dry-run parses and validates the CSV without writing anything.
//   • Exits 0 on success, 1 on any fatal error.
//
// Expected result: bulk concept creation supported; duplicates skipped cleanly.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs             = require('fs');
const path           = require('path');
const readline       = require('readline');
const { QueryTypes } = require('sequelize');

// Load .env from server/.env (works whether run from repo root or server/)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const sequelize = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const UUID_REGEX       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_DIFFICULTY = [1, 2, 3, 4, 5];
const REQUIRED_COLS    = ['subtopic_id', 'concept_name', 'difficulty_level'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function isValidUUID(v) {
  return UUID_REGEX.test(String(v || '').trim());
}

/** Minimal CSV line splitter that handles quoted fields containing commas. */
function splitCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Parse the entire CSV file and return { headers, rows: string[][] }. */
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const headers = [];
    const rows    = [];
    let lineNo    = 0;

    const rl = readline.createInterface({
      input:     fs.createReadStream(filePath, 'utf8'),
      crlfDelay: Infinity,
    });

    rl.on('line', (rawLine) => {
      lineNo++;
      const line = rawLine.trim();
      if (!line) return; // skip blank lines

      if (lineNo === 1) {
        // Header row — normalise to lowercase, no spaces
        headers.push(...splitCSVLine(line).map(h => h.toLowerCase().replace(/\s+/g, '_')));
        return;
      }

      rows.push(splitCSVLine(line));
    });

    rl.on('close', () => resolve({ headers, rows }));
    rl.on('error', reject);
  });
}

/** Validate a single parsed row. Returns { valid: true } or { valid: false, errors: string[] }. */
function validateRow(row, headers, lineNo) {
  const errors = [];
  const get    = (col) => {
    const idx = headers.indexOf(col);
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };

  const subtopicId     = get('subtopic_id');
  const conceptName    = get('concept_name');
  const difficultyRaw  = get('difficulty_level');

  if (!isValidUUID(subtopicId)) {
    errors.push(`  Line ${lineNo}: subtopic_id "${subtopicId}" is not a valid UUID`);
  }

  if (!conceptName) {
    errors.push(`  Line ${lineNo}: concept_name is empty`);
  } else if (conceptName.length > 255) {
    errors.push(`  Line ${lineNo}: concept_name exceeds 255 characters`);
  }

  const difficulty = parseInt(difficultyRaw, 10);
  if (!VALID_DIFFICULTY.includes(difficulty)) {
    errors.push(`  Line ${lineNo}: difficulty_level "${difficultyRaw}" must be 1–5`);
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core import function
// ─────────────────────────────────────────────────────────────────────────────
async function importConcepts(filePath, { dryRun = false } = {}) {
  // ── 1. File exists check ─────────────────────────────────────────────────
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`\n  Reading: ${filePath}`);
  console.log(dryRun ? '  DRY RUN — no changes will be written\n' : '');

  // ── 2. Parse CSV ─────────────────────────────────────────────────────────
  const { headers, rows } = await parseCSV(filePath);

  // Verify required columns exist
  const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required column(s): ${missing.join(', ')}\n` +
      `Required: ${REQUIRED_COLS.join(', ')}\n` +
      `Found:    ${headers.join(', ')}`
    );
  }

  console.log(`  Header columns: ${headers.join(', ')}`);
  console.log(`  Data rows found: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log('  No data rows — nothing to import.');
    return { inserted: 0, skipped: 0, errors: [] };
  }

  // ── 3. Validate all rows BEFORE touching the DB ──────────────────────────
  const allErrors = [];
  rows.forEach((row, i) => {
    const lineNo = i + 2; // +2 because row 1 is the header
    const result = validateRow(row, headers, lineNo);
    if (!result.valid) allErrors.push(...result.errors);
  });

  if (allErrors.length > 0) {
    console.error('  Validation failed — no rows imported:\n');
    allErrors.forEach(e => console.error(e));
    throw new Error(`Validation failed with ${allErrors.length} error(s). Fix the CSV and retry.`);
  }

  console.log('  All rows passed validation.\n');

  if (dryRun) {
    console.log(`  DRY RUN complete — ${rows.length} row(s) validated, nothing written.`);
    return { inserted: 0, skipped: 0, errors: [], dryRun: true };
  }

  // ── 4. Verify all subtopic_ids exist in the DB (single query) ────────────
  const helper    = (col) => (row) => {
    const idx = headers.indexOf(col);
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };
  const getSubId  = helper('subtopic_id');
  const uniqueSubs = [...new Set(rows.map(getSubId))];

  const existingSubtopics = await sequelize.query(
    `SELECT id FROM subtopics WHERE id IN (:ids)`,
    { replacements: { ids: uniqueSubs }, type: QueryTypes.SELECT }
  );
  const existingSubSet = new Set(existingSubtopics.map(r => r.id));

  const badSubtopics = uniqueSubs.filter(id => !existingSubSet.has(id));
  if (badSubtopics.length > 0) {
    throw new Error(
      `The following subtopic_id values do not exist in the database:\n` +
      badSubtopics.map(id => `  ${id}`).join('\n') +
      `\nEnsure the subtopics are created before importing concepts.`
    );
  }

  // ── 5. Load all existing concepts for the relevant subtopics (dedup) ─────
  const existingConcepts = await sequelize.query(
    `SELECT subtopic_id, LOWER(TRIM(name)) AS name_key
     FROM concepts
     WHERE subtopic_id IN (:ids)`,
    { replacements: { ids: uniqueSubs }, type: QueryTypes.SELECT }
  );
  // Build a Set of "subtopic_id:lower(name)" for O(1) duplicate lookup
  const dupSet = new Set(
    existingConcepts.map(r => `${r.subtopic_id}:${r.name_key}`)
  );

  // ── 6. Process rows inside a transaction ─────────────────────────────────
  let inserted = 0;
  let skipped  = 0;
  const rowErrors = [];

  const transaction = await sequelize.transaction();
  try {
    for (let i = 0; i < rows.length; i++) {
      const row      = rows[i];
      const lineNo   = i + 2;
      const get      = (col) => {
        const idx = headers.indexOf(col);
        return idx >= 0 ? (row[idx] || '').trim() : '';
      };

      const subtopicId       = get('subtopic_id');
      const conceptName      = get('concept_name').trim();
      const difficultyLevel  = parseInt(get('difficulty_level'), 10);
      const description      = get('description')       || null;
      const estimatedMinutes = parseInt(get('estimated_minutes'), 10) || 10;
      const orderIndex       = parseInt(get('order_index'), 10) || 0;

      // Duplicate check
      const dupKey = `${subtopicId}:${conceptName.toLowerCase()}`;
      if (dupSet.has(dupKey)) {
        console.log(`    Line ${lineNo}: SKIPPED duplicate — "${conceptName}" already exists in subtopic ${subtopicId}`);
        skipped++;
        continue;
      }

      try {
        await sequelize.query(
          `INSERT INTO concepts
             (subtopic_id, name, description, difficulty_level,
              estimated_minutes, order_index, created_at, updated_at)
           VALUES
             (:subtopicId, :name, :description, :difficultyLevel,
              :estimatedMinutes, :orderIndex, NOW(), NOW())`,
          {
            replacements: {
              subtopicId,
              name:             conceptName,
              description,
              difficultyLevel,
              estimatedMinutes,
              orderIndex,
            },
            type:        QueryTypes.INSERT,
            transaction,
          }
        );

        // Add to local set so we catch in-file duplicates too
        dupSet.add(dupKey);
        inserted++;
        console.log(`    Line ${lineNo}: INSERT "${conceptName}" (difficulty ${difficultyLevel})`);
      } catch (rowErr) {
        const msg = `Line ${lineNo}: DB error for "${conceptName}" — ${rowErr.message}`;
        console.error(`    ${msg}`);
        rowErrors.push(msg);
      }
    }

    if (rowErrors.length > 0) {
      await transaction.rollback();
      throw new Error(
        `${rowErrors.length} row(s) failed during insert. ` +
        `Transaction rolled back — no rows were committed.\n` +
        rowErrors.join('\n')
      );
    }

    await transaction.commit();
  } catch (err) {
    // Rollback if not already rolled back
    try { await transaction.rollback(); } catch {}
    throw err;
  }

  return { inserted, skipped, errors: rowErrors };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args   = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const csvArg = args.find(a => !a.startsWith('--'));

  if (!csvArg) {
    console.error('Usage: node server/tools/importConcepts.js <path/to/file.csv> [--dry-run]');
    console.error('\nCSV must have these columns (header row required):');
    console.error('  subtopic_id, concept_name, difficulty_level');
    console.error('\nOptional columns:');
    console.error('  description, estimated_minutes, order_index');
    process.exit(1);
  }

  const filePath = path.resolve(csvArg);

  try {
    await sequelize.authenticate();
    console.log('  Database connected');

    const result = await importConcepts(filePath, { dryRun });

    console.log('\n─────────────────────────────────');
    console.log('  Import summary:');
    console.log(`    Inserted : ${result.inserted}`);
    console.log(`    Skipped  : ${result.skipped}  (duplicates)`);
    if (result.dryRun) console.log('    Mode     : DRY RUN (nothing written)');
    console.log('─────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('\n  Import failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run when executed directly; skip when required (e.g., in tests)
if (require.main === module) {
  main();
}

module.exports = { importConcepts }; // export for programmatic use / tests
