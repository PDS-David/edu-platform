const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// GET /api/notifications
router.get('/', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, title, message, type, is_read, action_url, created_at
       FROM notifications
       WHERE user_id = :user_id
       ORDER BY created_at DESC
       LIMIT 20`,
      { replacements: { user_id: req.user.id }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    // Table may not exist yet — return empty list instead of 500
    res.json({ success: true, count: 0, data: [] });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', protect, async (req, res) => {
  try {
    const result = await sequelize.query(
      `UPDATE notifications SET is_read = true
       WHERE user_id = :user_id AND is_read = false`,
      { replacements: { user_id: req.user.id }, type: QueryTypes.UPDATE }
    );
    res.json({ success: true, updated: result[1] || 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', protect, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE notifications SET is_read = true
       WHERE id = :id AND user_id = :user_id`,
      { replacements: { id: req.params.id, user_id: req.user.id }, type: QueryTypes.UPDATE }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications (admin, school_admin)
//
// Phase 4: school_admin can now send notifications too, but strictly scoped
// to their own school — enforced inside the handler, not just at the
// authorize() gate. App Admin keeps the unrestricted behavior it always had.
//
// Body shape: { title, message, type?, action_url?, recipient: { kind: 'user'
// | 'users' | 'class' | 'school', id?, ids? } }. 'user' takes a single id;
// 'users' takes an array of ids (one round trip for a multi-person send).
// Back-compat: if `recipient` is omitted and a bare `user_id` is passed
// instead (today's only shape), it's treated as { kind: 'user', id: user_id }
// — every existing caller keeps working unmodified.
router.post('/', protect, authorize('admin', 'school_admin'), async (req, res) => {
  try {
    // action_url defaults to null (not left undefined): Sequelize's raw-query
    // named replacements throw "has no entry in the replacement map" for an
    // undefined value (unlike an explicit null, which binds fine as SQL
    // NULL) — this was crashing every send from SendNotificationModal.jsx,
    // which has no action_url field and never sends the key at all.
    const { title, message, type = 'info', action_url = null } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'title and message are required' });
    }

    const recipient = req.body.recipient
      || (req.body.user_id ? { kind: 'user', id: req.body.user_id } : null);
    if (!recipient || !recipient.kind) {
      return res.status(400).json({ success: false, error: 'recipient (or user_id) is required' });
    }

    const isSchoolAdmin = req.user.role === 'school_admin';

    // created_at is set explicitly (NOW()) in both inserts below rather than
    // left to the column's DEFAULT. Every versioned migration that defines
    // `notifications` gives created_at a DEFAULT NOW(), but table creation
    // everywhere is guarded by CREATE TABLE IF NOT EXISTS — if the live
    // table predates those migrations (or was created some other ad hoc
    // way, as has happened before in this codebase — see the EP-15
    // schema-canonicalization history), that CREATE is a silent no-op and
    // the missing default never gets backfilled. Setting it explicitly here
    // means every insert succeeds regardless of what the live table's
    // default actually is. See also migration_012_notifications_created_at_default.sql,
    // which fixes the schema itself (manual run required).
    const insertOne = async (userId) => {
      const rows = await sequelize.query(
        `INSERT INTO notifications (user_id, title, message, type, action_url, created_at)
         VALUES (:user_id, :title, :message, :type, :action_url, NOW())
         RETURNING id`,
        { replacements: { user_id: userId, title, message, type, action_url }, type: QueryTypes.INSERT }
      );
      return rows[0][0]?.id;
    };

    // Bulk fan-out via a single multi-row INSERT (not N sequential queries).
    // There's no live Sequelize model for `notifications` at runtime (the
    // model file exists but is never registered outside the one-off
    // setupDb.js script), so this stays consistent with the raw-SQL style
    // already used everywhere else in this file.
    const insertMany = async (userIds) => {
      if (!userIds.length) return 0;
      const replacements = { title, message, type, action_url };
      const valuesSql = userIds
        .map((id, i) => {
          replacements[`user_id_${i}`] = id;
          return `(:user_id_${i}, :title, :message, :type, :action_url, NOW())`;
        })
        .join(', ');
      await sequelize.query(
        `INSERT INTO notifications (user_id, title, message, type, action_url, created_at) VALUES ${valuesSql}`,
        { replacements, type: QueryTypes.INSERT }
      );
      return userIds.length;
    };

    if (recipient.kind === 'user') {
      const targetId = recipient.id;
      if (!targetId) {
        return res.status(400).json({ success: false, error: 'recipient.id is required for kind "user"' });
      }
      if (isSchoolAdmin) {
        const owner = await sequelize.query(
          `SELECT id FROM users WHERE id = :id AND school_id = :school_id`,
          { replacements: { id: targetId, school_id: req.user.school_id }, type: QueryTypes.SELECT }
        );
        if (!owner.length) {
          return res.status(403).json({ success: false, error: 'That user is not in your school' });
        }
      }
      const id = await insertOne(targetId);
      return res.json({ success: true, data: { id } });
    }

    // kind: 'users' (plural) — send the same notification to several specific
    // people in one request. Added so SendNotificationModal.jsx's "Specific
    // people" option can submit its whole selection in a single round trip
    // instead of one POST per person. All-or-nothing, same pattern as Phase
    // 2's class-student bulk add: if any id isn't in the caller's school,
    // NOTHING is sent and the offending ids are named back, rather than
    // silently notifying only the valid subset.
    if (recipient.kind === 'users') {
      const targetIds = Array.isArray(recipient.ids) ? [...new Set(recipient.ids)] : [];
      if (!targetIds.length) {
        return res.status(400).json({ success: false, error: 'recipient.ids must be a non-empty array for kind "users"' });
      }
      if (isSchoolAdmin) {
        const owned = await sequelize.query(
          `SELECT id FROM users WHERE id IN (:ids) AND school_id = :school_id`,
          { replacements: { ids: targetIds, school_id: req.user.school_id }, type: QueryTypes.SELECT }
        );
        const ownedIds = new Set(owned.map((u) => u.id));
        const failedIds = targetIds.filter((id) => !ownedIds.has(id));
        if (failedIds.length) {
          return res.status(400).json({
            success: false,
            error: 'Some recipients are not in your school',
            failed_ids: failedIds,
          });
        }
      }
      const sent = await insertMany(targetIds);
      return res.json({ success: true, data: { sent } });
    }

    if (recipient.kind === 'class') {
      const classId = recipient.id;
      if (!classId) {
        return res.status(400).json({ success: false, error: 'recipient.id is required for kind "class"' });
      }
      if (isSchoolAdmin) {
        const owned = await sequelize.query(
          `SELECT id FROM classes WHERE id = :id AND school_id = :school_id`,
          { replacements: { id: classId, school_id: req.user.school_id }, type: QueryTypes.SELECT }
        );
        if (!owned.length) {
          return res.status(403).json({ success: false, error: 'That class is not in your school' });
        }
      }
      const members = await sequelize.query(
        `SELECT student_id FROM class_memberships WHERE class_id = :class_id`,
        { replacements: { class_id: classId }, type: QueryTypes.SELECT }
      );
      const sent = await insertMany(members.map((m) => m.student_id));
      return res.json({ success: true, data: { sent } });
    }

    if (recipient.kind === 'school') {
      const schoolId = isSchoolAdmin ? req.user.school_id : recipient.id;
      if (!schoolId) {
        return res.status(400).json({ success: false, error: 'recipient.id is required for kind "school"' });
      }
      if (isSchoolAdmin && recipient.id && recipient.id !== req.user.school_id) {
        return res.status(403).json({ success: false, error: 'You can only send to your own school' });
      }
      const targets = await sequelize.query(
        `SELECT id FROM users WHERE school_id = :school_id AND role IN ('teacher', 'student')`,
        { replacements: { school_id: schoolId }, type: QueryTypes.SELECT }
      );
      const sent = await insertMany(targets.map((u) => u.id));
      return res.json({ success: true, data: { sent } });
    }

    return res.status(400).json({ success: false, error: 'recipient.kind must be one of: user, class, school' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
