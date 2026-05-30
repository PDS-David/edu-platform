'use strict';
/**
 * migrate_r2_keys.js
 * Backfills resources.r2_key from existing resources.file_url values.
 *
 * Run once after deploying the r2_key column:
 *   docker cp server/scripts/migrate_r2_keys.js aischool_api:/app/scripts/migrate_r2_keys.js
 *   docker exec -w /app aischool_api node scripts/migrate_r2_keys.js
 */

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

function extractKey(fileUrl) {
  if (!fileUrl) return null;

  // https://pub-xxxx.r2.dev/resources/file.docx → resources/file.docx
  if (PUBLIC_BASE && fileUrl.startsWith(PUBLIC_BASE + '/')) {
    return fileUrl.slice(PUBLIC_BASE.length + 1);
  }

  // /api/resources/r2/resources%2Ffile.docx → resources/file.docx
  if (fileUrl.startsWith('/api/resources/r2/')) {
    try { return decodeURIComponent(fileUrl.slice('/api/resources/r2/'.length)); }
    catch { return fileUrl.slice('/api/resources/r2/'.length); }
  }

  // https://any-host.com/path/resources/file.docx → resources/file.docx
  const m = fileUrl.match(/\/(resources\/[^?#]+)/);
  if (m) return m[1];

  return null;
}

(async () => {
  // Step 1: add column if missing
  await pool.query(`
    ALTER TABLE resources ADD COLUMN IF NOT EXISTS r2_key TEXT;
  `);
  console.log('✅ r2_key column ensured');

  // Step 2: fetch rows needing backfill
  const { rows } = await pool.query(`
    SELECT id, file_url FROM resources
    WHERE file_url IS NOT NULL AND (r2_key IS NULL OR r2_key = '')
  `);
  console.log(`Found ${rows.length} resources to backfill`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const key = extractKey(row.file_url);
    if (!key) { skipped++; continue; }

    await pool.query(
      `UPDATE resources SET r2_key = $1 WHERE id = $2`,
      [key, row.id]
    );
    updated++;
    console.log(`  ✅ ${row.id} → ${key}`);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (local/unknown): ${skipped}`);
  await pool.end();
})();
