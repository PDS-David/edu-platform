'use strict';

const { Sequelize } = require('sequelize');

const isProduction = process.env.NODE_ENV === 'production';

const dbUrl = process.env.DATABASE_URL || '';

// In production we must not silently fall back to local/default credentials.
// Render injects DATABASE_URL from the managed Postgres service. If it's missing,
// the deployment is misconfigured.
if (isProduction && !dbUrl) {
  // Keep the message extremely actionable for Render users.
  // eslint-disable-next-line no-console
  console.error(
    '❌ DATABASE_URL is missing in production. ' +
    'On Render, set env var DATABASE_URL (from your Postgres connectionString) ' +
    'and remove/avoid DB_USER/DB_PASSWORD fallbacks.'
  );
  process.exit(1);
}

const sslDisabled = process.env.DB_SSL === 'false' || dbUrl.includes('sslmode=disable');
const sslForced =
  process.env.DB_SSL === 'true' ||
  /render\.com|amazonaws\.com|neon\.tech|supabase\.co/.test(dbUrl);

const dialectOptions =
  (isProduction || sslForced) && !sslDisabled
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: process.env.DB_LOGGING === 'true' ? console.log : false,
      dialectOptions,
      pool: {
        max: parseInt(process.env.DB_POOL_MAX) || 5,
        min: parseInt(process.env.DB_POOL_MIN) || 0,
        acquire: 30000,
        idle: 10000,
      },
      define: {
        timestamps: true,
        underscored: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    })
  : new Sequelize(
      process.env.DB_NAME || 'edu_platform',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        dialect: 'postgres',
        logging: process.env.DB_LOGGING === 'true' ? console.log : false,
        dialectOptions,
        pool: {
          max: parseInt(process.env.DB_POOL_MAX) || 5,
          min: parseInt(process.env.DB_POOL_MIN) || 0,
          acquire: 30000,
          idle: 10000,
        },
        define: {
          timestamps: true,
          underscored: true,
          createdAt: 'created_at',
          updatedAt: 'updated_at',
        },
      }
    );

// 🔥 CRITICAL: Fail fast on DB connection
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
