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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
