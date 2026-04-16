'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

class SessionEngine {

  static async getSessions(studentId) {
    return await sequelize.query(
      `
      SELECT
        ls.id,
        ls.subtopic_id,
        st.name AS subtopic_name,
        ls.started_at,
        ls.ended_at,
        COALESCE(ls.duration_seconds, 0) / 60 AS duration_minutes
      FROM learning_sessions ls
      JOIN subtopics st ON st.id = ls.subtopic_id
      WHERE ls.student_id = :studentId
      ORDER BY ls.started_at DESC
      LIMIT 20
      `,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );
  }
}

module.exports = SessionEngine;
