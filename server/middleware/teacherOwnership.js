'use strict';
// server/middleware/teacherOwnership.js
// ─────────────────────────────────────────────────────────────────────────────
// Ownership / assignment-scoping middleware for the teacher dashboard.
//
// Fixes from QA_Report__Teacher_Dashboard.md:
//   - POST/PUT/DELETE /topics and /subtopics never called the existing
//     teacherOwnsSubject() helper at all (report lines 93,114,132,160,179,192)
//     — any teacher could create/edit/delete content under subjects they are
//     not assigned to. requireSubjectOwnership / requireTopicOwnership /
//     requireSubtopicOwnership close this.
//   - teacherOwnsSubject() failed OPEN: its catch block returned `true`
//     whenever the teacher_subjects table was unreachable (report line 29-37).
//     The rebuilt version below fails CLOSED, while still distinguishing
//     "table genuinely not provisioned yet" (503) from "real query error"
//     (500) so ops can tell the two apart instead of both reading as "deny".
//   - GET /class/:classId/analytics had NO ownership check at all (Critical,
//     report line 447) — any teacher could view any other teacher's class
//     roster/analytics by guessing a classId. requireClassOwnership closes
//     this, and is also used to consolidate the (already-correct) ownership
//     checks on GET/PUT /class/:classId/members so there's one shared
//     implementation instead of two copies that could drift apart.
//
// Admins bypass every check here (consistent with roleMiddleware.js's
// existing adminOnly/teacherAccess pattern elsewhere in the codebase).
// Every denial is audit-logged via teacherAudit.auditDenied.
// ─────────────────────────────────────────────────────────────────────────────

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../config/logger');
const { error: sendError } = require('../utils/response');
const { auditDenied } = require('./teacherAudit');

const ASSIGNMENT_TABLE_MISSING = 'ASSIGNMENT_TABLE_MISSING';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Heuristic for "the table itself doesn't exist" vs. any other DB error.
// Postgres raises this exact wording for missing relations.
function isMissingTableError(err) {
  return /relation .* does not exist/i.test(err?.message || '');
}

// ── teacherOwnsSubject ────────────────────────────────────────────────────
// Core assignment check. FAILS CLOSED on any error (the original helper in
// teacherRoutes.js returned `true` here — that was the bug).
// Returns:
//   { allowed: true }
//   { allowed: false, status: 403 }                                  — not assigned
//   { allowed: false, status: 503, code: ASSIGNMENT_TABLE_MISSING }  — table missing
//   { allowed: false, status: 500 }                                  — other DB error
async function teacherOwnsSubject(teacherId, subjectId) {
  try {
    const rows = await sequelize.query(
      `SELECT id FROM teacher_subjects
        WHERE teacher_id = :teacherId AND subject_id = :subjectId AND is_active = true`,
      { replacements: { teacherId, subjectId }, type: QueryTypes.SELECT }
    );
    return rows.length > 0 ? { allowed: true } : { allowed: false, status: 403 };
  } catch (err) {
    if (isMissingTableError(err)) {
      logger.warn('[teacherOwnership] teacher_subjects table missing — denying by default', { error: err.message });
      return { allowed: false, status: 503, code: ASSIGNMENT_TABLE_MISSING };
    }
    logger.error('[teacherOwnership] teacherOwnsSubject query failed', { error: err.message });
    return { allowed: false, status: 500 };
  }
}

function denyForResult(req, res, result, reason, extra = {}) {
  auditDenied(req, reason, { status: result.status, code: result.code, ...extra });
  if (result.status === 503) {
    return sendError(
      res,
      'Subject assignment system is temporarily unavailable. Please try again shortly or contact an admin.',
      503,
      { code: result.code }
    );
  }
  if (result.status === 403) {
    return sendError(res, 'You are not assigned to this subject.', 403, { code: 'SUBJECT_NOT_ASSIGNED' });
  }
  return sendError(res, 'Could not verify subject assignment.', 500);
}

// ── requireSubjectOwnership ───────────────────────────────────────────────
// For routes where subject_id is directly available (e.g. POST /topics body).
const requireSubjectOwnership = async (req, res, next) => {
  if (req.user?.role === 'admin') return next();

  const subjectId = req.body?.subject_id || req.params?.subjectId || req.params?.subject_id || null;
  if (!subjectId) return sendError(res, 'subject_id is required', 400);

  const result = await teacherOwnsSubject(req.user.id, subjectId);
  if (!result.allowed) return denyForResult(req, res, result, 'SUBJECT_NOT_ASSIGNED', { subjectId });

  req.verifiedSubjectId = subjectId;
  next();
};

// ── requireSubjectOwnershipForSubtopicCreate ──────────────────────────────
// For POST /subtopics. subject_id is optional in the request body (the
// client may send only topic_id) — this resolves the effective subject_id
// first (body.subject_id if present, otherwise looked up via topic_id),
// then runs the same assignment check. Mirrors the existing convention in
// teacherRoutes.js of treating topic_id-as-foreign-key values as opaque
// (no parseInt) — only the /topics/:id and /subtopics/:id row PKs are
// integers; foreign key references to them elsewhere in this codebase are
// passed through unparsed, so this lookup does the same for consistency
// with how POST /subtopics already inserts topic_id today.
const requireSubjectOwnershipForSubtopicCreate = async (req, res, next) => {
  if (req.user?.role === 'admin') return next();

  let subjectId = req.body?.subject_id || null;
  const topicId = req.body?.topic_id || null;

  if (!subjectId && !topicId) {
    return sendError(res, 'topic_id is required', 400);
  }

  if (!subjectId) {
    try {
      const topicRows = await sequelize.query(
        `SELECT subject_id FROM topics WHERE id = :topicId`,
        { replacements: { topicId }, type: QueryTypes.SELECT }
      );
      if (!topicRows.length) return sendError(res, 'Parent topic not found', 404);
      subjectId = topicRows[0].subject_id;
    } catch (err) {
      logger.error('[teacherOwnership] topic lookup for subtopic create failed', { error: err.message });
      return sendError(res, 'Could not verify parent topic.', 500);
    }
  }

  const result = await teacherOwnsSubject(req.user.id, subjectId);
  if (!result.allowed) return denyForResult(req, res, result, 'SUBTOPIC_CREATE_SUBJECT_NOT_ASSIGNED', { topicId, subjectId });

  req.verifiedSubjectId = subjectId;
  next();
};

// ── requireTopicOwnership ─────────────────────────────────────────────────
// For PUT/DELETE /topics/:id. The client doesn't send subject_id on these
// routes, so we resolve it server-side from the topic row, then run the
// same assignment check. A missing/inactive topic id returns 404 before any
// ownership question is even asked.
const requireTopicOwnership = async (req, res, next) => {
  if (req.user?.role === 'admin') return next();

  const topicId = parseInt(req.params.id, 10);
  if (!Number.isInteger(topicId)) return sendError(res, 'Invalid topic id', 400);

  let rows;
  try {
    rows = await sequelize.query(
      `SELECT id, subject_id FROM topics WHERE id = :id`,
      { replacements: { id: topicId }, type: QueryTypes.SELECT }
    );
  } catch (err) {
    logger.error('[teacherOwnership] topic lookup failed', { error: err.message });
    return sendError(res, 'Could not verify topic ownership.', 500);
  }
  if (!rows.length) return sendError(res, 'Topic not found', 404);

  const result = await teacherOwnsSubject(req.user.id, rows[0].subject_id);
  if (!result.allowed) return denyForResult(req, res, result, 'TOPIC_SUBJECT_NOT_ASSIGNED', { topicId, subjectId: rows[0].subject_id });

  req.verifiedSubjectId = rows[0].subject_id;
  next();
};

// ── requireSubtopicOwnership ──────────────────────────────────────────────
// For PUT/DELETE /subtopics/:id. Resolves subtopic → (subject_id directly,
// or via its parent topic if subtopics.subject_id is null) → assignment check.
const requireSubtopicOwnership = async (req, res, next) => {
  if (req.user?.role === 'admin') return next();

  const subtopicId = parseInt(req.params.id, 10);
  if (!Number.isInteger(subtopicId)) return sendError(res, 'Invalid subtopic id', 400);

  let rows;
  try {
    rows = await sequelize.query(
      `SELECT st.id, COALESCE(st.subject_id, t.subject_id) AS subject_id
         FROM subtopics st
         LEFT JOIN topics t ON t.id = st.topic_id
        WHERE st.id = :id`,
      { replacements: { id: subtopicId }, type: QueryTypes.SELECT }
    );
  } catch (err) {
    logger.error('[teacherOwnership] subtopic lookup failed', { error: err.message });
    return sendError(res, 'Could not verify subtopic ownership.', 500);
  }
  if (!rows.length) return sendError(res, 'Subtopic not found', 404);
  if (!rows[0].subject_id) {
    // Can't resolve a subject for this subtopic — fail closed rather than
    // silently allowing an unresolvable ownership check to pass.
    auditDenied(req, 'SUBTOPIC_SUBJECT_UNRESOLVABLE', { subtopicId });
    return sendError(res, 'Could not verify subtopic ownership.', 500);
  }

  const result = await teacherOwnsSubject(req.user.id, rows[0].subject_id);
  if (!result.allowed) return denyForResult(req, res, result, 'SUBTOPIC_SUBJECT_NOT_ASSIGNED', { subtopicId, subjectId: rows[0].subject_id });

  req.verifiedSubjectId = rows[0].subject_id;
  next();
};

// ── requireClassOwnership ─────────────────────────────────────────────────
// For GET /class/:classId/analytics and GET/PUT /class/:classId/members —
// verifies classes.teacher_id matches the requesting teacher. Closes the
// Critical analytics IDOR (report line 447) and gives members read/write a
// single shared implementation instead of two separately-maintained checks.
// Returns 404 (not 403) whether the class doesn't exist or just isn't this
// teacher's, so the endpoint doesn't leak which UUIDs are valid classes.
const requireClassOwnership = async (req, res, next) => {
  if (req.user?.role === 'admin') return next();

  const classId = req.params.classId;
  if (!classId) return sendError(res, 'classId is required', 400);
  if (!UUID_REGEX.test(classId)) return sendError(res, 'Invalid class id', 400);

  let rows;
  try {
    rows = await sequelize.query(
      `SELECT id FROM classes WHERE id = :classId AND teacher_id = :teacherId`,
      { replacements: { classId, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      auditDenied(req, 'CLASS_TABLE_MISSING', { classId });
      return sendError(res, 'Class system is not yet available.', 503);
    }
    logger.error('[teacherOwnership] class ownership lookup failed', { error: err.message });
    return sendError(res, 'Could not verify class ownership.', 500);
  }
  if (!rows.length) {
    auditDenied(req, 'CLASS_NOT_OWNED', { classId });
    return sendError(res, 'Class not found', 404);
  }
  next();
};

module.exports = {
  teacherOwnsSubject,
  requireSubjectOwnership,
  requireSubjectOwnershipForSubtopicCreate,
  requireTopicOwnership,
  requireSubtopicOwnership,
  requireClassOwnership,
  ASSIGNMENT_TABLE_MISSING,
};
