'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * SUBTOPIC COMPLETION RATE PER TOPIC
 */
async function getTopicProgress(studentId, topicId) {
  const rows = await sequelize.query(
    `
    SELECT
      COUNT(st.id)::int AS total_subtopics,

      COUNT(
        CASE
          WHEN (sp.resources_completed
            AND sp.practice_completed
            AND sp.quiz_completed
            AND sp.notes_viewed
            AND sp.video_watched)
          THEN 1
        END
      )::int AS completed_subtopics

    FROM subtopics st
    LEFT JOIN subtopic_progress sp
      ON sp.subtopic_id = st.id
      AND sp.student_id = :studentId

    WHERE st.topic_id = :topicId
    `,
    {
      replacements: { studentId, topicId },
      type: QueryTypes.SELECT,
    }
  );

  const data = rows[0];

  const percent =
    data.total_subtopics === 0
      ? 0
      : Math.round((data.completed_subtopics / data.total_subtopics) * 100);

  return {
    topic_id: topicId,
    total_subtopics: data.total_subtopics,
    completed_subtopics: data.completed_subtopics,
    completion_percentage: percent,
  };
}

/**
 * SUBJECT PROGRESS (ALL TOPICS AGGREGATED)
 */
async function getSubjectProgress(studentId, subjectId) {
  const rows = await sequelize.query(
    `
    SELECT
      COUNT(DISTINCT t.id)::int AS total_topics,

      COUNT(
        DISTINCT CASE
          WHEN (
            SELECT COUNT(st.id)
            FROM subtopics st
            LEFT JOIN subtopic_progress sp
              ON sp.subtopic_id = st.id
              AND sp.student_id = :studentId
            WHERE st.topic_id = t.id
              AND sp.resources_completed
              AND sp.practice_completed
              AND sp.quiz_completed
              AND sp.notes_viewed
              AND sp.video_watched
          ) = (
            SELECT COUNT(*)
            FROM subtopics st2
            WHERE st2.topic_id = t.id
          )
          THEN t.id
        END
      )::int AS completed_topics

    FROM topics t
    WHERE t.subject_id = :subjectId
    `,
    {
      replacements: { studentId, subjectId },
      type: QueryTypes.SELECT,
    }
  );

  const data = rows[0];

  const percent =
    data.total_topics === 0
      ? 0
      : Math.round((data.completed_topics / data.total_topics) * 100);

  return {
    subject_id: subjectId,
    total_topics: data.total_topics,
    completed_topics: data.completed_topics,
    completion_percentage: percent,
  };
}

/**
 * USER DASHBOARD SUMMARY
 */
async function getUserDashboardProgress(studentId) {
  const rows = await sequelize.query(
    `
    SELECT
      COUNT(DISTINCT subject_id)::int AS total_subjects,

      COUNT(
        DISTINCT CASE
          WHEN (
            SELECT COUNT(*)
            FROM topics t
            JOIN subtopics st ON st.topic_id = t.id
            LEFT JOIN subtopic_progress sp
              ON sp.subtopic_id = st.id
              AND sp.student_id = :studentId
            WHERE t.subject_id = s.id
              AND sp.resources_completed
              AND sp.practice_completed
              AND sp.quiz_completed
              AND sp.notes_viewed
              AND sp.video_watched
          ) = (
            SELECT COUNT(*)
            FROM topics t2
            WHERE t2.subject_id = s.id
          )
          THEN s.id
        END
      )::int AS completed_subjects

    FROM subjects s
    `,
    {
      replacements: { studentId },
      type: QueryTypes.SELECT,
    }
  );

  const data = rows[0];

  const percent =
    data.total_subjects === 0
      ? 0
      : Math.round((data.completed_subjects / data.total_subjects) * 100);

  return {
    total_subjects: data.total_subjects,
    completed_subjects: data.completed_subjects,
    completion_percentage: percent,
  };
}

module.exports = {
  getTopicProgress,
  getSubjectProgress,
  getUserDashboardProgress,
};
