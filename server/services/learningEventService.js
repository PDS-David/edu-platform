'use strict';

/**
 * learningEventService.js
 *
 * Stores raw learning events for analytics + AI + progress derivation
 */

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * CREATE EVENT
 */
async function createEvent({
  studentId,
  subtopicId,
  eventType,
  payload = {},
}) {
  return sequelize.query(
    `
    INSERT INTO learning_events (
      student_id,
      subtopic_id,
      event_type,
      payload,
      created_at
    )
    VALUES (
      :studentId,
      :subtopicId,
      :eventType,
      :payload,
      NOW()
    )
    RETURNING *
    `,
    {
      replacements: {
        studentId,
        subtopicId,
        eventType,
        payload: JSON.stringify(payload),
      },
      type: QueryTypes.INSERT,
    }
  );
}

/**
 * GET EVENTS (for debugging / analytics)
 */
async function getEvents(studentId, subtopicId) {
  return sequelize.query(
    `
    SELECT *
    FROM learning_events
    WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
    ORDER BY created_at DESC
    `,
    {
      replacements: { studentId, subtopicId },
      type: QueryTypes.SELECT,
    }
  );
}

module.exports = {
  createEvent,
  getEvents,
};
