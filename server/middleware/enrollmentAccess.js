// server/middleware/enrollmentAccess.js
// ─────────────────────────────────────────────────────────────────────────────
// Enrollment-Authoritative Access Control Middleware
//
// Objective: Enrollment records are the single source of truth for all
// learning access decisions. Every protected content type (courses, videos,
// resources, assignments, assessments/quizzes) passes through this guard.
//
// Enrollment status lifecycle (enrollments table):
//   pending    — payment initiated, access withheld
//   active     — full access granted
//   expired    — access period ended, read-only summary only
//   cancelled  — access revoked by student/admin
//   suspended  — access frozen by admin (policy violation, dispute, etc.)
//
// student_subjects status lifecycle:
//   pending    — awaiting teacher/admin approval
//   approved   — active subject enrollment (maps to enrollment active)
//   rejected   — access denied
//   deactivated — access removed
//
// Access matrix:
//   active                 → ALLOW
//   pending/suspended/     → DENY  (403 ENROLLMENT_INACTIVE)
//   cancelled/expired      → DENY  (403 ENROLLMENT_INACTIVE)
//   not enrolled           → DENY  (403 NOT_ENROLLED)
//
// Bypass: teachers and admins always bypass enrollment checks.
// Cross-user protection: req.user.id is always the authoritative user;
//   never trust any user_id from query params or body without re-validation.
//
// Usage:
//   requireEnrollment('course')        — checks enrollments table
//   requireEnrollment('subject')       — checks student_subjects table
//   requireEnrollment('course','subject') — checks either (OR logic)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { QueryTypes } = require('sequelize');
const db             = require('../config/database');
const logger         = require('../config/logger');
const { auditLog }   = require('./videoAudit');

// ── Status sets ───────────────────────────────────────────────────────────────
const ACTIVE_ENROLLMENT_STATUSES    = new Set(['active']);
const ACTIVE_SS_STATUSES            = new Set(['approved']);
const STAFF_ROLES                   = new Set(['admin', 'teacher']);

// ── Audit helper (enrollment-domain events) ───────────────────────────────────
function auditEnrollment(event, req, extra = {}) {
  logger.info(`[AUDIT] ${event}`, {
    event,
    userId:    req.user?.id    ?? null,
    userRole:  req.user?.role  ?? null,
    userEmail: req.user?.email ?? null,
    ip:        req.ip,
    ua:        req.headers['user-agent'] ?? null,
    path:      req.originalUrl,
    requestId: req.id ?? null,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// checkCourseEnrollment(userId, courseId) → { enrolled, status }
// Checks the direct enrollments table (course-level enrollment).
// ─────────────────────────────────────────────────────────────────────────────
async function checkCourseEnrollment(userId, courseId) {
  const rows = await db.query(
    `SELECT status FROM enrollments
     WHERE student_id = :userId
       AND course_id  = :courseId
     ORDER BY
       CASE status
         WHEN 'active'    THEN 1
         WHEN 'pending'   THEN 2
         WHEN 'expired'   THEN 3
         WHEN 'suspended' THEN 4
         WHEN 'cancelled' THEN 5
         ELSE 6
       END
     LIMIT 1`,
    { replacements: { userId, courseId }, type: QueryTypes.SELECT }
  );
  if (!rows.length) return { enrolled: false, status: null };
  return { enrolled: true, status: rows[0].status };
}

// ─────────────────────────────────────────────────────────────────────────────
// checkSubjectEnrollment(userId, courseId) → { enrolled, status }
// Checks student_subjects → subjects → course_subjects (subject-level enrollment).
// Also checks the legacy user_id column in enrollments for backward compat.
// ─────────────────────────────────────────────────────────────────────────────
async function checkSubjectEnrollment(userId, courseId) {
  // Path A: student_subjects → subjects → course_subjects
  const rows = await db.query(
    `SELECT ss.status
     FROM student_subjects ss
     JOIN subjects      s  ON s.id  = ss.subject_id
     JOIN course_subjects cs ON cs.subject_id = s.id
     WHERE ss.student_id = :userId
       AND cs.course_id  = :courseId
       AND (ss.expires_at IS NULL OR ss.expires_at > NOW())
     ORDER BY
       CASE ss.status
         WHEN 'approved'    THEN 1
         WHEN 'pending'     THEN 2
         WHEN 'deactivated' THEN 3
         WHEN 'rejected'    THEN 4
         ELSE 5
       END
     LIMIT 1`,
    { replacements: { userId, courseId }, type: QueryTypes.SELECT }
  );
  if (rows.length) {
    const raw = rows[0].status;
    // Map student_subjects status → enrollment status vocabulary
    const mapped = raw === 'approved' ? 'active'
                 : raw === 'pending'  ? 'pending'
                 : 'cancelled';
    return { enrolled: true, status: mapped };
  }

  // Path B: legacy user_id column in enrollments (some rows may use user_id)
  const legacyRows = await db.query(
    `SELECT status FROM enrollments
     WHERE (user_id = :userId OR student_id = :userId)
       AND course_id = :courseId
     LIMIT 1`,
    { replacements: { userId, courseId }, type: QueryTypes.SELECT }
  );
  if (legacyRows.length) return { enrolled: true, status: legacyRows[0].status };

  return { enrolled: false, status: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveEnrollmentStatus(userId, courseId)
// Combines course-level + subject-level checks. Returns the best active status
// found, or the most specific denial reason.
// ─────────────────────────────────────────────────────────────────────────────
async function resolveEnrollmentStatus(userId, courseId) {
  // Sequential (not Promise.all) so we can short-circuit on first active hit
  // and keep predictable query ordering.
  const course = await checkCourseEnrollment(userId, courseId);
  if (course.status === 'active') {
    return { enrolled: true, status: 'active', source: 'course' };
  }

  const subject = await checkSubjectEnrollment(userId, courseId);
  if (subject.status === 'active') {
    return { enrolled: true, status: 'active', source: 'subject' };
  }

  // Both checked — return the best inactive status we found
  const anyStatus = course.status || subject.status;
  if (anyStatus) {
    return { enrolled: true, status: anyStatus, source: course.enrolled ? 'course' : 'subject' };
  }

  return { enrolled: false, status: null, source: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// requireEnrollment(contentType) → Express middleware
//
// contentType: 'course' | 'video' | 'resource' | 'assignment' | 'assessment'
//
// The middleware resolves courseId from:
//   1. req.enrollmentCourseId  (set by upstream middleware, highest priority)
//   2. req.video?.course_id    (set by videoAccess)
//   3. req.params.courseId
//   4. req.params.course_id
//   5. req.query.course_id
//   6. req.body.course_id
// ─────────────────────────────────────────────────────────────────────────────
function requireEnrollment(contentType = 'course') {
  return async (req, res, next) => {
    // ── 0. Auth guard ─────────────────────────────────────────────────────────
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    // ── 1. Staff bypass ───────────────────────────────────────────────────────
    if (STAFF_ROLES.has(req.user.role)) {
      auditEnrollment('ENROLLMENT_BYPASS_STAFF', req, { contentType, role: req.user.role });
      return next();
    }

    // ── 2. Resolve courseId ───────────────────────────────────────────────────
    const courseId = req.enrollmentCourseId
      || req.video?.course_id
      || req.params.courseId
      || req.params.course_id
      || req.query.course_id
      || req.body?.course_id;

    if (!courseId) {
      // Can't perform enrollment check without courseId — deny defensively
      logger.warn('[enrollmentAccess] courseId not resolvable', {
        contentType, userId: req.user.id, path: req.originalUrl,
      });
      return res.status(403).json({
        success: false,
        error: 'Course context required for access',
        code: 'COURSE_CONTEXT_MISSING',
      });
    }

    // ── 3. Cross-user protection: never use user_id from params/body ──────────
    // We always use req.user.id (from verified JWT) as the authoritative ID.
    const userId = req.user.id;

    try {
      // ── 4. Resolve enrollment status ────────────────────────────────────────
      const { enrolled, status, source } = await resolveEnrollmentStatus(userId, courseId);

      // ── 5. Audit every access attempt ───────────────────────────────────────
      auditEnrollment('ENROLLMENT_ACCESS_CHECK', req, {
        contentType,
        courseId,
        userId,
        enrolled,
        status,
        source,
      });

      if (!enrolled) {
        auditEnrollment('ENROLLMENT_DENIED_NOT_ENROLLED', req, { contentType, courseId });
        return res.status(403).json({
          success: false,
          error: 'You are not enrolled in this course',
          code: 'NOT_ENROLLED',
          content_type: contentType,
        });
      }

      if (!ACTIVE_ENROLLMENT_STATUSES.has(status)) {
        auditEnrollment('ENROLLMENT_DENIED_INACTIVE', req, { contentType, courseId, status });

        const messages = {
          pending:   'Your enrollment is pending approval. Please wait for activation.',
          expired:   'Your enrollment has expired. Please renew your subscription.',
          cancelled: 'Your enrollment has been cancelled.',
          suspended: 'Your enrollment has been suspended. Please contact support.',
        };

        return res.status(403).json({
          success: false,
          error: messages[status] || 'Your enrollment is not active',
          code: 'ENROLLMENT_INACTIVE',
          status,
          content_type: contentType,
        });
      }

      // ── 6. Grant — attach enrollment context for downstream handlers ─────────
      req.enrollment = { courseId, userId, status, source };
      auditEnrollment('ENROLLMENT_GRANTED', req, { contentType, courseId, status });
      next();

    } catch (err) {
      logger.error('[enrollmentAccess] Error during enrollment check', {
        err: err.message, userId, courseId, contentType,
      });
      return res.status(500).json({ success: false, error: 'Access check failed' });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateEnrollmentIntegrity(req, res, next)
// Checks for common enrollment bypass patterns and rejects suspicious requests.
// Place after protect but before any content handler.
// ─────────────────────────────────────────────────────────────────────────────
function validateEnrollmentIntegrity(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // Detect and block user_id spoofing in query params / body
  const paramUserId = req.query.user_id || req.params.userId || req.params.user_id;
  const bodyUserId  = req.body?.user_id || req.body?.student_id;

  if (paramUserId && paramUserId !== req.user.id && req.user.role === 'student') {
    auditEnrollment('ENROLLMENT_BYPASS_ATTEMPT', req, {
      claimedUserId: paramUserId,
      actualUserId: req.user.id,
      method: 'param_spoof',
    });
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      code: 'CROSS_USER_ACCESS_DENIED',
    });
  }

  if (bodyUserId && bodyUserId !== req.user.id && req.user.role === 'student') {
    auditEnrollment('ENROLLMENT_BYPASS_ATTEMPT', req, {
      claimedUserId: bodyUserId,
      actualUserId: req.user.id,
      method: 'body_spoof',
    });
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      code: 'CROSS_USER_ACCESS_DENIED',
    });
  }

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  requireEnrollment,
  validateEnrollmentIntegrity,
  resolveEnrollmentStatus,
  checkCourseEnrollment,
  checkSubjectEnrollment,
  auditEnrollment,
  ACTIVE_ENROLLMENT_STATUSES,
  STAFF_ROLES,
};
