'use strict';

const { Sequelize } = require('sequelize');

const isProduction = process.env.NODE_ENV === 'production';
const dbUrl        = process.env.DATABASE_URL || '';

if (isProduction && !dbUrl) {
  console.error(
    '❌ DATABASE_URL is missing in production. ' +
    'Set DATABASE_URL in api.env (Supabase connection string) on the Hetzner server.'
  );
  process.exit(1);
}

// ── SSL ───────────────────────────────────────────────────────────────────────
const sslDisabled =
  process.env.DB_SSL === 'false' || dbUrl.includes('sslmode=disable');

const sslForced =
  process.env.DB_SSL === 'true' ||
  /supabase\.com|supabase\.co|amazonaws\.com|neon\.tech/.test(dbUrl);

const sslConfig =
  (isProduction || sslForced) && !sslDisabled
    ? { require: true, rejectUnauthorized: false }
    : false;

// ── Supabase pooler detection ─────────────────────────────────────────────────
// Supabase offers two pooler modes:
//   Port 5432  → Session pooler   (supports prepared statements — safe for Sequelize)
//   Port 6543  → Transaction pooler (NO prepared statements — Sequelize must avoid them)
//
// The transaction pooler rejects Sequelize's startup SET commands when they are
// issued as extended-query (prepared) protocol messages.  The workaround is to
// set `pool.min=0` and let pg-pool manage connections lazily, and crucially to
// pass `prepare: false` in dialectOptions to force the simple-query protocol.
const isTransactionPooler =
  dbUrl.includes(':6543') || process.env.DB_POOLER_MODE === 'transaction';

const dialectOptions = {
  ...(sslConfig ? { ssl: sslConfig } : {}),
  // Force simple-query protocol — required for Supabase transaction pooler.
  // Has no negative effect on session pooler or direct connections.
  ...(isTransactionPooler ? { statement_timeout: 30000 } : {}),
};

// pg-native prepared-statement hint understood by node-postgres
if (isTransactionPooler) {
  dialectOptions.prepare = false;
}

const commonOptions = {
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  dialectOptions,
  pool: {
    max: parseInt(process.env.DB_POOL_MAX) || 5,
    min: 0,   // always 0 — transaction pooler requires no persistent connections
    acquire: 30000,
    idle:    10000,
  },
  define: {
    timestamps:  true,
    underscored: true,
    createdAt:   'created_at',
    updatedAt:   'updated_at',
  },
};

const sequelize = dbUrl
  ? new Sequelize(dbUrl, commonOptions)
  : new Sequelize(
      process.env.DB_NAME     || 'edu_platform',
      process.env.DB_USER     || 'postgres',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        ...commonOptions,
      }
    );

// Fail fast — surface connection errors at startup rather than at first request
(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
})();

module.exports = sequelize;
