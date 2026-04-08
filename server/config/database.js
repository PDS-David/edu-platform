// server/config/database.js

const { Sequelize } = require('sequelize');
require('dotenv').config();

// UTF-8 fix (Windows safety)
const { defaults } = require('pg');
defaults.client_encoding = 'UTF8';

// Pool sizing
const isProduction = process.env.NODE_ENV === 'production';

const poolMax =
  parseInt(process.env.DB_POOL_MAX) ||
  (isProduction ? 20 : 5);

const poolMin =
  parseInt(process.env.DB_POOL_MIN) || 0;

// Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME || 'edu_platform',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',

    logging:
      process.env.DB_LOGGING === 'true'
        ? console.log
        : false,

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
  }
);

module.exports = sequelize;