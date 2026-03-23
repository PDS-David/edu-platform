// server/routes/catalogRoutes.js
// ---------------------------------------------------------------------------
// Admin-only endpoints for managing the catalog:
//   Level 1 — EXAM TYPES: exam_boards table
//   Level 2 — SUBJECTS:   subjects table
//   Teachers:             teacher_subjects table
//
// Endpoints:
//   GET    /api/catalog/stats
//   GET    /api/catalog/all-subjects
//   GET    /api/catalog/types
//   POST   /api/catalog/types
//   PUT    /api/catalog/types/:id
//   DELETE /api/catalog/types/:id
//   GET    /api/catalog/types/:id/subjects
//   POST   /api/catalog/types/:id/subjects
//   PUT    /api/catalog/subjects/:id
//   DELETE /api/catalog/subjects/:id
//   GET    /api/catalog/teachers
//   GET    /api/catalog/teachers/:teacherId/subjects
//   POST   /api/catalog/teachers/:teacherId/assign
//   DELETE /api/catalog/teachers/:teacherId/subjects/:subjectId
//
// SCHEMA FACTS (confirmed from DB diagnostic):
//   exam_boards.id       — UUID (uuid_generate_v4())
//   subjects.id          — UUID
//   teacher_subjects.id  — INTEGER SERIAL (not UUID)
//   teacher_subjects UNIQUE constraint: (teacher_id, subject_id)
//   teacher_subjects.exam_board_id — nullable (LEFT JOIN required)
//
// FIXES v1.1:
//   A. GET /teachers/:teacherId/subjects — changed INNER JOIN exam_boards to LEFT JOIN
//      so teachers with NULL exam_board_id assignments are not silently dropped
//   B. GET /teachers/:teacherId/subjects — added AND ts.is_active = true filter
//   C. GET /teachers — added AND u.is_active = true to exclude deactivated accounts
//   D. POST /catalog/types — switched RETURNING query to QueryTypes.SELECT so the
//      inserted row is returned correctly (Sequelize RETURNING + QueryTypes.INSERT
//      requires result[0][0]; QueryTypes.SELECT returns rows directly as array)
// ---------------------------------------------------------------------------

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect } = require('../middleware/auth');

// ── Admin guard ───────────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// Apply auth + admin guard to all routes in this file
router.use(protect);
router.use(adminOnly);

// ---------------------------------------------------------------------------
// GET /api/catalog/stats
// Real-time platform stats for admin dashboard cards
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
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[GET /api/catalog/stats]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/all-subjects
// All active subjects across all exam boards — used by teacher assignment picker
// ---------------------------------------------------------------------------
router.get('/all-subjects', async (req, res) => {
  try {
    const subjects = await sequelize.query(
      `SELECT
         s.id, s.name, s.code, s.icon_emoji, s.color,
         s.category, s.is_active,
         eb.id   AS exam_board_id,
         eb.code AS exam_board_code,
         eb.name AS exam_board_name
       FROM subjects s
       JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE s.is_active = true
         AND eb.is_active = true
       ORDER BY eb.display_order ASC, s.name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: subjects.length, data: subjects });
  } catch (err) {
    console.error('[GET /api/catalog/all-subjects]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subjects' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/types
// List all exam types (active + inactive) with subject counts
// ---------------------------------------------------------------------------
router.get('/types', async (req, res) => {
  try {
    const types = await sequelize.query(
      `SELECT
         eb.id,
         eb.code,
         eb.name,
         eb.full_name,
         eb.description,
         eb.country,
         eb.icon_emoji,
         eb.display_order,
         eb.is_active,
         eb.created_at,
         eb.updated_at,
         COUNT(s.id)::INTEGER AS subject_count
       FROM exam_boards eb
       LEFT JOIN subjects s ON s.exam_board_id = eb.id AND s.is_active = true
       GROUP BY eb.id
       ORDER BY eb.display_order ASC, eb.name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: types.length, data: types });
  } catch (err) {
    console.error('[GET /api/catalog/types]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch exam types' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/types
// Create a new exam type
// Body: { code, name, full_name, description, country, icon_emoji, display_order }
// ---------------------------------------------------------------------------
router.post('/types', async (req, res) => {
  const {
    code, name, full_name, description,
    country, icon_emoji, display_order,
  } = req.body;

  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'code and name are required' });
  }

  if (!/^[A-Z0-9-]+$/.test(code.toUpperCase())) {
    return res.status(400).json({
      success: false,
      error: 'Code must contain only uppercase letters, numbers and hyphens',
    });
  }

  try {
    const existing = await sequelize.query(
      `SELECT id FROM exam_boards WHERE UPPER(code) = UPPER(:code)`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Code '${code.toUpperCase()}' already exists`,
      });
    }

    let order = parseInt(display_order) || 0;
    if (!order) {
      const maxOrder = await sequelize.query(
        `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM exam_boards`,
        { type: QueryTypes.SELECT }
      );
      order = maxOrder[0].next_order;
    }

    // FIX D: Use QueryTypes.SELECT with RETURNING so Sequelize returns the row
    // directly as an array rather than [rows, metadata]
    const result = await sequelize.query(
      `INSERT INTO exam_boards
         (code, name, full_name, description, country,
          icon_emoji, display_order, is_active, created_at, updated_at)
       VALUES
         (UPPER(:code), :name, :full_name, :description, :country,
          :icon_emoji, :display_order, true, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          code:          code.toUpperCase(),
          name,
          full_name:     full_name   || name,
          description:   description || null,
          country:       country     || 'Nigeria',
          icon_emoji:    icon_emoji  || '📚',
          display_order: order,
        },
        type: QueryTypes.SELECT,
      }
    );

    return res.status(201).json({
      success: true,
      message: `Exam type '${name}' created successfully`,
      data: result[0],
    });
  } catch (err) {
    console.error('[POST /api/catalog/types]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create exam type' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/catalog/types/:id
// Edit an exam type — :id is UUID
// ---------------------------------------------------------------------------
router.put('/types/:id', async (req, res) => {
  const typeId = req.params.id;
  if (!typeId) return res.status(400).json({ success: false, error: 'Invalid type ID' });

  const {
    name, full_name, description, country,
    icon_emoji, display_order, is_active,
  } = req.body;

  try {
    const existing = await sequelize.query(
      `SELECT id FROM exam_boards WHERE id = :id`,
      { replacements: { id: typeId }, type: QueryTypes.SELECT }
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Exam type not found' });
    }

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
          id:            typeId,
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

    return res.status(200).json({ success: true, message: 'Exam type updated successfully' });
  } catch (err) {
    console.error(`[PUT /api/catalog/types/${typeId}]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to update exam type' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/catalog/types/:id
// Soft-delete (deactivate) an exam type — blocks if active subjects exist
// ---------------------------------------------------------------------------
router.delete('/types/:id', async (req, res) => {
  const typeId = req.params.id;
  if (!typeId) return res.status(400).json({ success: false, error: 'Invalid type ID' });

  try {
    const subjectCount = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS cnt
       FROM subjects WHERE exam_board_id = :id AND is_active = true`,
      { replacements: { id: typeId }, type: QueryTypes.SELECT }
    );

    if (subjectCount[0].cnt > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot deactivate: ${subjectCount[0].cnt} active subject(s) exist under this type. Deactivate them first.`,
      });
    }

    await sequelize.query(
      `UPDATE exam_boards SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: typeId }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Exam type deactivated' });
  } catch (err) {
    console.error(`[DELETE /api/catalog/types/${typeId}]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to deactivate exam type' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/types/:id/subjects
// All subjects (active + inactive) under a given exam type
// ---------------------------------------------------------------------------
router.get('/types/:id/subjects', async (req, res) => {
  const typeId = req.params.id;
  if (!typeId) return res.status(400).json({ success: false, error: 'Invalid type ID' });

  try {
    const subjects = await sequelize.query(
      `SELECT
         s.id, s.name, s.code, s.subject_code, s.description,
         s.icon_emoji, s.color, s.category, s.level,
         s.question_count, s.video_count, s.notes_count,
         s.past_papers_count, s.is_active, s.created_at
       FROM subjects s
       WHERE s.exam_board_id = :typeId
       ORDER BY s.name ASC`,
      { replacements: { typeId }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, count: subjects.length, data: subjects });
  } catch (err) {
    console.error(`[GET /api/catalog/types/${typeId}/subjects]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subjects' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/types/:id/subjects
// Add a new subject under an exam type
// Body: { name, code, description, icon_emoji, color, category, level }
// ---------------------------------------------------------------------------
router.post('/types/:id/subjects', async (req, res) => {
  const typeId = req.params.id;
  if (!typeId) return res.status(400).json({ success: false, error: 'Invalid type ID' });

  const { name, code, description, icon_emoji, color, category, level } = req.body;

  if (!name || !code) {
    return res.status(400).json({ success: false, error: 'name and code are required' });
  }

  try {
    const typeCheck = await sequelize.query(
      `SELECT id, name FROM exam_boards WHERE id = :id AND is_active = true`,
      { replacements: { id: typeId }, type: QueryTypes.SELECT }
    );
    if (!typeCheck.length) {
      return res.status(404).json({ success: false, error: 'Exam type not found or inactive' });
    }

    const dupCheck = await sequelize.query(
      `SELECT id FROM subjects WHERE UPPER(code) = UPPER(:code)`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    if (dupCheck.length > 0) {
      return res.status(409).json({ success: false, error: `Subject code '${code}' already exists` });
    }

    // FIX D: Use QueryTypes.SELECT with RETURNING for correct row return
    const result = await sequelize.query(
      `INSERT INTO subjects
         (id, name, code, description, icon_emoji, color,
          category, level, exam_board_id, is_active,
          question_count, video_count, notes_count, past_papers_count,
          created_at)
       VALUES
         (gen_random_uuid(), :name, UPPER(:code), :description, :icon_emoji,
          :color, :category, :level, :typeId, true,
          0, 0, 0, 0, NOW())
       RETURNING *`,
      {
        replacements: {
          name,
          code,
          description: description || null,
          icon_emoji:  icon_emoji  || '📚',
          color:       color       || '#16A34A',
          category:    category    || 'General',
          level:       level       || null,
          typeId,
        },
        type: QueryTypes.SELECT,
      }
    );

    return res.status(201).json({
      success: true,
      message: `Subject '${name}' added successfully`,
      data: result[0],
    });
  } catch (err) {
    console.error(`[POST /api/catalog/types/${typeId}/subjects]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to add subject' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/catalog/subjects/:id
// Edit a subject
// ---------------------------------------------------------------------------
router.put('/subjects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, icon_emoji, color, category, level, is_active } = req.body;

  try {
    const existing = await sequelize.query(
      `SELECT id FROM subjects WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Subject not found' });
    }

    await sequelize.query(
      `UPDATE subjects SET
         name        = COALESCE(:name,        name),
         description = COALESCE(:description, description),
         icon_emoji  = COALESCE(:icon_emoji,  icon_emoji),
         color       = COALESCE(:color,       color),
         category    = COALESCE(:category,    category),
         level       = COALESCE(:level,       level),
         is_active   = COALESCE(:is_active,   is_active)
       WHERE id = :id`,
      {
        replacements: {
          id,
          name:        name        ?? null,
          description: description ?? null,
          icon_emoji:  icon_emoji  ?? null,
          color:       color       ?? null,
          category:    category    ?? null,
          level:       level       ?? null,
          is_active:   is_active   != null ? is_active : null,
        },
        type: QueryTypes.UPDATE,
      }
    );

    return res.status(200).json({ success: true, message: 'Subject updated successfully' });
  } catch (err) {
    console.error(`[PUT /api/catalog/subjects/${id}]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to update subject' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/catalog/subjects/:id
// Soft-delete (deactivate) a subject
// ---------------------------------------------------------------------------
router.delete('/subjects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await sequelize.query(
      `UPDATE subjects SET is_active = false WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.status(200).json({ success: true, message: 'Subject deactivated' });
  } catch (err) {
    console.error(`[DELETE /api/catalog/subjects/${id}]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to deactivate subject' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/teachers
// List all active teachers with their assigned subject count
// FIX C: Added AND u.is_active = true to exclude deactivated accounts
// ---------------------------------------------------------------------------
router.get('/teachers', async (req, res) => {
  try {
    const teachers = await sequelize.query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.is_active,
         COUNT(ts.id)::INTEGER AS assigned_subjects
       FROM users u
       LEFT JOIN teacher_subjects ts
         ON ts.teacher_id = u.id AND ts.is_active = true
       WHERE u.role = 'teacher'
         AND u.is_active = true
       GROUP BY u.id
       ORDER BY u.first_name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: teachers.length, data: teachers });
  } catch (err) {
    console.error('[GET /api/catalog/teachers]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch teachers' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog/teachers/:teacherId/subjects
// All active subject assignments for a specific teacher
//
// FIX A: Changed JOIN exam_boards to LEFT JOIN so assignments where
//         exam_board_id IS NULL are not silently dropped.
// FIX B: Added AND ts.is_active = true to exclude revoked assignments.
// ---------------------------------------------------------------------------
router.get('/teachers/:teacherId/subjects', async (req, res) => {
  const { teacherId } = req.params;
  try {
    const subjects = await sequelize.query(
      `SELECT
         ts.teacher_id,
         ts.subject_id,
         ts.exam_board_id,
         ts.is_active,
         ts.assigned_at,
         s.name        AS subject_name,
         s.icon_emoji,
         s.code,
         eb.name       AS exam_board_name,
         eb.code       AS exam_board_code
       FROM teacher_subjects ts
       JOIN subjects    s  ON s.id  = ts.subject_id
       LEFT JOIN exam_boards eb ON eb.id = ts.exam_board_id
       WHERE ts.teacher_id = :teacherId
         AND ts.is_active  = true
       ORDER BY eb.name ASC NULLS LAST, s.name ASC`,
      { replacements: { teacherId }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: subjects });
  } catch (err) {
    console.error('[GET /api/catalog/teachers/:id/subjects]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch teacher subjects' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/teachers/:teacherId/assign
// Assign one or more subjects to a teacher
// Body: { subject_ids: [uuid, ...] }
//
// SCHEMA NOTE: teacher_subjects.id is INTEGER SERIAL — the ON CONFLICT clause
// correctly uses the (teacher_id, subject_id) unique constraint, not the id.
// ---------------------------------------------------------------------------
router.post('/teachers/:teacherId/assign', async (req, res) => {
  const { teacherId } = req.params;
  const { subject_ids } = req.body;

  if (!subject_ids || !Array.isArray(subject_ids) || subject_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'subject_ids array is required' });
  }

  try {
    const teacher = await sequelize.query(
      `SELECT id, first_name, last_name FROM users
       WHERE id = :id AND role = 'teacher' AND is_active = true`,
      { replacements: { id: teacherId }, type: QueryTypes.SELECT }
    );
    if (!teacher.length) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    let assigned = 0;
    for (const subjectId of subject_ids) {
      const subjectRows = await sequelize.query(
        `SELECT id, exam_board_id FROM subjects WHERE id = :id AND is_active = true`,
        { replacements: { id: subjectId }, type: QueryTypes.SELECT }
      );
      if (!subjectRows.length) continue;

      await sequelize.query(
        `INSERT INTO teacher_subjects
           (teacher_id, subject_id, exam_board_id, assigned_by, assigned_at, is_active)
         VALUES (:teacherId, :subjectId, :examBoardId, :adminId, NOW(), true)
         ON CONFLICT (teacher_id, subject_id) DO UPDATE SET
           is_active   = true,
           assigned_by = EXCLUDED.assigned_by,
           assigned_at = NOW()`,
        {
          replacements: {
            teacherId,
            subjectId,
            examBoardId: subjectRows[0].exam_board_id || null,
            adminId:     req.user.id,
          },
          type: QueryTypes.INSERT,
        }
      );
      assigned++;
    }

    return res.status(200).json({
      success: true,
      message: `${assigned} subject(s) assigned to ${teacher[0].first_name} ${teacher[0].last_name}`,
    });
  } catch (err) {
    console.error('[POST /api/catalog/teachers/:id/assign]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to assign subjects' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/catalog/teachers/:teacherId/subjects/:subjectId
// Revoke a subject assignment from a teacher (soft delete)
//
// SCHEMA NOTE: teacher_subjects.id is INTEGER SERIAL — we filter by the
// (teacher_id, subject_id) composite key, NOT by id, since the frontend
// does not have the integer id.
// ---------------------------------------------------------------------------
router.delete('/teachers/:teacherId/subjects/:subjectId', async (req, res) => {
  const { teacherId, subjectId } = req.params;
  try {
    await sequelize.query(
      `UPDATE teacher_subjects
       SET is_active = false
       WHERE teacher_id = :teacherId
         AND subject_id = :subjectId`,
      { replacements: { teacherId, subjectId }, type: QueryTypes.UPDATE }
    );
    return res.status(200).json({ success: true, message: 'Subject assignment revoked' });
  } catch (err) {
    console.error('[DELETE /api/catalog/teachers/:id/subjects/:sid]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to revoke assignment' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/catalog/activate-exam-types
// Stub — actual activation is in /api/payments/activate-exam-types
// ---------------------------------------------------------------------------
router.post('/activate-exam-types', async (req, res) => {
  return res.status(404).json({
    success: false,
    error: 'Use /api/payments/activate-exam-types instead',
  });
});

module.exports = router;
