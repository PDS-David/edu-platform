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
    // Scoping: was previously readable for any subtopic_id by any
    // authenticated user. A student may only read notes for a subject
    // they're registered for; a teacher only for a subject they're
    // assigned to (fail-closed — zero assignments on record means zero
    // access, not unrestricted access).
    const subjRow = await sequelize.query(
      `SELECT subject_id FROM subtopics WHERE id = :subtopic_id LIMIT 1`,
      { replacements: { subtopic_id }, type: QueryTypes.SELECT }
    );
    const subjectId = subjRow[0]?.subject_id;
    if (subjectId && req.user.role === 'student') {
      const registered = await sequelize.query(
        `SELECT 1 FROM student_subjects ss
          WHERE ss.student_id = :studentId AND ss.subject_id = :subjectId AND ss.status = 'approved'
         UNION
         SELECT 1 FROM class_memberships cm
           JOIN class_subjects cs ON cs.class_id = cm.class_id
          WHERE cm.student_id = :studentId AND cs.subject_id = :subjectId
         LIMIT 1`,
        { replacements: { studentId: req.user.id, subjectId }, type: QueryTypes.SELECT }
      ).catch(() => []);
      if (!registered.length) {
        return res.status(403).json({ success: false, error: 'You are not registered for this subject' });
      }
    } else if (subjectId && req.user.role === 'teacher') {
      const assigned = await sequelize.query(
        `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
        { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
      );
      const assignedIds = assigned.map(r => String(r.subject_id));
      // Fail-closed: zero assignments on record means zero access.
      if (!assignedIds.includes(String(subjectId))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
      }
    }
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
    // Ownership check — was missing entirely: any teacher could attach a
    // note to any subtopic_id regardless of subject assignment. Fail-closed,
    // same as the GET / scoping above — zero assignments on record means
    // zero access.
    if (req.user.role === 'teacher') {
      const subjRow = await sequelize.query(
        `SELECT subject_id FROM subtopics WHERE id = :subtopic_id LIMIT 1`,
        { replacements: { subtopic_id }, type: QueryTypes.SELECT }
      );
      const subjectId = subjRow[0]?.subject_id;
      if (subjectId) {
        const assigned = await sequelize.query(
          `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
          { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
        );
        const assignedIds = assigned.map(r => String(r.subject_id));
        // Fail-closed: zero assignments on record means zero access.
        if (!assignedIds.includes(String(subjectId))) {
          return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
        }
      }
    }
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
