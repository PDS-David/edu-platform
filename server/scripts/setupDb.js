'use strict';

// Local-only convenience; never override environment variables.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });
const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

async function loadModels() {
  const modelsDir = path.join(__dirname, '..', 'models');
  const files = fs
    .readdirSync(modelsDir)
    .filter((f) => f.endsWith('.js') && f !== 'associations.js');
  for (const f of files) {
    const mod = require(path.join(modelsDir, f));
    if (typeof mod === 'function' && !mod.tableName && !mod.rawAttributes) {
      try { mod(sequelize); } catch (e) { console.log(`init fail ${f}: ${e.message}`); }
    }
  }
  const associate = require('../models/associations');
  associate(sequelize);
}

async function runMigrations() {
  const dir = path.join(__dirname, '..', '..', 'database');
  const order = [
    'migration_001.sql',
    'migration_002.sql',
    'migration_003.sql',
    'migration_004_student_subjects.sql',
    'migrate_roles_and_curricula.sql',
    'fix_type_mismatches_v2.sql',
    'patch_enrollment_status_columns.sql',
    'patch_answer_options.sql',
    'add_ielts_toefl_sat_subjects.sql',
    'eac_courses_topics_enrollments.sql',
    'notifications_and_healthcheck.sql',
    'eac_explanations.sql',
  ];
  for (const file of order) {
    const fp = path.join(dir, file);
    if (!fs.existsSync(fp)) {
      console.log(`SKIP (missing): ${file}`);
      continue;
    }
    const sql = fs.readFileSync(fp, 'utf8');
    process.stdout.write(`▶ ${file} ... `);
    try {
      await sequelize.query(sql);
      console.log('ok');
    } catch (e) {
      console.log(`WARN: ${e.message.split('\n')[0]}`);
    }
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log('DB connected');
    await loadModels();
    console.log(`Loaded ${Object.keys(sequelize.models).length} models`);
    console.log('Syncing schema (alter: false)...');
    await sequelize.sync();
    console.log('Schema synced');
    console.log('\nRunning SQL migrations...');
    await runMigrations();
    const [tables] = await sequelize.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
    );
    console.log(`\nFinal table count: ${tables[0].n}`);
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
