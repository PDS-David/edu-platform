'use strict';

/**
 * authAuditService.js  —  AUTH-006
 *
 * Writes immutable audit records for every significant authentication event.
 *
 * Event types:
 *   REGISTER              — new account created
 *   LOGIN_SUCCESS         — password correct, token issued
 *   LOGIN_FAILURE         — wrong password or unknown email
 *   LOCKOUT               — account locked after N failures
 *   LOGOUT                — single-session logout
 *   LOGOUT_ALL_DEVICES    — all-device logout
 *   PASSWORD_RESET_REQUEST — forgot-password initiated
 *   PASSWORD_RESET_SUCCESS — password successfully reset
 *   PASSWORD_CHANGE       — in-session password update
 *   TOKEN_REFRESH         — refresh-token rotation
 *   TOKEN_REVOKED         — token revoked (reason stored in metadata)
 *   EMAIL_VERIFIED        — email verification completed
 *
 * All writes are fire-and-forget so audit failures never block the caller.
 */

const { QueryTypes } = require('sequelize');
const db     = require('../config/database');
const logger = require('../config/logger');

/**
 * log
 *
 * @param {object} opts
 * @param {string}  opts.eventType   — one of the event constants above
 * @param {string}  [opts.userId]    — UUID, may be null for pre-auth events
 * @param {string}  [opts.email]     — raw email (for LOGIN_FAILURE lookups)
 * @param {string}  [opts.ipAddress]
 * @param {string}  [opts.userAgent]
 * @param {object}  [opts.metadata]  — arbitrary extra context
 */
async function log({ eventType, userId = null, email = null, ipAddress = null, userAgent = null, metadata = {} }) {
  try {
    await db.query(
      `INSERT INTO auth_audit_log
         (event_type, user_id, email, ip_address, user_agent, metadata, created_at)
       VALUES
         (:eventType, :userId, :email, :ipAddress, :userAgent, :metadata::jsonb, NOW())`,
      {
        replacements: {
          eventType,
          userId,
          email,
          ipAddress,
          userAgent,
          metadata: JSON.stringify(metadata),
        },
        type: QueryTypes.INSERT,
      }
    );
  } catch (err) {
    // Audit must never break the caller — log locally but swallow
    logger.error(`[authAudit] Failed to write audit record: ${err.message}`, {
      eventType, userId, email,
    });
  }
}

// ─── Convenience wrappers (reduces verbosity at call sites) ──────────────────

const audit = {
  register:             (opts) => log({ eventType: 'REGISTER',              ...opts }),
  loginSuccess:         (opts) => log({ eventType: 'LOGIN_SUCCESS',         ...opts }),
  loginFailure:         (opts) => log({ eventType: 'LOGIN_FAILURE',         ...opts }),
  lockout:              (opts) => log({ eventType: 'LOCKOUT',               ...opts }),
  logout:               (opts) => log({ eventType: 'LOGOUT',               ...opts }),
  logoutAllDevices:     (opts) => log({ eventType: 'LOGOUT_ALL_DEVICES',    ...opts }),
  passwordResetRequest: (opts) => log({ eventType: 'PASSWORD_RESET_REQUEST',...opts }),
  passwordResetSuccess: (opts) => log({ eventType: 'PASSWORD_RESET_SUCCESS',...opts }),
  passwordChange:       (opts) => log({ eventType: 'PASSWORD_CHANGE',       ...opts }),
  tokenRefresh:         (opts) => log({ eventType: 'TOKEN_REFRESH',         ...opts }),
  tokenRevoked:         (opts) => log({ eventType: 'TOKEN_REVOKED',         ...opts }),
  emailVerified:        (opts) => log({ eventType: 'EMAIL_VERIFIED',        ...opts }),
  log,  // raw access for custom events
};

module.exports = audit;
