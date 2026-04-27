'use strict';
// server/scripts/migrateUploadsToR2.js
// ─────────────────────────────────────────────────────────────────────────────
// One-time migration: moves every resource whose file_url starts with
// /uploads/ from Render's ephemeral disk to Cloudflare R2, then updates
// the file_url in the database to the new public R2 URL.
//
// USAGE (run on the Render shell or locally with prod env vars):
//   node server/scripts/migrateUploadsToR2.js
//
// SAFE TO RE-RUN: already-migrated rows (file_url starts with http) are
// skipped automatically. A dry-run mode is available:
//   DRY_RUN=true node server/scripts/migrateUploadsToR2.js
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });

const fs        = require('fs');
const path      = require('path');
const mime      = require('mime-types');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const r2        = require('../utils/r2Storage');

const DRY_RUN = process.env.DRY_RUN === 'true';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// ── helpers ──────────────────────────────────────────────────────────────────

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function mimeFor(filePath) {
  return mime.lookup(filePath) || 'application/octet-stream';
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Preflight checks
  if (!r2.isR2Enabled()) {
    console.error('❌  R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,');
    console.error('    R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL then retry.');
    process.exit(1);
  }

  if (DRY_RUN) log('🔍', 'DRY RUN mode — no files will be uploaded or DB rows updated.');

  // Fetch all resources still pointing at local disk
  const rows = await sequelize.query(
    `SELECT id, title, file_url, original_filename, mime_type
       FROM resources
      WHERE file_url IS NOT NULL
        AND (file_url LIKE '/uploads/%' OR file_url LIKE 'uploads/%')
      ORDER BY created_at ASC`,
    { type: QueryTypes.SELECT }
  );

  if (rows.length === 0) {
    log('✅', 'No local-disk resources found — nothing to migrate.');
    await sequelize.close();
    return;
  }

  log('📦', `Found ${rows.length} resource(s) to migrate.`);

  let succeeded = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const row of rows) {
    const relPath  = row.file_url.replace(/^\//, '');          // strip leading /
    const fullPath = path.join(UPLOADS_DIR, relPath.replace(/^uploads\//, ''));
    const filename = row.original_filename || path.basename(relPath);

    if (!fs.existsSync(fullPath)) {
      log('⚠️ ', `[SKIP] File not found on disk: ${relPath}  (id=${row.id})`);
      skipped++;
      continue;
    }

    const buffer   = fs.readFileSync(fullPath);
    const mimetype = row.mime_type || mimeFor(fullPath);

    log('⬆️ ', `Uploading "${row.title}" (${(buffer.length / 1024).toFixed(1)} KB)…`);

    if (DRY_RUN) {
      log('   ', `→ would upload as ${filename} (${mimetype})`);
      succeeded++;
      continue;
    }

    try {
      const { url } = await r2.uploadBuffer({ buffer, originalname: filename, mimetype });

      await sequelize.query(
        `UPDATE resources SET file_url = :url, updated_at = NOW() WHERE id = :id`,
        { replacements: { url, id: row.id }, type: QueryTypes.UPDATE }
      );

      log('✅', `Migrated → ${url}`);
      succeeded++;
    } catch (err) {
      log('❌', `Failed for id=${row.id}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`  Migrated : ${succeeded}`);
  console.log(`  Skipped  : ${skipped}  (file missing from disk)`);
  console.log(`  Failed   : ${failed}`);
  console.log('─────────────────────────────────────');

  if (failed > 0) {
    console.log('\n⚠️  Some files failed. Re-run the script to retry — already-migrated rows are skipped.');
  } else if (skipped > 0) {
    console.log('\n⚠️  Some files were missing from disk (Render may have restarted and cleared them).');
    console.log('   Those resources will need to be re-uploaded manually via Admin → Bulk Upload.');
  } else {
    console.log('\n🎉  All resources migrated successfully!');
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
