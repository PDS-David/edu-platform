// server/routes/courses.js
// ─────────────────────────────────────────────────────────────────────────────
// Course routes with enrollment-authoritative access control.
//
// Public:
//   GET  /api/courses               — catalog (no auth needed)
//   GET  /api/courses/:id           — course details (no auth needed)
//
// Enrollment-gated (students must be actively enrolled):
//   GET  /api/courses/:courseId/content         — full course content tree
//   GET  /api/courses/:courseId/assignments     — assignments for the course
//   GET  /api/courses/:courseId/assessments     — assessments for the course
//
// Staff only:
//   POST   /api/courses             — create course
//   PUT    /api/courses/:id         — update course
//   DELETE /api/courses/:id         — delete course
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const db             = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const {
  requireEnrollment,
  validateEnrollmentIntegrity,
  auditEnrollment,
} = require('../middleware/enrollmentAccess');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses — public catalog
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { subject_id, is_free, level, q } = req.query;
    const conditions   = ['c.is_active = true'];
    const replacements = {};

    if (subject_id && /^\d+$/.test(subject_id)) {
      conditions.push('c.subject_id = :subjectId');
      replacements.subjectId = parseInt(subject_id, 10);
    }
    if (is_free !== undefined) {
      conditions.push('c.is_free = :isFree');
      replacements.isFree = is_free === 'true';
    }
    if (level) {
      conditions.push('c.level = :level');
      replacements.level = level;
    }
    if (q && String(q).trim()) {
      conditions.push('c.title ILIKE :q');
      replacements.q = `%${String(q).trim()}%`;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const courses = await db.query(
      `SELECT c.id, c.title, c.description, c.price, c.currency,
              c.is_free, c.is_premium, c.thumbnail_url, c.level,
              c.duration_hours, c.created_at,
              s.name AS subject_name,
              COUNT(DISTINCT v.id)::INTEGER AS video_count
         FROM courses c
         LEFT JOIN subjects s ON s.id = c.subject_id
         LEFT JOIN videos   v ON v.course_id = c.id AND v.upload_status = 'ready'
         ${where}
        GROUP BY c.id, s.name
        ORDER BY c.created_at DESC
        LIMIT 200`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: courses, count: courses.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/:id — public course detail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT c.id, c.title, c.description, c.price, c.currency,
              c.is_free, c.is_premium, c.thumbnail_url, c.level,
              c.duration_hours, c.is_active, c.created_at,
              s.name AS subject_name
         FROM courses c
         LEFT JOIN subjects s ON s.id = c.subject_id
        WHERE c.id = :id AND c.is_active = true
        LIMIT 1`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    return res.json({ success: true, course: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/:courseId/content
// Full course content tree (topics, subtopics, videos, resources).
// REQUIRES active enrollment.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:courseId/content',
  protect,
  validateEnrollmentIntegrity,
  requireEnrollment('course'),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      const topics = await db.query(
        `SELECT t.id, t.name, t.description, t.order_index,
                s.name AS subject_name
           FROM topics t
           JOIN subjects s ON s.id = t.subject_id
           JOIN course_subjects cs ON cs.subject_id = s.id
          WHERE cs.course_id = :courseId
          ORDER BY t.order_index, t.name`,
        { replacements: { courseId }, type: QueryTypes.SELECT }
      );

      const videos = await db.query(
        `SELECT v.id, v.title, v.course_id, v.duration_seconds,
                v.required_tier, v.is_free, v.upload_status
           FROM videos v
          WHERE v.course_id = :courseId
            AND v.upload_status = 'ready'
          ORDER BY v.created_at`,
        { replacements: { courseId }, type: QueryTypes.SELECT }
      );

      auditEnrollment('COURSE_CONTENT_ACCESSED', req, { courseId });

      return res.json({ success: true, courseId, topics, videos });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/:courseId/assignments
// REQUIRES active enrollment.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:courseId/assignments',
  protect,
  validateEnrollmentIntegrity,
  requireEnrollment('assignment'),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      // Assignments are resources with push_type = 'assignment' or similar.
      // We also check resource_assignments for the enrolled student.
      const rows = await db.query(
        `SELECT r.id, r.title, r.resource_type, r.file_url, r.mime_type,
                r.push_type, r.created_at,
                ra.assigned_at
           FROM resources r
           JOIN resource_assignments ra ON ra.resource_id = r.id
           JOIN subjects s ON s.id = r.subject_id
           JOIN course_subjects cs ON cs.subject_id = s.id
          WHERE cs.course_id  = :courseId
            AND r.is_active   = true
            AND (r.is_staged  = false OR r.is_staged IS NULL)
            AND ra.student_id = :userId
          ORDER BY r.created_at DESC`,
        { replacements: { courseId, userId: req.user.id }, type: QueryTypes.SELECT }
      );

      auditEnrollment('ASSIGNMENTS_ACCESSED', req, { courseId });

      return res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/:courseId/assessments
// Returns quizzes/practice questions available for the course.
// REQUIRES active enrollment.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:courseId/assessments',
  protect,
  validateEnrollmentIntegrity,
  requireEnrollment('assessment'),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      const rows = await db.query(
        `SELECT q.id, q.question_text, q.marks, q.difficulty, q.type,
                q.subtopic_id, t.name AS topic_name, s.name AS subject_name
           FROM questions q
           JOIN subtopics  st ON st.id = q.subtopic_id
           JOIN topics      t  ON t.id  = st.topic_id
           JOIN subjects    s  ON s.id  = t.subject_id
           JOIN course_subjects cs ON cs.subject_id = s.id
          WHERE cs.course_id = :courseId
            AND q.is_active  = true
            AND COALESCE(q.status, 'approved') IN ('approved', 'active')
          ORDER BY q.difficulty, RANDOM()
          LIMIT 100`,
        { replacements: { courseId }, type: QueryTypes.SELECT }
      );

      auditEnrollment('ASSESSMENTS_ACCESSED', req, { courseId });

      return res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/courses — create (teacher/admin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const {
      title, description, subject_id, price = 0, currency = 'GBP',
      is_free = false, is_premium = false, thumbnail_url, level, duration_hours,
    } = req.body;

    if (!title) return res.status(400).json({ success: false, error: 'title is required' });

    const [rows] = await db.query(
      `INSERT INTO courses
         (title, description, subject_id, price, currency, is_free, is_premium,
          thumbnail_url, level, duration_hours, is_active, created_by, created_at, updated_at)
       VALUES
         (:title, :description, :subjectId, :price, :currency, :isFree, :isPremium,
          :thumbnailUrl, :level, :durationHours, true, :createdBy, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          title, description: description || null,
          subjectId: subject_id || null, price, currency,
          isFree: is_free, isPremium: is_premium,
          thumbnailUrl: thumbnail_url || null,
          level: level || null, durationHours: duration_hours || null,
          createdBy: req.user.id,
        },
      }
    );

    return res.status(201).json({ success: true, course: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/courses/:id — update (teacher/admin)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, price, currency, is_free, is_premium,
      thumbnail_url, level, duration_hours, is_active,
    } = req.body;

    const [rows] = await db.query(
      `UPDATE courses
          SET title          = COALESCE(:title, title),
              description    = COALESCE(:description, description),
              price          = COALESCE(:price, price),
              currency       = COALESCE(:currency, currency),
              is_free        = COALESCE(:isFree, is_free),
              is_premium     = COALESCE(:isPremium, is_premium),
              thumbnail_url  = COALESCE(:thumbnailUrl, thumbnail_url),
              level          = COALESCE(:level, level),
              duration_hours = COALESCE(:durationHours, duration_hours),
              is_active      = COALESCE(:isActive, is_active),
              updated_at     = NOW()
        WHERE id = :id
        RETURNING *`,
      {
        replacements: {
          id,
          title: title || null, description: description || null,
          price: price ?? null, currency: currency || null,
          isFree: is_free ?? null, isPremium: is_premium ?? null,
          thumbnailUrl: thumbnail_url || null, level: level || null,
          durationHours: duration_hours ?? null, isActive: is_active ?? null,
        },
      }
    );

    if (!rows || !rows[0]) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    return res.json({ success: true, course: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/courses/:id — admin only
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `UPDATE courses SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id } }
    );

    return res.json({ success: true, message: 'Course deactivated' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
