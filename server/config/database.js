const { Sequelize } = require('sequelize');
const { Pool } = require('pg');
require('dotenv').config();

// ── UTF-8 fix: set client_encoding immediately on every new pg connection ──
// This is required on Windows where PostgreSQL defaults to WIN1252 encoding,
// which causes: "character with byte sequence 0x8d in encoding WIN1252
// has no equivalent in encoding UTF8"
const { defaults } = require('pg');
defaults.client_encoding = 'UTF8';

// Database connection configuration
const sequelize = new Sequelize(
  process.env.DB_NAME || 'edu_platform',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = sequelize;
