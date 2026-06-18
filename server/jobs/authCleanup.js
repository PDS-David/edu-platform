'use strict';

/**
 * jobs/authCleanup.js
 *
 * Scheduled maintenance for the auth subsystem.
 * Runs via node-cron (registered in server.js).
 *
 * Tasks:
 *   1. Delete revoked/expired auth_tokens older than 90 days
 *   2. Delete auth_audit_log rows older than 1 year
 *   3. Clear stale lockouts that have passed their locked_until time
 */

const cron       = require('node-cron');
const { QueryTypes } = require('sequelize');
const db         = require('../config/database');
const logger     = require('../config/logger');

async function runCleanup() {
  logger.info('[authCleanup] Starting scheduled auth cleanup');

  try {
    // 1. Purge old token rows (revoked or expired, older than 90 days)
    const [, tokenMeta] = await db.query(
      `DELETE FROM auth_tokens
       WHERE (revoked = TRUE OR expires_at < NOW())
         AND issued_at < NOW() - INTERVAL '90 days'`,
      { type: QueryTypes.DELETE }
    );
    logger.info(`[authCleanup] Purged expired/revoked tokens`);

    // 2. Purge old audit log entries (older than 1 year)
    await db.query(
      `DELETE FROM auth_audit_log WHERE created_at < NOW() - INTERVAL '1 year'`,
      { type: QueryTypes.DELETE }
    );
    logger.info(`[authCleanup] Purged old audit log entries`);

    // 3. Clear expired lockouts so users aren't stuck after server restart
    const [, lockMeta] = await db.query(
      `UPDATE users
       SET locked_until = NULL, failed_login_count = 0, updated_at = NOW()
       WHERE locked_until IS NOT NULL AND locked_until < NOW()`,
      { type: QueryTypes.UPDATE }
    );
    logger.info(`[authCleanup] Cleared expired lockouts`);

  } catch (err) {
    logger.error(`[authCleanup] Error during cleanup: ${err.message}`);
  }
}

/**
 * register — call from server.js after app is ready.
 * Runs daily at 03:00 server time.
 */
function register() {
  cron.schedule('0 3 * * *', runCleanup, { timezone: 'UTC' });
  logger.info('[authCleanup] Scheduled daily auth cleanup at 03:00 UTC');
}

module.exports = { register, runCleanup };
