'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

class AnalyticsEngine {

  // ─────────────────────────────────────────────
  // PROGRESS SUMMARY
  // ─────────────────────────────────────────────
  static async getProgressSummary(studentId) {
    const rows = await sequelize.query(
      `
      SELECT
        xp_points,
        study_streak_days,
        onboarding_complete
      FROM users
      WHERE id = :studentId
      `,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    const progress = await sequelize.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE quiz_completed = true) AS completed_quizzes,
        COUNT(*) FILTER (WHERE resources_completed = true) AS completed_resources
      FROM subtopic_progress
      WHERE student_id = :studentId
      `,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    return {
      ...rows[0],
      ...progress[0],
    };
  }

  // ─────────────────────────────────────────────
  // WEAK TOPICS (REAL ENGINE)
  // ─────────────────────────────────────────────
  static async getWeakTopics(studentId) {
    return await sequelize.query(
      `
      SELECT
        st.id,
        st.name,
        AVG(
          CASE
            WHEN sp.quiz_completed THEN 80
            WHEN sp.resources_completed THEN 60
            ELSE 30
          END
        ) AS score
      FROM subtopics st
      LEFT JOIN subtopic_progress sp
        ON sp.subtopic_id = st.id
        AND sp.student_id = :studentId
      GROUP BY st.id
      ORDER BY score ASC
      LIMIT 10
      `,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );
  }
}

module.exports = AnalyticsEngine;
