'use strict';

/**
 * server/routes/platformRoutes.js
 *
 * Platform-owner oversight. Every route here is gated by ownerOnly (see
 * server/middleware/ownerOnly.js for why it's an env var rather than a role,
 * and for this mechanism's honest limits).
 *
 *   GET  /api/platform/timeline            — unified admin activity timeline
 *   GET  /api/platform/admins              — admin accounts + current status
 *   POST /api/platform/admins/:id/pause    — manual pause (no auto-expiry)
 *   POST /api/platform/admins/:id/unpause  — lift a pause
 *
 * WHY A UNIFIED TIMELINE EXISTS AT ALL:
 *   This app already writes two separate, unconnected audit trails:
 *     - auth_audit_log  (server/services/authAuditService.js) — logins,
 *       failed logins, lockouts, logouts, password changes. Has ip_address.
 *     - audit_logs      (server/services/auditLogger.js) — admin actions
 *       (role changes, deletes, purges, question approvals, etc).
 *   server/routes/auditRoutes.js — which powers the existing admin-facing
 *   "Audit Log" page — reads ONLY audit_logs. So login events have been
 *   recorded all along but were not visible anywhere in the UI, and admin
 *   actions could not be tied to the session they happened in.
 *
 *   Merging them is what turns scattered rows into a usable sequence:
 *   "admin X signed in 10:42 from 1.2.3.4 -> deleted subject Y at 10:47 ->
 *   signed out 10:51".
 *
 * KNOWN COVERAGE GAP, flagged not fixed here:
 *   Only 4 of 26 endpoints in adminRoutes.js currently call audit.log() (~15%).
 *   The timeline can only show what was recorded, so gaps between a login and
 *   a logout may be genuinely empty rather than meaning "did nothing".
 *   Widening that coverage is separate work — this route does not fabricate
 *   or infer activity it has no record of.
 */

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');
const { ownerOnly }  = require('../middleware/ownerOnly');
const audit          = require('../services/auditLogger');

// ── GET /api/platform/timeline ───────────────────────────────────────────────
// Unified, newest-first. Filters: ?actor_email= &since= &until= &page= &limit=
// &role= (defaults to admin-only, since that's this view's whole purpose).
router.get('/timeline', protect, ownerOnly, async (req, res) => {
  const page   = Math.max(parseInt(req.query.page  || '1'), 1);
  const limit  = Math.min(parseInt(req.query.limit || '100'), 500);
  const offset = (page - 1) * limit;

  const actorEmail = req.query.actor_email ? String(req.query.actor_email).trim().toLowerCase() : null;
  const since      = req.query.since || null;   // ISO timestamp
  const until      = req.query.until || null;   // ISO timestamp

  // adminOnly defaults true: this view exists to review App Admin activity.
  // Pass ?admin_only=false to widen it when investigating cross-role activity.
  const adminOnly = String(req.query.admin_only ?? 'true') !== 'false';

  const replacements = { limit, offset };
  const filters = [];

  if (actorEmail) { filters.push(`LOWER(t.actor_email) = :actorEmail`); replacements.actorEmail = actorEmail; }
  if (since)      { filters.push(`t.occurred_at >= :since::timestamptz`); replacements.since = since; }
  if (until)      { filters.push(`t.occurred_at <= :until::timestamptz`); replacements.until = until; }
  if (adminOnly)  { filters.push(`t.actor_role = 'admin'`); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  // Both tables normalised to one shape. actor_role is resolved via users for
  // auth_audit_log (which doesn't store a role of its own) so admin_only can
  // filter login events too — without that join, a login would have no role
  // and would be dropped by the filter, which is exactly the event this view
  // most needs to show.
  const unified = `
    SELECT
      'action'                                   AS source,
      al.created_at                              AS occurred_at,
      al.actor_id                                AS actor_id,
      al.actor_email                             AS actor_email,
      COALESCE(al.actor_role, u.role)            AS actor_role,
      al.action                                  AS event,
      al.target_type                             AS target_type,
      al.target_id                               AS target_id,
      al.target_email                            AS target_email,
      host(al.ip_address)                        AS ip_address,
      al.user_agent                              AS user_agent,
      al.severity                                AS severity,
      al.metadata                                AS metadata
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_id
    UNION ALL
    SELECT
      'auth'                                     AS source,
      aal.created_at                             AS occurred_at,
      aal.user_id                                AS actor_id,
      aal.email                                  AS actor_email,
      au.role                                    AS actor_role,
      aal.event_type                             AS event,
      NULL                                       AS target_type,
      NULL                                       AS target_id,
      NULL                                       AS target_email,
      host(aal.ip_address)                       AS ip_address,
      aal.user_agent                             AS user_agent,
      'info'                                     AS severity,
      aal.metadata                               AS metadata
    FROM auth_audit_log aal
    LEFT JOIN users au ON au.id = aal.user_id
  `;

  try {
    const rows = await sequelize.query(
      `SELECT t.* FROM (${unified}) t
       ${where}
       ORDER BY t.occurred_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );

    const [countRow] = await sequelize.query(
      `SELECT COUNT(*)::int AS total FROM (${unified}) t ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: rows,
      total: countRow?.total || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('[GET /platform/timeline]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/platform/admins ─────────────────────────────────────────────────
// Admin accounts with current active/paused status and last sign-in, so the
// owner can see who holds access before deciding anything.
router.get('/admins', protect, ownerOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, u.created_at,
              (SELECT MAX(a.created_at) FROM auth_audit_log a
                WHERE a.user_id = u.id AND a.event_type ILIKE '%login%'
                  AND a.event_type NOT ILIKE '%fail%') AS last_login_at,
              (SELECT host(a.ip_address) FROM auth_audit_log a
                WHERE a.user_id = u.id AND a.event_type ILIKE '%login%'
                  AND a.event_type NOT ILIKE '%fail%'
                ORDER BY a.created_at DESC LIMIT 1)    AS last_login_ip
       FROM users u
       WHERE u.role = 'admin'
       ORDER BY u.first_name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /platform/admins]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/platform/admins/:id/pause ──────────────────────────────────────
// Manual pause only — deliberately NO auto-expiry. An auto-unpause could
// restore access mid-investigation (e.g. while the owner is still speaking to
// the person), so lifting a pause is always an explicit act.
//
// Mechanism: users.is_active = false. This is not a new access-control path —
// middleware/auth.js's protect already selects `WHERE id = :id AND is_active
// = true` and re-queries on EVERY request, so a pause takes effect
// immediately and terminates live sessions too; there is no window where an
// already-signed-in admin keeps working from an open tab.
//
// A reason is required and recorded. The pause itself is audited, so the
// owner's own action is on the record alongside everything else.
router.post('/admins/:id/pause', protect, ownerOnly, async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || '').trim();

  if (!reason) {
    return res.status(400).json({ success: false, error: 'A reason is required to pause an account.' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ success: false, error: 'You cannot pause your own account.' });
  }

  try {
    const target = await sequelize.query(
      `SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!target.length) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    if (target[0].role !== 'admin') {
      return res.status(400).json({ success: false, error: 'This endpoint only pauses admin accounts.' });
    }
    if (!target[0].is_active) {
      return res.json({ success: true, data: { id, is_active: false, already_paused: true } });
    }

    await sequelize.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );

    await audit.log(req, audit.ACTIONS.USER_DEACTIVATE, {
      targetId:    id,
      targetEmail: target[0].email,
      targetType:  'user',
      severity:    'critical',
      metadata:    { reason, context: 'platform_owner_pause', target_role: 'admin' },
    });

    return res.json({
      success: true,
      data: { id, email: target[0].email, is_active: false, reason },
    });
  } catch (err) {
    console.error(`[POST /platform/admins/${id}/pause]`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/platform/admins/:id/unpause ────────────────────────────────────
router.post('/admins/:id/unpause', protect, ownerOnly, async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || '').trim();

  try {
    const target = await sequelize.query(
      `SELECT id, email, role, is_active FROM users WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!target.length) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    if (target[0].is_active) {
      return res.json({ success: true, data: { id, is_active: true, already_active: true } });
    }

    await sequelize.query(
      `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );

    await audit.log(req, audit.ACTIONS.USER_REACTIVATE, {
      targetId:    id,
      targetEmail: target[0].email,
      targetType:  'user',
      severity:    'warning',
      metadata:    { reason: reason || null, context: 'platform_owner_unpause' },
    });

    return res.json({ success: true, data: { id, email: target[0].email, is_active: true } });
  } catch (err) {
    console.error(`[POST /platform/admins/${id}/unpause]`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
