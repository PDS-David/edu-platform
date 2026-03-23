// server/middleware/roleMiddleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Role-based access control middleware for EAC Learning Platform.
//
// Usage:
//   const { studentAccess, teacherAccess, adminOnly, checkSubjectAccess } = require('../middleware/roleMiddleware');
//
//   // Student can only see their subscribed exam types:
//   router.get('/content/:examBoardId', protect, studentAccess, handler);
//
//   // Teacher can only add content to assigned subjects:
//   router.post('/videos', protect, teacherAccess, checkSubjectAccess, handler);
//
//   // Admin only:
//   router.delete('/types/:id', protect, adminOnly, handler);
// ─────────────────────────────────────────────────────────────────────────────

const { QueryTypes } = require('sequelize');
const db = require('../config/database');

// ─────────────────────────────────────────────────────────────
// adminOnly
// Blocks anyone who is not an admin
// ─────────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }
  next();
};

// ─────────────────────────────────────────────────────────────
// teacherAccess
// Allows teachers and admins. Blocks students.
// ─────────────────────────────────────────────────────────────
const teacherAccess = (req, res, next) => {
  const role = req.user?.role;
  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Teacher or admin access required',
    });
  }
  next();
};

// ─────────────────────────────────────────────────────────────
// studentAccess
// Checks that the student has an active subscription AND
// that the requested exam_board_id is in their student_exam_types.
//
// Reads exam_board_id from:
//   req.params.examBoardId  OR  req.params.code (resolved to id)
//   OR req.query.board_code
//
// Admins and teachers always pass through.
// ─────────────────────────────────────────────────────────────
const studentAccess = async (req, res, next) => {
  const role = req.user?.role;

  // Admins and teachers have unrestricted access
  if (role === 'admin' || role === 'teacher') return next();

  if (role !== 'student') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    // ── 1. Check active subscription ──────────────────────────
    const subs = await db.query(
      `SELECT us.id, us.end_date, sp.plan_code, sp.max_exam_boards
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = :userId
         AND us.status = 'active'
         AND us.end_date > NOW()
       ORDER BY us.end_date DESC
       LIMIT 1`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!subs.length) {
      return res.status(403).json({
        success: false,
        error: 'Active subscription required',
        code: 'NO_SUBSCRIPTION',
      });
    }

    // Attach subscription to request for downstream use
    req.subscription = subs[0];

    // ── 2. If a specific exam board is requested, verify access ─
    // Resolve exam_board_id from params or query
    let examBoardId = req.params.examBoardId
      || req.query.exam_board_id
      || null;

    // If a board code was passed instead of an id, resolve it
    const boardCode = req.params.code || req.query.board || req.query.board_code || null;
    if (!examBoardId && boardCode) {
      const boardRows = await db.query(
        `SELECT id FROM exam_boards WHERE UPPER(code) = UPPER(:code) AND is_active = true`,
        { replacements: { code: boardCode }, type: QueryTypes.SELECT }
      );
      if (boardRows.length) examBoardId = boardRows[0].id;
    }

    // If no specific board requested, just pass (listing pages, etc.)
    if (!examBoardId) return next();

    // ── 3. Check student_exam_types ───────────────────────────
    const access = await db.query(
      `SELECT id FROM student_exam_types
       WHERE student_id   = :userId
         AND exam_board_id = :examBoardId
         AND is_active     = true
         AND (expires_at IS NULL OR expires_at > NOW())`,
      {
        replacements: { userId: req.user.id, examBoardId },
        type: QueryTypes.SELECT,
      }
    );

    if (!access.length) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this examination type',
        code: 'EXAM_TYPE_NOT_SUBSCRIBED',
      });
    }

    next();
  } catch (err) {
    console.error('[studentAccess middleware]', err.message);
    return res.status(500).json({ success: false, error: 'Access check failed' });
  }
};

// ─────────────────────────────────────────────────────────────
// checkSubjectAccess
// For teachers: verifies the teacher is assigned to the
// subject_id in req.body or req.params.
//
// Admins always pass through.
// Must be used AFTER protect + teacherAccess.
// ─────────────────────────────────────────────────────────────
const checkSubjectAccess = async (req, res, next) => {
  if (req.user?.role === 'admin') return next();

  const subjectId = req.body?.subject_id
    || req.params?.subjectId
    || req.params?.subject_id
    || null;

  if (!subjectId) {
    return res.status(400).json({
      success: false,
      error: 'subject_id is required',
    });
  }

  try {
    const assigned = await db.query(
      `SELECT id FROM teacher_subjects
       WHERE teacher_id = :teacherId
         AND subject_id = :subjectId
         AND is_active  = true`,
      {
        replacements: { teacherId: req.user.id, subjectId },
        type: QueryTypes.SELECT,
      }
    );

    if (!assigned.length) {
      return res.status(403).json({
        success: false,
        error: 'You are not assigned to this subject',
        code: 'SUBJECT_NOT_ASSIGNED',
      });
    }

    next();
  } catch (err) {
    console.error('[checkSubjectAccess middleware]', err.message);
    return res.status(500).json({ success: false, error: 'Subject access check failed' });
  }
};

// ─────────────────────────────────────────────────────────────
// getStudentExamTypes(userId)
// Helper: returns array of exam_board_ids a student can access.
// Used by controllers to filter content lists.
// ─────────────────────────────────────────────────────────────
const getStudentExamTypes = async (userId) => {
  const rows = await db.query(
    `SELECT exam_board_id FROM student_exam_types
     WHERE student_id = :userId
       AND is_active  = true
       AND (expires_at IS NULL OR expires_at > NOW())`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return rows.map(r => r.exam_board_id);
};

// ─────────────────────────────────────────────────────────────
// getTeacherSubjects(teacherId)
// Helper: returns array of subject_ids a teacher can manage.
// ─────────────────────────────────────────────────────────────
const getTeacherSubjects = async (teacherId) => {
  const rows = await db.query(
    `SELECT subject_id FROM teacher_subjects
     WHERE teacher_id = :teacherId
       AND is_active  = true`,
    { replacements: { teacherId }, type: QueryTypes.SELECT }
  );
  return rows.map(r => r.subject_id);
};

module.exports = {
  adminOnly,
  teacherAccess,
  studentAccess,
  checkSubjectAccess,
  getStudentExamTypes,
  getTeacherSubjects,
};
