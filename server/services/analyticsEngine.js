'use strict';

/**
 * A4 WIRED ANALYTICS ENGINE
 *
 * ROLE CHANGE:
 * - BEFORE: owned EventEmitter (A3)
 * - NOW: pure event consumer (A4 architecture)
 *
 * It listens to EventEngine events ONLY.
 */

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../config/logger');

const {
  eventBus,
  EVENTS,
} = require('./eventEngine');

/* ─────────────────────────────────────────────────────────────
   EVENT SUBSCRIPTIONS
───────────────────────────────────────────────────────────── */

/**
 * Progress update listener
 */
eventBus.on(EVENTS.PROGRESS_UPDATED, async (payload) => {
  try {
    logger.info('[AnalyticsEngine] Progress captured', {
      studentId: payload.studentId,
      subtopicId: payload.subtopicId,
    });

    // Optional: future DB aggregation table writes go here
  } catch (err) {
    logger.error('[AnalyticsEngine] Progress handler failed', {
      error: err.message,
    });
  }
});

/**
 * Completion event listener
 */
eventBus.on(EVENTS.SUBTOPIC_COMPLETED, async (payload) => {
  try {
    logger.info('[AnalyticsEngine] Subtopic completed captured', payload);

    // Future:
    // - XP calculation
    // - streak updates
    // - achievement unlocks
  } catch (err) {
    logger.error('[AnalyticsEngine] Completion handler failed', {
      error: err.message,
    });
  }
});

/* ─────────────────────────────────────────────────────────────
   ANALYTICS QUERIES (UNCHANGED CORE LOGIC)
───────────────────────────────────────────────────────────── */

async function getUserAnalytics(userId) {
  const stats = await sequelize.query(
    `
    SELECT
      COUNT(*) AS total_subtopics,

      COUNT(*) FILTER (
        WHERE (resources_completed AND practice_completed AND quiz_completed)
      ) AS completed_subtopics

    FROM subtopic_progress
    WHERE student_id = :userId
    `,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    }
  );

  const row = stats[0] || {};

  return {
    totalSubtopics: Number(row.total_subtopics || 0),
    completedSubtopics: Number(row.completed_subtopics || 0),
  };
}

module.exports = {
  getUserAnalytics,
};
