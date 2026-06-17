const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// GET /api/notifications
router.get('/', protect, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const rows = await sequelize.query(
      `SELECT id, title, message, type, is_read, action_url, created_at
       FROM notifications
       WHERE user_id = :user_id
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { user_id: req.user.id, limit, offset }, type: QueryTypes.SELECT }
    );

    const [{ total }] = await sequelize.query(
      `SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = :user_id`,
      { replacements: { user_id: req.user.id }, type: QueryTypes.SELECT }
    );

    const [{ unread_count }] = await sequelize.query(
      `SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = :user_id AND is_read = false`,
      { replacements: { user_id: req.user.id }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      count: rows.length,
      unread_count,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (err) {
    // Table may not exist yet — return empty list instead of 500
    res.json({
      success: true,
      count: 0,
      unread_count: 0,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 1 },
    });
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

// POST /api/notifications (admin only)
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { user_id, title, message, type = 'info', action_url } = req.body;
    const rows = await sequelize.query(
      `INSERT INTO notifications (user_id, title, message, type, action_url)
       VALUES (:user_id, :title, :message, :type, :action_url)
       RETURNING id`,
      {
        replacements: { user_id, title, message, type, action_url },
        type: QueryTypes.INSERT,
      }
    );
    res.json({ success: true, data: { id: rows[0][0]?.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
