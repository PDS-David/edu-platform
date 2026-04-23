// server/routes/notesRoutes.js
// GET    /api/notes?subtopic_id=  — fetch notes for a subtopic (auth required)
// POST   /api/notes               — create note (teacher/admin)
// PUT    /api/notes/:id           — update note (teacher/admin, own notes only)
// DELETE /api/notes/:id           — delete note (teacher/admin, own; or admin any)

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

const teacherOrAdmin = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher or admin access required' });
  next();
};

// GET /api/notes?subtopic_id=
router.get('/', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  if (!subtopic_id)
    return res.status(400).json({ success: false, error: 'subtopic_id is required' });
  try {
    const rows = await sequelize.query(
      `SELECT rn.id, rn.title, rn.content_html, rn.created_at, rn.updated_at,
              u.first_name || ' ' || u.last_name AS author_name
       FROM revision_notes rn
       LEFT JOIN users u ON u.id = rn.created_by
       WHERE rn.subtopic_id = :subtopic_id
       ORDER BY rn.created_at ASC`,
      { replacements: { subtopic_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // revision_notes table may not exist yet — return empty gracefully
    if (err.message && err.message.includes('revision_notes')) {
      return res.json({ success: true, data: [] });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notes
router.post('/', protect, teacherOrAdmin, async (req, res) => {
  const { subtopic_id, title, content_html } = req.body;
  if (!subtopic_id || !title || !content_html)
    return res.status(400).json({ success: false, error: 'subtopic_id, title and content_html are required' });
  try {
    const result = await sequelize.query(
      `INSERT INTO revision_notes (id, subtopic_id, title, content_html, created_by, created_at, updated_at)
       VALUES (:subtopic_id, :title, :content_html, :created_by, NOW(), NOW())
       RETURNING id`,
      { replacements: { subtopic_id, title, content_html, created_by: req.user.id }, type: QueryTypes.INSERT }
    );
    return res.status(201).json({ success: true, data: { id: result[0][0].id } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/notes/:id
router.put('/:id', protect, teacherOrAdmin, async (req, res) => {
  const { title, content_html } = req.body;
  try {
    const where = req.user.role === 'admin'
      ? 'id = :id'
      : 'id = :id AND created_by = :userId';
    await sequelize.query(
      `UPDATE revision_notes SET title = :title, content_html = :content_html, updated_at = NOW()
       WHERE ${where}`,
      { replacements: { id: req.params.id, title, content_html, userId: req.user.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', protect, teacherOrAdmin, async (req, res) => {
  try {
    const where = req.user.role === 'admin'
      ? 'id = :id'
      : 'id = :id AND created_by = :userId';
    await sequelize.query(
      `DELETE FROM revision_notes WHERE ${where}`,
      { replacements: { id: req.params.id, userId: req.user.id }, type: QueryTypes.DELETE }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
