'use strict';

// config/database.js

const { Sequelize } = require('sequelize');

const isProduction = process.env.NODE_ENV === 'production';

// ── SSL ───────────────────────────────────────────────────────────────────────
// Render (and most managed PG hosts) require SSL.
// rejectUnauthorized: false is required because managed hosts use self-signed certs.
const dialectOptions = isProduction
  ? {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    }
  : {};

// ── POOL ──────────────────────────────────────────────────────────────────────
// Render free/starter PG allows ~25 total connections.
// Keep max at 5 so multiple restarts/workers don't exhaust the limit.
const poolMax = parseInt(process.env.DB_POOL_MAX) || 5;
const poolMin = parseInt(process.env.DB_POOL_MIN) || 0;

// ── SHARED SEQUELIZE OPTIONS ──────────────────────────────────────────────────
const sharedOptions = {
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  dialectOptions,
  pool: {
    max: poolMax,
    min: poolMin,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
};

// ── CONNECTION ────────────────────────────────────────────────────────────────
// Prefer DATABASE_URL — Render injects this automatically when a PostgreSQL
// service is linked to the web service. Falls back to individual vars for
// local development.
let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    ...sharedOptions,
    protocol: 'postgres',
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME     || 'edu_platform',
    process.env.DB_USER     || 'postgres',
    process.env.DB_PASSWORD || '',
    {
      ...sharedOptions,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
    }
  );
}

module.exports = sequelize;
