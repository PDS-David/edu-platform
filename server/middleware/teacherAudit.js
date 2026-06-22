'use strict';
// server/middleware/teacherAudit.js
// ─────────────────────────────────────────────────────────────────────────────
// Audit logging for the teacher dashboard. Mirrors the structured-log pattern
// already established in middleware/videoAudit.js, rather than inventing a
// new scheme — same Winston logger, same flat event shape.
//
// Events emitted:
//   TEACHER_ACCESS_DENIED            — role or ownership check failed (warn)
//   TEACHER_CLASS_CREATED            — new class created
//   TEACHER_CLASS_MEMBERS_UPDATED    — roster replaced via PUT /members
//   TEACHER_TOPIC_MUTATED            — topic created / updated / deleted
//   TEACHER_SUBTOPIC_MUTATED         — subtopic created / updated / deleted
//   TEACHER_ANALYTICS_VIEWED         — class analytics read (other students'
//                                       performance data — worth logging access
//                                       to, not just mutation, same rationale
//                                       as FERPA-style access logging)
//   TEACHER_TEST_PUBLISHED           — custom test published
//   TEACHER_TEST_ASSIGNED            — custom test assigned to a class
//   TEACHER_NUDGE_SENT               — nudge queued for a student
//   TEACHER_STUDENT_LIST_FALLBACK_USED — the "no classes yet, see all active
//                                       students" bootstrap path was used.
//                                       Flagged separately because it's the
//                                       one place teacher-side access is
//                                       intentionally broader than "assigned
//                                       only" — see the authorization review
//                                       for the policy note on this.
//
// All events go to Winston at 'info' (denials and fallback usage at 'warn',
// since both are the strongest signal of IDOR probing/enumeration or of the
// "assigned only" policy being relied on less than intended). Connect a SIEM
// to combined.log / warn output for alerting on repeated denials from one
// user or IP.
// ─────────────────────────────────────────────────────────────────────────────

const logger = require('../config/logger');

function auditLog(event, req, extra = {}, level = 'info') {
  logger[level](`[AUDIT] ${event}`, {
    event,
    userId:    req.user?.id    ?? null,
    userRole:  req.user?.role  ?? null,
    userEmail: req.user?.email ?? null,
    ip:        req.ip,
    ua:        req.headers?.['user-agent'] ?? null,
    path:      req.originalUrl,
    requestId: req.id ?? null,
    ...extra,
  });
}

function auditDenied(req, reason, extra = {}) {
  auditLog('TEACHER_ACCESS_DENIED', req, { reason, ...extra }, 'warn');
}

function auditClassCreated(req, classId, studentCount) {
  auditLog('TEACHER_CLASS_CREATED', req, { classId, studentCount });
}

function auditClassMembersUpdated(req, classId, studentCount) {
  auditLog('TEACHER_CLASS_MEMBERS_UPDATED', req, { classId, studentCount });
}

function auditTopicMutation(req, action, topicId, subjectId) {
  auditLog('TEACHER_TOPIC_MUTATED', req, { action, topicId, subjectId });
}

function auditSubtopicMutation(req, action, subtopicId, subjectId) {
  auditLog('TEACHER_SUBTOPIC_MUTATED', req, { action, subtopicId, subjectId });
}

function auditAnalyticsViewed(req, classId, studentCount) {
  auditLog('TEACHER_ANALYTICS_VIEWED', req, { classId, studentCount });
}

function auditTestPublished(req, testId) {
  auditLog('TEACHER_TEST_PUBLISHED', req, { testId });
}

function auditTestAssigned(req, testId, classId, studentCount) {
  auditLog('TEACHER_TEST_ASSIGNED', req, { testId, classId, studentCount });
}

function auditNudgeSent(req, targetUserId, viaFallback) {
  auditLog('TEACHER_NUDGE_SENT', req, { targetUserId, viaFallback });
}

function auditStudentListFallbackUsed(req, endpoint) {
  auditLog('TEACHER_STUDENT_LIST_FALLBACK_USED', req, { endpoint }, 'warn');
}

module.exports = {
  auditLog,
  auditDenied,
  auditClassCreated,
  auditClassMembersUpdated,
  auditTopicMutation,
  auditSubtopicMutation,
  auditAnalyticsViewed,
  auditTestPublished,
  auditTestAssigned,
  auditNudgeSent,
  auditStudentListFallbackUsed,
};
