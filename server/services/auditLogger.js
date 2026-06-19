'use strict';

/**
 * auditLogger.js
 * ──────────────
 * Central audit logging service for AISchoolOnair.
 * Writes immutable records to audit_logs (INSERT only — DB trigger blocks UPDATE/DELETE).
 *
 * Usage:
 *   const audit = require('../services/auditLogger');
 *   await audit.log(req, audit.ACTIONS.LOGIN, { severity: 'info' });
 *   await audit.log(req, audit.ACTIONS.ROLE_CHANGE, {
 *     targetId: userId, targetEmail: email,
 *     targetType: 'user', metadata: { old_role: 'student', new_role: 'teacher' }
 *   });
 *
 * Never throws — all errors are caught and console.error'd so a logging
 * failure can never take down a request.
 */

const { QueryTypes } = require('sequelize');
const db = require('../config/database');

// ── Action constants ──────────────────────────────────────────────────────────
const ACTIONS = Object.freeze({
  // Auth
  LOGIN:                 'LOGIN',
  LOGIN_FAILED:          'LOGIN_FAILED',
  LOGOUT:                'LOGOUT',
  PASSWORD_RESET:        'PASSWORD_RESET',
  EMAIL_VERIFIED:        'EMAIL_VERIFIED',

  // User lifecycle
  USER_CREATE:           'USER_CREATE',
  USER_UPDATE:           'USER_UPDATE',
  USER_DELETE:           'USER_DELETE',      // soft-delete
  USER_RESTORE:          'USER_RESTORE',
  USER_HARD_DELETE:      'USER_HARD_DELETE',

  // Role & access
  ROLE_CHANGE:           'ROLE_CHANGE',
  USER_DEACTIVATE:       'USER_DEACTIVATE',
  USER_REACTIVATE:       'USER_REACTIVATE',

  // Teacher management
  TEACHER_CREATE:        'TEACHER_CREATE',
  TEACHER_ASSIGN:        'TEACHER_ASSIGN',
  TEACHER_UNASSIGN:      'TEACHER_UNASSIGN',

  // Course / enrollment
  COURSE_CREATE:         'COURSE_CREATE',
  COURSE_APPROVE:        'COURSE_APPROVE',
  COURSE_REJECT:         'COURSE_REJECT',
  ENROLLMENT_APPROVE:    'ENROLLMENT_APPROVE',
  ENROLLMENT_REJECT:     'ENROLLMENT_REJECT',

  // Questions
  QUESTION_APPROVE:      'QUESTION_APPROVE',
  QUESTION_REJECT:       'QUESTION_REJECT',
  QUESTION_GENERATE:     'QUESTION_GENERATE',

  // Settings / config
  SETTINGS_CHANGE:       'SETTINGS_CHANGE',
  NOTIFICATION_SEND:     'NOTIFICATION_SEND',
  DIGEST_SEND:           'DIGEST_SEND',

  // Destructive admin
  RESOURCE_PURGE:        'RESOURCE_PURGE',
  R2_MIGRATE:            'R2_MIGRATE',
  DATA_EXPORT:           'DATA_EXPORT',

  // Security events
  UNAUTHORIZED_ACCESS:   'UNAUTHORIZED_ACCESS',
  IDOR_ATTEMPT:          'IDOR_ATTEMPT',
  RATE_LIMIT_HIT:        'RATE_LIMIT_HIT',
  SUSPICIOUS_ACTIVITY:   'SUSPICIOUS_ACTIVITY',
  ADMIN_ACTION:          'ADMIN_ACTION',
});

// ── Severity map ──────────────────────────────────────────────────────────────
const SEVERITY_MAP = {
  [ACTIONS.LOGIN]:               'info',
  [ACTIONS.LOGIN_FAILED]:        'warning',
  [ACTIONS.LOGOUT]:              'info',
  [ACTIONS.USER_DELETE]:         'warning',
  [ACTIONS.USER_HARD_DELETE]:    'critical',
  [ACTIONS.ROLE_CHANGE]:         'warning',
  [ACTIONS.USER_DEACTIVATE]:     'warning',
  [ACTIONS.TEACHER_CREATE]:      'info',
  [ACTIONS.RESOURCE_PURGE]:      'critical',
  [ACTIONS.UNAUTHORIZED_ACCESS]: 'warning',
  [ACTIONS.IDOR_ATTEMPT]:        'critical',
  [ACTIONS.RATE_LIMIT_HIT]:      'warning',
  [ACTIONS.SUSPICIOUS_ACTIVITY]: 'critical',
};

/**
 * Extract client IP from request, respecting Caddy's X-Forwarded-For.
 */
function extractIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req?.ip || req?.connection?.remoteAddress || null;
}

/**
 * log(req, action, opts)
 *
 * @param {object} req          - Express request (may be null for system-level events)
 * @param {string} action       - One of ACTIONS.*
 * @param {object} opts
 * @param {string} [opts.targetType]   - 'user' | 'course' | 'setting' | …
 * @param {string} [opts.targetId]     - PK of the affected entity (cast to text)
 * @param {string} [opts.targetEmail]  - Snapshot of target user email
 * @param {object} [opts.metadata]     - Any extra structured data (JSONB)
 * @param {string} [opts.severity]     - Override auto-detected severity
 * @param {string} [opts.actorId]      - Override actor (for system jobs)
 * @param {string} [opts.actorEmail]   - Override actor email
 * @param {string} [opts.actorRole]    - Override actor role
 */
async function log(req, action, opts = {}) {
  try {
    const actor = req?.user || null;
    const severity = opts.severity || SEVERITY_MAP[action] || 'info';

    await db.query(
      `INSERT INTO audit_logs
         (actor_id, actor_email, actor_role,
          action,
          target_type, target_id, target_email,
          metadata, ip_address, user_agent, severity, created_at)
       VALUES
         (:actorId, :actorEmail, :actorRole,
          :action,
          :targetType, :targetId, :targetEmail,
          :metadata::jsonb, :ip::inet, :userAgent, :severity, NOW())`,
      {
        replacements: {
          actorId:     opts.actorId    || actor?.id    || null,
          actorEmail:  opts.actorEmail || actor?.email || null,
          actorRole:   opts.actorRole  || actor?.role  || null,
          action,
          targetType:  opts.targetType  || null,
          targetId:    opts.targetId    ? String(opts.targetId) : null,
          targetEmail: opts.targetEmail || null,
          metadata:    JSON.stringify(opts.metadata || {}),
          ip:          extractIp(req)   || null,
          userAgent:   req?.headers?.['user-agent']?.slice(0, 500) || null,
          severity,
        },
        type: QueryTypes.INSERT,
      }
    );
  } catch (err) {
    // Logging must never crash the caller
    console.error('[auditLogger] Failed to write audit log:', err.message);
  }
}

/**
 * Convenience wrapper: logs an IDOR attempt and returns a 403 response.
 * Usage: return audit.blockIdor(req, res, 'Teacher accessed out-of-scope student');
 */
async function blockIdor(req, res, detail = 'IDOR attempt detected') {
  await log(req, ACTIONS.IDOR_ATTEMPT, {
    severity: 'critical',
    metadata: {
      detail,
      path:   req?.path,
      params: req?.params,
      query:  req?.query,
    },
  });
  return res.status(403).json({ success: false, error: 'Access denied' });
}

module.exports = { log, blockIdor, ACTIONS };
