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
// | 'class' | 'school', id? } }. Back-compat: if `recipient` is omitted and a
// bare `user_id` is passed instead (today's only shape), it's treated as
// { kind: 'user', id: user_id } — every existing caller keeps working
// unmodified.
router.post('/', protect, authorize('admin', 'school_admin'), async (req, res) => {
  try {
    const { title, message, type = 'info', action_url } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'title and message are required' });
    }

    const recipient = req.body.recipient
      || (req.body.user_id ? { kind: 'user', id: req.body.user_id } : null);
    if (!recipient || !recipient.kind) {
      return res.status(400).json({ success: false, error: 'recipient (or user_id) is required' });
    }

    const isSchoolAdmin = req.user.role === 'school_admin';

    const insertOne = async (userId) => {
      const rows = await sequelize.query(
        `INSERT INTO notifications (user_id, title, message, type, action_url)
         VALUES (:user_id, :title, :message, :type, :action_url)
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
          return `(:user_id_${i}, :title, :message, :type, :action_url)`;
        })
        .join(', ');
      await sequelize.query(
        `INSERT INTO notifications (user_id, title, message, type, action_url) VALUES ${valuesSql}`,
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
