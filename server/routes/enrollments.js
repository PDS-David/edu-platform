// server/routes/enrollments.js
// ─────────────────────────────────────────────────────────────────────────────
// Enrollment CRUD + lifecycle management
//
// Routes:
//   GET    /api/enrollments                    — list enrollments (own or all for admin)
//   POST   /api/enrollments                    — enroll a student in a course
//   GET    /api/enrollments/:id                — get one enrollment
//   PATCH  /api/enrollments/:id/status         — transition status (admin/teacher)
//   DELETE /api/enrollments/:id                — cancel own enrollment / admin hard-delete
//   GET    /api/enrollments/course/:courseId   — check own enrollment for a course
//   GET    /api/enrollments/validate/:courseId — validate access (used by UI guards)
//
// Status transitions allowed:
//   pending   → active | cancelled
//   active    → expired | suspended | cancelled
//   expired   → active  (re-enroll / renewal)
//   suspended → active  | cancelled
//   cancelled → (terminal — admin can re-open via new enroll)
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
  resolveEnrollmentStatus,
  auditEnrollment,
} = require('../middleware/enrollmentAccess');
const logger = require('../config/logger');

// ── Valid lifecycle transitions ───────────────────────────────────────────────
const TRANSITIONS = {
  pending:   ['active', 'cancelled'],
  active:    ['expired', 'suspended', 'cancelled'],
  expired:   ['active'],
  suspended: ['active', 'cancelled'],
  cancelled: [],   // terminal; must create a new enrollment to re-enroll
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/enrollments
// Students: their own enrollments. Teachers/admins: all, with filters.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, validateEnrollmentIntegrity, async (req, res) => {
  try {
    const isStaff  = ['admin', 'teacher'].includes(req.user.role);
    const userId   = req.user.id;
    const { status, course_id, student_id } = req.query;

    const conditions = [];
    const replacements = {};

    if (!isStaff) {
      // Students only see their own
      conditions.push('(e.student_id = :userId OR e.user_id = :userId)');
      replacements.userId = userId;
    } else if (student_id) {
      conditions.push('(e.student_id = :studentId OR e.user_id = :studentId)');
      replacements.studentId = student_id;
    }

    if (status) {
      conditions.push('e.status = :status');
      replacements.status = status;
    }
    if (course_id) {
      conditions.push('e.course_id = :courseId');
      replacements.courseId = parseInt(course_id, 10);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await db.query(
      `SELECT e.id, e.student_id, e.user_id, e.course_id, e.status,
              e.enrollment_date, e.expires_at, e.completed_at,
              e.progress_percentage, e.payment_id,
              e.suspended_at, e.suspended_reason, e.cancelled_at,
              e.created_at, e.updated_at,
              c.title  AS course_title,
              u.email  AS student_email,
              TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS student_name
         FROM enrollments e
         LEFT JOIN courses c ON c.id = e.course_id
         LEFT JOIN users   u ON u.id = COALESCE(e.student_id, e.user_id)
         ${where}
        ORDER BY e.created_at DESC
        LIMIT 500`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('[GET /enrollments]', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/enrollments/validate/:courseId
// Quick enrollment gate used by the UI before loading gated content.
// Returns: { enrolled, status, access_granted }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/validate/:courseId', protect, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    const isStaff = ['admin', 'teacher'].includes(req.user.role);

    if (isStaff) {
      return res.json({ success: true, enrolled: true, status: 'active', access_granted: true, bypass: 'staff' });
    }

    const { enrolled, status } = await resolveEnrollmentStatus(userId, courseId);
    const access_granted = enrolled && status === 'active';

    auditEnrollment('ENROLLMENT_VALIDATE', req, { courseId, enrolled, status, access_granted });

    return res.json({ success: true, enrolled, status: status || null, access_granted });
  } catch (err) {
    logger.error('[GET /enrollments/validate]', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/enrollments/course/:courseId
// Returns the caller's enrollment record for a specific course.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const rows = await db.query(
      `SELECT id, student_id, course_id, status,
              enrollment_date, expires_at, progress_percentage,
              suspended_reason, cancelled_at, created_at, updated_at
         FROM enrollments
        WHERE (student_id = :userId OR user_id = :userId)
          AND course_id = :courseId
        ORDER BY created_at DESC
        LIMIT 1`,
      { replacements: { userId, courseId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.json({ success: true, enrolled: false, enrollment: null });
    }

    return res.json({ success: true, enrolled: true, enrollment: rows[0] });
  } catch (err) {
    logger.error('[GET /enrollments/course/:courseId]', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/enrollments
// Enroll a student in a course. Students can self-enroll (pending → active
// based on course config). Admins can enroll anyone with any initial status.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, validateEnrollmentIntegrity, async (req, res) => {
  try {
    const isStaff = ['admin', 'teacher'].includes(req.user.role);
    let { course_id, student_id, status = 'active', expires_at } = req.body;

    if (!course_id) {
      return res.status(400).json({ success: false, error: 'course_id is required' });
    }

    // Students can only enroll themselves
    const targetStudentId = isStaff && student_id ? student_id : req.user.id;

    // Validate status
    const validStatuses = ['pending', 'active'];
    if (isStaff) validStatuses.push('suspended', 'expired', 'cancelled');
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}` });
    }

    // Check for existing enrollment
    const existing = await db.query(
      `SELECT id, status FROM enrollments
        WHERE (student_id = :sid OR user_id = :sid)
          AND course_id = :courseId
        LIMIT 1`,
      { replacements: { sid: targetStudentId, courseId: course_id }, type: QueryTypes.SELECT }
    );

    if (existing.length) {
      const ex = existing[0];
      // Allow re-enrollment if cancelled or expired
      if (['active', 'pending', 'suspended'].includes(ex.status)) {
        return res.status(409).json({
          success: false,
          error: `Student already has a ${ex.status} enrollment for this course`,
          enrollment_id: ex.id,
          code: 'ALREADY_ENROLLED',
        });
      }
    }

    // Insert enrollment
    const [rows] = await db.query(
      `INSERT INTO enrollments
         (student_id, course_id, status, enrollment_date, expires_at, created_at, updated_at)
       VALUES
         (:studentId, :courseId, :status, NOW(), :expiresAt, NOW(), NOW())
       RETURNING id, student_id, course_id, status, enrollment_date, expires_at, created_at`,
      {
        replacements: {
          studentId: targetStudentId,
          courseId: course_id,
          status,
          expiresAt: expires_at || null,
        },
      }
    );

    const enrollment = rows[0];

    auditEnrollment('ENROLLMENT_CREATED', req, {
      enrollmentId: enrollment.id,
      courseId: course_id,
      targetStudentId,
      status,
    });

    return res.status(201).json({ success: true, enrollment });
  } catch (err) {
    logger.error('[POST /enrollments]', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/enrollments/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const isStaff = ['admin', 'teacher'].includes(req.user.role);
    const { id }  = req.params;

    const rows = await db.query(
      `SELECT e.id, e.student_id, e.user_id, e.course_id, e.status,
              e.enrollment_date, e.expires_at, e.completed_at,
              e.progress_percentage, e.payment_id,
              e.suspended_at, e.suspended_reason, e.cancelled_at,
              e.created_at, e.updated_at,
              c.title AS course_title
         FROM enrollments e
         LEFT JOIN courses c ON c.id = e.course_id
        WHERE e.id = :id
        LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Enrollment not found' });
    }

    const enrollment = rows[0];

    // Students may only view their own enrollment
    const ownerId = enrollment.student_id || enrollment.user_id;
    if (!isStaff && ownerId !== req.user.id) {
      auditEnrollment('ENROLLMENT_CROSS_USER_DENIED', req, {
        enrollmentId: id,
        ownerId,
      });
      return res.status(403).json({ success: false, error: 'Access denied', code: 'CROSS_USER_ACCESS_DENIED' });
    }

    return res.json({ success: true, enrollment });
  } catch (err) {
    logger.error('[GET /enrollments/:id]', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/enrollments/:id/status
// Lifecycle transition: admin/teacher only.
// Enforces valid transition table; prevents arbitrary status jumps.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/status', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { id }    = req.params;
    const { status, reason, expires_at } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'status is required' });
    }

    // Load current enrollment
    const rows = await db.query(
      `SELECT id, student_id, user_id, course_id, status
         FROM enrollments WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Enrollment not found' });
    }

    const enrollment = rows[0];
    const currentStatus = enrollment.status;

    // Validate transition
    const allowed = TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(422).json({
        success: false,
        error: `Cannot transition from '${currentStatus}' to '${status}'`,
        allowed_transitions: allowed,
        code: 'INVALID_TRANSITION',
      });
    }

    // Build update fields
    const fields   = ['status = :status', 'updated_at = NOW()'];
    const replacements = { id, status };

    if (status === 'suspended') {
      fields.push('suspended_at = NOW()');
      if (reason) {
        fields.push('suspended_reason = :reason');
        replacements.reason = reason;
      }
    }
    if (status === 'cancelled') {
      fields.push('cancelled_at = NOW()');
    }
    if (status === 'expired') {
      fields.push('completed_at = NOW()');
    }
    if (status === 'active' && expires_at) {
      fields.push('expires_at = :expiresAt');
      replacements.expiresAt = expires_at;
    }
    // Clear suspension info if re-activating
    if (status === 'active' && currentStatus === 'suspended') {
      fields.push('suspended_at = NULL', 'suspended_reason = NULL');
    }

    const [updated] = await db.query(
      `UPDATE enrollments SET ${fields.join(', ')}
        WHERE id = :id
        RETURNING id, student_id, course_id, status, updated_at,
                  suspended_at, suspended_reason, cancelled_at, expires_at`,
      { replacements }
    );

    auditEnrollment('ENROLLMENT_STATUS_CHANGED', req, {
      enrollmentId: id,
      from: currentStatus,
      to: status,
      reason: reason || null,
      actorId: req.user.id,
    });

    return res.json({ success: true, enrollment: updated[0] });
  } catch (err) {
    logger.error('[PATCH /enrollments/:id/status]', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/enrollments/:id
// Students cancel their own enrollment (sets status = 'cancelled').
// Admins can hard-delete.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const { id }  = req.params;

    const rows = await db.query(
      `SELECT id, student_id, user_id, course_id, status
         FROM enrollments WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Enrollment not found' });
    }

    const enrollment = rows[0];
    const ownerId = enrollment.student_id || enrollment.user_id;

    if (!isAdmin && ownerId !== req.user.id) {
      auditEnrollment('ENROLLMENT_DELETE_DENIED', req, { enrollmentId: id, ownerId });
      return res.status(403).json({ success: false, error: 'Access denied', code: 'CROSS_USER_ACCESS_DENIED' });
    }

    if (isAdmin) {
      await db.query(`DELETE FROM enrollments WHERE id = :id`, { replacements: { id } });
      auditEnrollment('ENROLLMENT_HARD_DELETED', req, { enrollmentId: id, actorId: req.user.id });
      return res.json({ success: true, message: 'Enrollment deleted' });
    }

    // Students: soft-cancel
    if (['cancelled', 'expired'].includes(enrollment.status)) {
      return res.status(422).json({
        success: false,
        error: `Enrollment is already ${enrollment.status}`,
      });
    }

    const [updated] = await db.query(
      `UPDATE enrollments
          SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
        WHERE id = :id
        RETURNING id, status, cancelled_at`,
      { replacements: { id } }
    );

    auditEnrollment('ENROLLMENT_CANCELLED', req, {
      enrollmentId: id,
      courseId: enrollment.course_id,
    });

    return res.json({ success: true, enrollment: updated[0] });
  } catch (err) {
    logger.error('[DELETE /enrollments/:id]', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
