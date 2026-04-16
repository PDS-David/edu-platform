'use strict';

/**
 * SESSION ENGINE
 *
 * Tracks:
 * - learning sessions
 * - time spent per subtopic
 * - engagement intensity
 *
 * Writes to:
 * - learning_sessions table
 * - event_store (for analytics + AI engines)
 */

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

// ─────────────────────────────────────────────
// START SESSION
// ─────────────────────────────────────────────
async function startSession({ studentId, subtopicId }) {
  if (!studentId || !subtopicId) {
    throw new Error('studentId and subtopicId are required');
  }

  const [session] = await sequelize.query(
    `
    INSERT INTO learning_sessions (
      student_id,
      subtopic_id,
      started_at
    )
    VALUES (:studentId, :subtopicId, NOW())
    RETURNING *
    `,
    {
      replacements: { studentId, subtopicId },
      type: QueryTypes.INSERT,
    }
  );

  await logEvent('SESSION_STARTED', {
    studentId,
    subtopicId,
    sessionId: session[0].id,
  });

  return session[0];
}

// ─────────────────────────────────────────────
// END SESSION
// ─────────────────────────────────────────────
async function endSession({ sessionId }) {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const [result] = await sequelize.query(
    `
    UPDATE learning_sessions
    SET ended_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
    WHERE id = :sessionId
    RETURNING *
    `,
    {
      replacements: { sessionId },
      type: QueryTypes.UPDATE,
    }
  );

  const session = result[0];

  if (!session) {
    throw new Error('Session not found');
  }

  await logEvent('SESSION_ENDED', {
    sessionId,
    studentId: session.student_id,
    subtopicId: session.subtopic_id,
    duration: session.duration_seconds,
  });

  return session;
}

// ─────────────────────────────────────────────
// GET ACTIVE SESSION
// ─────────────────────────────────────────────
async function getActiveSession(studentId) {
  const rows = await sequelize.query(
    `
    SELECT *
    FROM learning_sessions
    WHERE student_id = :studentId
      AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
    `,
    {
      replacements: { studentId },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] || null;
}

// ─────────────────────────────────────────────
// GET SESSION STATS
// ─────────────────────────────────────────────
async function getSessionStats(studentId) {
  const stats = await sequelize.query(
    `
    SELECT
      COUNT(*) AS total_sessions,
      COALESCE(SUM(duration_seconds), 0) AS total_time,
      COALESCE(AVG(duration_seconds), 0) AS avg_session_time
    FROM learning_sessions
    WHERE student_id = :studentId
    `,
    {
      replacements: { studentId },
      type: QueryTypes.SELECT,
    }
  );

  return stats[0];
}

// ─────────────────────────────────────────────
// EVENT LOGGER (INTEGRATES WITH EVENT STORE)
// ─────────────────────────────────────────────
async function logEvent(eventType, payload) {
  try {
    await sequelize.query(
      `
      INSERT INTO event_store (event_type, payload)
      VALUES (:eventType, :payload)
      `,
      {
        replacements: {
          eventType,
          payload: JSON.stringify(payload),
        },
        type: QueryTypes.INSERT,
      }
    );
  } catch (err) {
    console.error('[EVENT LOG ERROR]', err.message);
  }
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  startSession,
  endSession,
  getActiveSession,
  getSessionStats,
};
