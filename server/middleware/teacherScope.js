'use strict';

/**
 * teacherScope.js
 * ───────────────
 * Authorization middleware that enforces teachers can only access students:
 *   1. Enrolled in courses/subjects the teacher is assigned to
 *   2. Members of the teacher's own classes
 *
 * Prevents IDOR: a teacher cannot query analytics, summaries, or topic
 * reports for arbitrary student IDs by guessing UUIDs.
 *
 * Exports:
 *   requireTeacherStudentScope(req, res, next)
 *     — must be used on routes with :studentId in params
 *   requireTeacherAnalyticsScope(req, res, next)
 *     — must be used on analytics/report routes that accept a student query param
 *   requireTeacherClassOwnership(req, res, next)
 *     — must be used on class-level routes with :classId in params
 */

const { QueryTypes } = require('sequelize');
const db = require('../config/database');
const audit = require('../services/auditLogger');

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the given studentId is within the teacher's teaching scope.
 * Scope = enrolled in one of the teacher's assigned subjects OR member of one
 * of the teacher's classes.
 */
async function studentInTeacherScope(teacherId, studentId) {
  // Path 1: student enrolled in a subject the teacher is assigned to
  const [subjectHit] = await db.query(
    `SELECT 1
       FROM student_subjects ss
       JOIN teacher_subjects ts
         ON ts.subject_id = ss.subject_id
        AND ts.teacher_id = :teacherId
        AND ts.is_active  = true
      WHERE ss.student_id = :studentId
        AND ss.is_active  = true
      LIMIT 1`,
    { replacements: { teacherId, studentId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  if (subjectHit) return true;

  // Path 2: student is a member of one of the teacher's classes
  const [classHit] = await db.query(
    `SELECT 1
       FROM class_memberships cm
       JOIN classes c ON c.id = cm.class_id
      WHERE c.teacher_id  = :teacherId
        AND cm.student_id = :studentId
      LIMIT 1`,
    { replacements: { teacherId, studentId }, type: QueryTypes.SELECT }
  ).catch(() => []);

  return !!classHit;
}

/**
 * Returns true if the given studentId belongs to the school_admin's own
 * school. Scope = student.school_id === school_admin.school_id — a school
 * boundary, not a class/subject one (school_admin doesn't teach specific
 * subjects/classes the way a teacher does; their scope is "every student at
 * my school", matching how GET /api/schools/me/roster already works).
 */
async function studentInSchoolAdminScope(schoolAdminSchoolId, studentId) {
  if (!schoolAdminSchoolId) return false;
  const [hit] = await db.query(
    `SELECT 1 FROM users
      WHERE id = :studentId AND role = 'student' AND school_id = :schoolId
      LIMIT 1`,
    { replacements: { studentId, schoolId: schoolAdminSchoolId }, type: QueryTypes.SELECT }
  ).catch(() => []);
  return !!hit;
}

// ── middleware factories ───────────────────────────────────────────────────────

/**
 * Gate: req.params.studentId must belong to the requesting teacher's scope,
 * or (for school_admin) to their own school. Admins always pass through.
 */
const requireTeacherStudentScope = async (req, res, next) => {
  const role = req.user?.role;
  if (role === 'admin') return next();

  if (role !== 'teacher' && role !== 'school_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  const studentId = req.params.studentId || req.query.student_id;
  if (!studentId) {
    return res.status(400).json({ success: false, error: 'student_id is required' });
  }

  try {
    const inScope = role === 'school_admin'
      ? await studentInSchoolAdminScope(req.user.school_id, studentId)
      : await studentInTeacherScope(req.user.id, studentId);
    if (!inScope) {
      await audit.blockIdor(req, res,
        `${role} ${req.user.id} attempted to access out-of-scope student ${studentId}`);
      return; // blockIdor sends the response
    }
    next();
  } catch (err) {
    console.error('[teacherScope] scope check error:', err.message);
    return res.status(500).json({ success: false, error: 'Authorization check failed' });
  }
};

/**
 * Gate for analytics routes that accept ?student_id= query param.
 * If no student_id is provided (teacher viewing cohort data), pass through.
 * If student_id is present, verify it is in scope (teacher's own
 * class/subject scope, or — for school_admin — the student's own school).
 * Admins always pass through.
 */
const requireTeacherAnalyticsScope = async (req, res, next) => {
  const role = req.user?.role;
  if (role === 'admin') return next();

  // Students can only see their own data — enforced by the route handler itself;
  // this middleware is for teacher/school_admin-level scope only.
  if (role === 'student') return next();

  if (role !== 'teacher' && role !== 'school_admin') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  const studentId = req.params.studentId || req.query.student_id;
  if (!studentId) return next(); // cohort-level request — no student scope needed

  try {
    const inScope = role === 'school_admin'
      ? await studentInSchoolAdminScope(req.user.school_id, studentId)
      : await studentInTeacherScope(req.user.id, studentId);
    if (!inScope) {
      await audit.blockIdor(req, res,
        `${role} ${req.user.id} attempted analytics on out-of-scope student ${studentId}`);
      return;
    }
    next();
  } catch (err) {
    console.error('[teacherScope] analytics scope check error:', err.message);
    return res.status(500).json({ success: false, error: 'Authorization check failed' });
  }
};

/**
 * Gate: req.params.classId must belong to the requesting teacher.
 * Admins always pass through.
 */
const requireTeacherClassOwnership = async (req, res, next) => {
  const role = req.user?.role;
  if (role === 'admin') return next();

  if (role !== 'teacher') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  const classId = req.params.classId;
  if (!classId) {
    return res.status(400).json({ success: false, error: 'classId is required' });
  }

  try {
    const [row] = await db.query(
      `SELECT 1 FROM classes WHERE id = :classId AND teacher_id = :teacherId LIMIT 1`,
      { replacements: { classId, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!row) {
      await audit.blockIdor(req, res,
        `Teacher ${req.user.id} attempted to access class ${classId} owned by another teacher`);
      return;
    }
    next();
  } catch (err) {
    console.error('[teacherScope] class ownership check error:', err.message);
    return res.status(500).json({ success: false, error: 'Authorization check failed' });
  }
};

module.exports = {
  requireTeacherStudentScope,
  requireTeacherAnalyticsScope,
  requireTeacherClassOwnership,
  studentInTeacherScope,        // exported for use in route handlers
  studentInSchoolAdminScope,    // exported for use in route handlers
};
