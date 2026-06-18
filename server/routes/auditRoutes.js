'use strict';

/**
 * server/routes/auditRoutes.js
 *
 * GET /api/audit/logs         — paginated audit log for admins
 * GET /api/audit/security     — security events only (warning + critical)
 * GET /api/audit/user/:id     — all events for a specific user
 */

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect } = require('../middleware/auth');
const { success, error, paginated } = require('../utils/response');
const { adminActionLimiter } = require('../middleware/rateLimiter');

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// ── GET /api/audit/logs ───────────────────────────────────────────────────────
// Full paginated audit log. Supports ?action=LOGIN&severity=warning&page=1&limit=50
router.get('/logs', protect, adminOnly, async (req, res) => {
  const page     = Math.max(parseInt(req.query.page   || '1'),  1);
  const limit    = Math.min(parseInt(req.query.limit  || '50'), 200);
  const offset   = (page - 1) * limit;
  const action   = req.query.action   || null;
  const severity = req.query.severity || null;
  const actorId  = req.query.actor_id || null;

  const conditions = ['1=1'];
  const replacements = { limit, offset };

  if (action)   { conditions.push(`action = :action`);     replacements.action   = action;   }
  if (severity) { conditions.push(`severity = :severity`); replacements.severity = severity; }
  if (actorId)  { conditions.push(`actor_id = :actorId`);  replacements.actorId  = actorId;  }

  const where = conditions.join(' AND ');

  try {
    const [countRows, rows] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${where}`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT id, actor_id, actor_email, actor_role, action,
                target_type, target_id, target_email,
                metadata, ip_address::text, user_agent, severity, created_at
         FROM audit_logs
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT }
      ),
    ]);

    return paginated(res, rows, { total: countRows[0].total, page, limit });
  } catch (err) {
    console.error('[GET /audit/logs]', err.message);
    return error(res, 'Failed to fetch audit logs');
  }
});

// ── GET /api/audit/security ───────────────────────────────────────────────────
// Security events dashboard — warning + critical only, last 24 h by default.
router.get('/security', protect, adminOnly, async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours || '24'), 720); // max 30 days
  const page  = Math.max(parseInt(req.query.page  || '1'),  1);
  const limit = Math.min(parseInt(req.query.limit || '50'), 200);
  const offset = (page - 1) * limit;

  try {
    const [countRows, rows] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total FROM audit_logs
         WHERE severity IN ('warning', 'critical')
           AND created_at >= NOW() - (:hours * INTERVAL '1 hour')`,
        { replacements: { hours }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT id, actor_id, actor_email, actor_role, action,
                target_type, target_id, target_email,
                metadata, ip_address::text, user_agent, severity, created_at
         FROM audit_logs
         WHERE severity IN ('warning', 'critical')
           AND created_at >= NOW() - (:hours * INTERVAL '1 hour')
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements: { hours, limit, offset }, type: QueryTypes.SELECT }
      ),
    ]);

    return paginated(res, rows, { total: countRows[0].total, page, limit });
  } catch (err) {
    console.error('[GET /audit/security]', err.message);
    return error(res, 'Failed to fetch security events');
  }
});

// ── GET /api/audit/user/:id ───────────────────────────────────────────────────
router.get('/user/:id', protect, adminOnly, async (req, res) => {
  const { id } = req.params;
  const page  = Math.max(parseInt(req.query.page  || '1'),  1);
  const limit = Math.min(parseInt(req.query.limit || '50'), 200);
  const offset = (page - 1) * limit;

  try {
    const [countRows, rows] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total FROM audit_logs
         WHERE actor_id = :id OR target_id = :id`,
        { replacements: { id }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT id, actor_id, actor_email, actor_role, action,
                target_type, target_id, target_email,
                metadata, ip_address::text, user_agent, severity, created_at
         FROM audit_logs
         WHERE actor_id = :id OR target_id = :id
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements: { id, limit, offset }, type: QueryTypes.SELECT }
      ),
    ]);

    return paginated(res, rows, { total: countRows[0].total, page, limit });
  } catch (err) {
    console.error('[GET /audit/user/:id]', err.message);
    return error(res, 'Failed to fetch user audit log');
  }
});

module.exports = router;
