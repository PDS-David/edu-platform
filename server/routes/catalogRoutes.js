'use strict';

// server/routes/catalogRoutes.js
// Uses only columns that actually exist in the DB models:
//   exam_boards: id, code, name, full_name, description, country, icon_emoji, display_order, is_active, created_at, updated_at
//   subjects:    id, exam_board_id, name, code, level, description, image_url, is_active, created_at, updated_at
//   teacher_subjects: id, teacher_id, subject_id, exam_board_id, assigned_by, is_active, assigned_at

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// GET /api/catalog/stats  — admin dashboard summary cards (public, no auth)
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM users WHERE is_active = true)                      AS total_users,
         (SELECT COUNT(*)::INTEGER FROM users WHERE role = 'student' AND is_active = true) AS active_students,
         (SELECT COUNT(*)::INTEGER FROM exam_boards WHERE is_active = true)                AS total_exam_types,
         (SELECT COUNT(*)::INTEGER FROM subjects WHERE is_active = true)                   AS total_subjects`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: rows[0] || {} });
  } catch (err) {
    console.error('[GET /catalog/stats]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/all-subjects — all active subjects (teacher assignment picker)
// ---------------------------------------------------------------------------
router.get('/all-subjects', async (req, res) => {
  try {
    const subjects = await sequelize.query(
      `SELECT
         s.id, s.name, s.code, s.level, s.description, s.is_active,
         eb.id   AS exam_board_id,
         eb.code AS exam_board_code,
         eb.name AS exam_board_name
       FROM subjects s
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE s.is_active = true
       ORDER BY eb.name ASC NULLS LAST, s.name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: subjects.length, data: subjects });
  } catch (err) {
    console.error('[GET /catalog/all-subjects]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/types — list all exam types with subject counts
// ---------------------------------------------------------------------------
router.get('/types', async (req, res) => {
  try {
    const types = await sequelize.query(
      `SELECT
         eb.id, eb.code, eb.name, eb.full_name, eb.description,
         eb.country, eb.icon_emoji, eb.display_order, eb.is_active,
         eb.created_at, eb.updated_at,
         COUNT(s.id)::INTEGER AS subject_count
       FROM exam_boards eb
       LEFT JOIN subjects s ON s.exam_board_id = eb.id AND s.is_active = true
       GROUP BY eb.id
       ORDER BY eb.display_order ASC NULLS LAST, eb.name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: types.length, data: types });
  } catch (err) {
    console.error('[GET /catalog/types]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/types — create exam type
// ---------------------------------------------------------------------------
router.post('/types', protect, authorize('admin'), async (req, res) => {
  const { code, name, full_name, description, country, icon_emoji, display_order } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, error: 'code and name are required' });

  try {
    const existing = await sequelize.query(
      `SELECT id FROM exam_boards WHERE UPPER(code) = UPPER(:code)`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    if (existing.length) return res.status(409).json({ success: false, error: `Code '${code.toUpperCase()}' already exists` });

    let order = parseInt(display_order) || 0;
    if (!order) {
      const maxOrder = await sequelize.query(
        `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM exam_boards`,
        { type: QueryTypes.SELECT }
      );
      order = maxOrder[0].next_order;
    }

    const result = await sequelize.query(
      `INSERT INTO exam_boards (code, name, full_name, description, country, icon_emoji, display_order, is_active, created_at, updated_at)
       VALUES (UPPER(:code), :name, :full_name, :description, :country, :icon_emoji, :display_order, true, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          code: code.toUpperCase(), name,
          full_name:     full_name    || name,
          description:   description  || null,
          country:       country      || 'Nigeria',
          icon_emoji:    icon_emoji   || '',
          display_order: order,
        },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, message: `Exam type '${name}' created`, data: result[0] });
  } catch (err) {
    console.error('[POST /catalog/types]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/catalog/types/:id — update exam type
// ---------------------------------------------------------------------------
router.put('/types/:id', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, full_name, description, country, icon_emoji, display_order, is_active } = req.body;
  try {
    await sequelize.query(
      `UPDATE exam_boards SET
         name          = COALESCE(:name,         name),
         full_name     = COALESCE(:full_name,     full_name),
         description   = COALESCE(:description,   description),
         country       = COALESCE(:country,       country),
         icon_emoji    = COALESCE(:icon_emoji,    icon_emoji),
         display_order = COALESCE(:display_order, display_order),
         is_active     = COALESCE(:is_active,     is_active),
         updated_at    = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id,
          name:          name          ?? null,
          full_name:     full_name     ?? null,
          description:   description   ?? null,
          country:       country       ?? null,
          icon_emoji:    icon_emoji    ?? null,
          display_order: display_order != null ? parseInt(display_order) : null,
          is_active:     is_active     != null ? is_active : null,
        },
        type: QueryTypes.UPDATE,
      }
    );
    return res.status(200).json({ success: true, message: 'Exam type updated' });
  } catch (err) {
    console.error('[PUT /catalog/types/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/catalog/types/:id — deactivate exam type AND cascade to all subjects
// No need to deactivate subjects manually first — this does it automatically.
// Acts like a Recycle Bin: sets is_active=false, can be reactivated or permanently deleted.
router.delete('/types/:id', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const typeRows = await sequelize.query(
      `SELECT id, name FROM exam_boards WHERE id::text = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!typeRows.length) return res.status(404).json({ success: false, error: 'Exam type not found' });

    // Cascade: deactivate all subjects under this exam type first
    await sequelize.query(
      `UPDATE subjects SET is_active = false, updated_at = NOW() WHERE exam_board_id::text = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    // Then deactivate the exam type itself
    await sequelize.query(
      `UPDATE exam_boards SET is_active = false, updated_at = NOW() WHERE id::text = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.status(200).json({ success: true, message: 'Exam type and all its subjects deactivated' });
  } catch (err) {
    console.error('[DELETE /catalog/types/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/catalog/types/:id/reactivate — restore a deactivated exam type
// Subjects remain deactivated — admin re-activates subjects individually if needed.
router.post('/types/:id/reactivate', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await sequelize.query(
      `UPDATE exam_boards SET is_active = true, updated_at = NOW() WHERE id::text = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.status(200).json({ success: true, message: 'Exam type reactivated' });
  } catch (err) {
    console.error('[POST /catalog/types/:id/reactivate]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/catalog/types/:id/permanent — true hard delete, only allowed when inactive
router.delete('/types/:id/permanent', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const typeRows = await sequelize.query(
      `SELECT id, is_active FROM exam_boards WHERE id::text = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!typeRows.length) return res.status(404).json({ success: false, error: 'Exam type not found' });
    if (typeRows[0].is_active) {
      return res.status(409).json({ success: false, error: 'Deactivate the exam type before permanently deleting it.' });
    }
    // Hard delete subjects first, then the exam type
    await sequelize.query(`DELETE FROM subjects WHERE exam_board_id::text = :id`, { replacements: { id }, type: QueryTypes.DELETE });
    await sequelize.query(`DELETE FROM exam_boards WHERE id::text = :id`, { replacements: { id }, type: QueryTypes.DELETE });
    return res.status(200).json({ success: true, message: 'Exam type permanently deleted' });
  } catch (err) {
    console.error('[DELETE /catalog/types/:id/permanent]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});



// ---------------------------------------------------------------------------
// GET /api/catalog/types/:id/subjects — subjects under an exam type
// ---------------------------------------------------------------------------
router.get('/types/:id/subjects', async (req, res) => {
  const { id } = req.params;
  try {
    const subjects = await sequelize.query(
      `SELECT s.id, s.name, s.code, s.level, s.description, s.is_active, s.created_at
       FROM subjects s
       WHERE s.exam_board_id::text = :id
       ORDER BY s.name ASC`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: subjects.length, data: subjects });
  } catch (err) {
    console.error('[GET /catalog/types/:id/subjects]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/types/:id/subjects — add subject under exam type
// ---------------------------------------------------------------------------
router.post('/types/:id/subjects', protect, authorize('admin'), async (req, res) => {
  const typeId = req.params.id;
  const { name, code, description, level, icon_emoji } = req.body;
  if (!name || !code) return res.status(400).json({ success: false, error: 'name and code are required' });

  try {
    const typeCheck = await sequelize.query(
      `SELECT id FROM exam_boards WHERE id = :id AND is_active = true`,
      { replacements: { id: typeId }, type: QueryTypes.SELECT }
    );
    if (!typeCheck.length) return res.status(404).json({ success: false, error: 'Exam type not found' });

    const dup = await sequelize.query(
      `SELECT id FROM subjects WHERE UPPER(code) = UPPER(:code) AND exam_board_id::text = :typeId`,
      { replacements: { code, typeId }, type: QueryTypes.SELECT }
    );
    if (dup.length) return res.status(409).json({ success: false, error: `Code '${code}' already exists in this exam type` });

    // Fetch the board code so we can store it on the subject for future-proofing
    // (guards against exam_board_id being lost in schema migrations)
    const boardRow = await sequelize.query(
      `SELECT code FROM exam_boards WHERE id = :id LIMIT 1`,
      { replacements: { id: typeId }, type: QueryTypes.SELECT }
    );
    const boardCode = boardRow[0]?.code || null;

    const result = await sequelize.query(
      `INSERT INTO subjects (exam_board_id, exam_board_code, name, code, description, level, icon_emoji, is_active, created_at, updated_at)
       VALUES (:typeId, :boardCode, :name, UPPER(:code), :description, :level, :icon_emoji, true, NOW(), NOW())
       RETURNING *`,
      {
        replacements: { typeId, boardCode, name, code, description: description || null, level: level || null, icon_emoji: icon_emoji || null },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, message: `Subject '${name}' added`, data: result[0] });
  } catch (err) {
    console.error('[POST /catalog/types/:id/subjects]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/catalog/subjects/:id — update subject
// ---------------------------------------------------------------------------
router.put('/subjects/:id', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { name, description, level, icon_emoji, is_active } = req.body;
  try {
    await sequelize.query(
      `UPDATE subjects SET
         name        = COALESCE(:name,        name),
         description = COALESCE(:description, description),
         level       = COALESCE(:level,       level),
         icon_emoji  = COALESCE(:icon_emoji,  icon_emoji),
         is_active   = COALESCE(:is_active,   is_active),
         updated_at  = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id,
          name:        name        ?? null,
          description: description ?? null,
          level:       level       ?? null,
          icon_emoji:  icon_emoji  ?? null,
          is_active:   is_active   != null ? is_active : null,
        },
        type: QueryTypes.UPDATE,
      }
    );
    return res.status(200).json({ success: true, message: 'Subject updated' });
  } catch (err) {
    console.error('[PUT /catalog/subjects/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/catalog/subjects/:id — soft-delete subject
// ---------------------------------------------------------------------------
router.delete('/subjects/:id', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await sequelize.query(`UPDATE subjects SET is_active = false, updated_at = NOW() WHERE id = :id`, { replacements: { id }, type: QueryTypes.UPDATE });
    return res.status(200).json({ success: true, message: 'Subject deactivated' });
  } catch (err) {
    console.error('[DELETE /catalog/subjects/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/teachers — all teachers with subject count
// ---------------------------------------------------------------------------
router.get('/teachers', protect, authorize('admin'), async (req, res) => {
  try {
    // teacher_subjects may not exist yet — graceful fallback
    let teachers;
    try {
      teachers = await sequelize.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.is_active,
           COUNT(ts.id)::INTEGER AS assigned_subjects
         FROM users u
         LEFT JOIN teacher_subjects ts ON ts.teacher_id = u.id AND ts.is_active = true
         WHERE u.role = 'teacher' AND u.is_active = true
         GROUP BY u.id ORDER BY u.first_name ASC`,
        { type: QueryTypes.SELECT }
      );
    } catch {
      teachers = await sequelize.query(
        `SELECT id, first_name, last_name, email, is_active, 0::INTEGER AS assigned_subjects
         FROM users WHERE role = 'teacher' AND is_active = true ORDER BY first_name ASC`,
        { type: QueryTypes.SELECT }
      );
    }
    return res.status(200).json({ success: true, count: teachers.length, data: teachers });
  } catch (err) {
    console.error('[GET /catalog/teachers]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/teachers/:teacherId/subjects
// ---------------------------------------------------------------------------
router.get('/teachers/:teacherId/subjects', protect, authorize('admin'), async (req, res) => {
  const { teacherId } = req.params;
  try {
    const subjects = await sequelize.query(
      `SELECT ts.teacher_id, ts.subject_id, ts.exam_board_id, ts.is_active, ts.assigned_at,
         s.name AS subject_name, s.code,
         eb.name AS exam_board_name, eb.code AS exam_board_code
       FROM teacher_subjects ts
       JOIN subjects    s  ON s.id  = ts.subject_id
       LEFT JOIN exam_boards eb ON eb.id::text = ts.exam_board_id::text
       WHERE ts.teacher_id = :teacherId AND ts.is_active = true
       ORDER BY s.name ASC`,
      { replacements: { teacherId }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: subjects });
  } catch (err) {
    // teacher_subjects may not exist yet
    return res.status(200).json({ success: true, data: [] });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/teachers/:teacherId/assign
// ---------------------------------------------------------------------------
router.post('/teachers/:teacherId/assign', protect, authorize('admin'), async (req, res) => {
  const { teacherId } = req.params;
  const { subject_ids } = req.body;
  if (!subject_ids?.length) return res.status(400).json({ success: false, error: 'subject_ids required' });

  try {
    const teacher = await sequelize.query(
      `SELECT id, first_name, last_name FROM users WHERE id = :id AND role = 'teacher' AND is_active = true`,
      { replacements: { id: teacherId }, type: QueryTypes.SELECT }
    );
    if (!teacher.length) return res.status(404).json({ success: false, error: 'Teacher not found' });

    let assigned = 0;
    for (const subjectId of subject_ids) {
      const sub = await sequelize.query(
        `SELECT id, exam_board_id FROM subjects WHERE id = :id AND is_active = true`,
        { replacements: { id: subjectId }, type: QueryTypes.SELECT }
      );
      if (!sub.length) continue;
      await sequelize.query(
        `INSERT INTO teacher_subjects (teacher_id, subject_id, exam_board_id, assigned_by, assigned_at, is_active)
         VALUES (:teacherId, :subjectId, :examBoardId, :adminId, NOW(), true)
         ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
        { replacements: { teacherId, subjectId, examBoardId: sub[0].exam_board_id || null, adminId: req.user.id }, type: QueryTypes.INSERT }
      );
      assigned++;
    }
    return res.status(200).json({ success: true, message: `${assigned} subject(s) assigned to ${teacher[0].first_name} ${teacher[0].last_name}` });
  } catch (err) {
    console.error('[POST /catalog/teachers/:id/assign]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/catalog/teachers/:teacherId/subjects/:subjectId
// ---------------------------------------------------------------------------
router.delete('/teachers/:teacherId/subjects/:subjectId', protect, authorize('admin'), async (req, res) => {
  const { teacherId, subjectId } = req.params;
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active = false WHERE teacher_id = :teacherId AND subject_id = :subjectId`,
      { replacements: { teacherId, subjectId }, type: QueryTypes.UPDATE }
    );
    return res.status(200).json({ success: true, message: 'Assignment revoked' });
  } catch (err) {
    console.error('[DELETE /catalog/teachers/:id/subjects/:sid]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/activate-exam-types — stub
// ---------------------------------------------------------------------------
router.post('/activate-exam-types', async (_req, res) => {
  return res.status(404).json({ success: false, error: 'Use /api/payments/activate-exam-types instead' });
});

module.exports = router;
