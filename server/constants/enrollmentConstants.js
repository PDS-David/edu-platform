'use strict';

/**
 * Enrollment domain constants for AISchoolOnair.
 *
 * SCOPE: student_subjects table — enrollment_source and enrollment lifecycle.
 *
 * NOT for:
 *   - questions.status        (pending / approved / rejected)
 *   - payments.status         (pending / completed / failed / refunded)
 *   - quiz / moderation state
 *   - migration scripts       (hardcoded by design; must not import runtime constants)
 */

// ---------------------------------------------------------------------------
// enrollment_source  (student_subjects.enrollment_source column)
// ---------------------------------------------------------------------------
const ENROLLMENT_SOURCE = Object.freeze({
  EXPLICIT:      'explicit',       // student or admin manually enrolled
  AUTO_ENROLLED: 'auto_enrolled',  // system-triggered automatic enrollment
  CASCADE:       'cascade',        // inherited from a parent subject/course
});

// ---------------------------------------------------------------------------
// Enrollment lifecycle status  (student_subjects.status and
//                               student_exam_types.status columns)
// ---------------------------------------------------------------------------
const ENROLLMENT_STATUS = Object.freeze({
  PENDING:      'pending',
  APPROVED:     'approved',
  REJECTED:     'rejected',
  DEACTIVATED:  'deactivated',
});

module.exports = { ENROLLMENT_SOURCE, ENROLLMENT_STATUS };
