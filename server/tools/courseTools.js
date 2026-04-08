// server/tools/courseTools.js
// ---------------------------------------------------------------------------
// AI-callable tool: course and enrollment data.
//
// Your codebase has no standalone courseService — course data lives directly
// in the DB, exposed through routes/courses.js (stub) and routes/catalogRoutes.js
// (admin) and route-level queries in analyticsRoutes.js (enrollments).
//
// This tool wraps those same DB queries into clean, callable functions.
// It does NOT modify any existing route or file.
// ---------------------------------------------------------------------------

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// ---------------------------------------------------------------------------
// getCourses(userId)
//
// Returns all active subjects the student is enrolled in, plus all available
// active subjects they could enrol into — giving the AI a complete picture.
//
// Output shape:
// {
//   enrolled: [ { course_title, subject_name, subject_id, progress_pct, status } ],
//   available: [ { subject_id, subject_name, exam_board, exam_board_code } ],
// }
// ---------------------------------------------------------------------------
async function getCourses(userId) {
  if (!userId) {
    return toolError('getCourses', 'userId is required');
  }

  try {
    const [enrolled, available] = await Promise.all([
      // Active enrollments for this student
      sequelize.query(
        `SELECT
           c.title                    AS course_title,
           s.name                     AS subject_name,
           s.id                       AS subject_id,
           e.progress_percentage      AS progress_pct,
           e.status
         FROM enrollments  e
         JOIN courses       c ON c.id = e.course_id
         JOIN subjects      s ON s.id = c.subject_id
         WHERE e.student_id = :userId
           AND e.status     = 'active'
         ORDER BY e.enrollment_date DESC`,
        { replacements: { userId }, type: QueryTypes.SELECT }
      ),

      // All active subjects across all active exam boards
      sequelize.query(
        `SELECT
           s.id                AS subject_id,
           s.name              AS subject_name,
           s.icon_emoji,
           eb.name             AS exam_board,
           eb.code             AS exam_board_code
         FROM subjects    s
         JOIN exam_boards eb ON eb.id = s.exam_board_id
         WHERE s.is_active  = true
           AND eb.is_active = true
         ORDER BY eb.display_order ASC, s.name ASC`,
        { type: QueryTypes.SELECT }
      ),
    ]);

    return toolSuccess('getCourses', { enrolled, available });

  } catch (err) {
    return toolError('getCourses', err.message, err);
  }
}

// ---------------------------------------------------------------------------
// getEnrollmentProgress(userId, subjectId)
//
// Returns detailed progress for one enrolled subject — topics covered,
// subtopics done, resources watched, practice done.
// Used when the AI needs to give subject-specific study advice.
// ---------------------------------------------------------------------------
async function getEnrollmentProgress(userId, subjectId) {
  if (!userId || !subjectId) {
    return toolError('getEnrollmentProgress', 'userId and subjectId are required');
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         t.id                             AS topic_id,
         COALESCE(t.name, t.title)        AS topic_name,
         st.id                            AS subtopic_id,
         st.name                          AS subtopic_name,
         COALESCE(sp.resources_done, 0)   AS resources_done,
         COALESCE(sp.practice_done, 0)    AS practice_done,
         COALESCE(sp.quiz_done, 0)        AS quiz_done
       FROM topics    t
       JOIN subtopics st ON st.topic_id = t.id
       LEFT JOIN subtopic_progress sp
         ON  sp.subtopic_id = st.id
         AND sp.student_id  = :userId
       WHERE t.subject_id = :subjectId
       ORDER BY t.name, st.name`,
      { replacements: { userId, subjectId }, type: QueryTypes.SELECT }
    );

    return toolSuccess('getEnrollmentProgress', { subject_id: subjectId, progress: rows });

  } catch (err) {
    return toolError('getEnrollmentProgress', err.message, err);
  }
}

module.exports = { getCourses, getEnrollmentProgress };
