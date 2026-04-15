'use strict';

/**
 * A3 — ANALYTICS ENGINE
 *
 * Purpose:
 * - Collect learning activity signals (progress, completion, engagement)
 * - Compute aggregated learning metrics
 * - Provide reusable analytics queries for routes + AI layer
 *
 * Works with:
 * - subtopic_progress
 * - users
 * - subtopics
 * - topics
 */

const { QueryTypes } = require('sequelize');
const EventEmitter = require('events');
const sequelize = require('../config/database');
const logger = require('../config/logger');

/**
 * Internal event bus (A2/A3 integration bridge)
 * Later upgrade path: Redis pub/sub
 */
class AnalyticsBus extends EventEmitter {}
const analyticsBus = new AnalyticsBus();

/* ─────────────────────────────────────────────────────────────
   EVENT TYPES
───────────────────────────────────────────────────────────── */
const EVENTS = {
  SUBTOPIC_PROGRESS_UPDATED: 'subtopic_progress_updated',
  SUBTOPIC_COMPLETED: 'subtopic_completed',
  USER_ACTIVITY: 'user_activity',
};

/* ─────────────────────────────────────────────────────────────
   EVENT TRACKING API
───────────────────────────────────────────────────────────── */

/**
 * Emit progress-related events from Progress Engine
 */
function trackEvent(eventType, payload = {}) {
  try {
    analyticsBus.emit(eventType, payload);
  } catch (err) {
    logger.error('[AnalyticsEngine] Event emit failed', {
      error: err.message,
      eventType,
    });
  }
}

/**
 * Hook listeners (internal aggregation triggers)
 */
analyticsBus.on(EVENTS.SUBTOPIC_PROGRESS_UPDATED, async (payload) => {
  try {
    // lightweight logging only (no heavy compute here)
    logger.info('[Analytics] Progress update', {
      studentId: payload.studentId,
      subtopicId: payload.subtopicId,
    });
  } catch (e) {
    logger.warn('[Analytics] Listener error', { error: e.message });
  }
});

analyticsBus.on(EVENTS.SUBTOPIC_COMPLETED, async (payload) => {
  try {
    logger.info('[Analytics] Subtopic completed', payload);
  } catch (e) {
    logger.warn('[Analytics] Completion listener error', { error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   CORE ANALYTICS QUERIES
───────────────────────────────────────────────────────────── */

/**
 * Get user learning dashboard analytics
 */
async function getUserAnalytics(userId) {
  const stats = await sequelize.query(
    `
    SELECT
      COUNT(*) AS total_subtopics,
      
      COUNT(*) FILTER (
        WHERE (resources_completed AND practice_completed AND quiz_completed)
      ) AS completed_subtopics,

      COUNT(*) FILTER (WHERE resources_completed = true) AS resources_done,
      COUNT(*) FILTER (WHERE practice_completed = true) AS practice_done,
      COUNT(*) FILTER (WHERE quiz_completed = true) AS quiz_done

    FROM subtopic_progress
    WHERE student_id = :userId
    `,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    }
  );

  const row = stats[0] || {};

  const completionRate =
    row.total_subtopics > 0
      ? (row.completed_subtopics / row.total_subtopics) * 100
      : 0;

  return {
    totalSubtopics: Number(row.total_subtopics || 0),
    completedSubtopics: Number(row.completed_subtopics || 0),
    resourcesDone: Number(row.resources_done || 0),
    practiceDone: Number(row.practice_done || 0),
    quizDone: Number(row.quiz_done || 0),
    completionRate: Number(completionRate.toFixed(2)),
  };
}

/**
 * Topic-level analytics
 */
async function getTopicAnalytics(topicId, userId) {
  const stats = await sequelize.query(
    `
    SELECT
      COUNT(st.id) AS total_subtopics,

      COUNT(sp.id) FILTER (
        WHERE (sp.resources_completed AND sp.practice_completed AND sp.quiz_completed)
      ) AS completed_subtopics

    FROM subtopics st
    LEFT JOIN subtopic_progress sp
      ON sp.subtopic_id = st.id AND sp.student_id = :userId

    WHERE st.topic_id = :topicId
    `,
    {
      replacements: { topicId, userId },
      type: QueryTypes.SELECT,
    }
  );

  const row = stats[0] || {};

  const progress =
    row.total_subtopics > 0
      ? (row.completed_subtopics / row.total_subtopics) * 100
      : 0;

  return {
    topicId,
    totalSubtopics: Number(row.total_subtopics || 0),
    completedSubtopics: Number(row.completed_subtopics || 0),
    progress: Number(progress.toFixed(2)),
  };
}

/**
 * System-wide learning overview (admin dashboard)
 */
async function getSystemAnalytics() {
  const stats = await sequelize.query(
    `
    SELECT
      COUNT(DISTINCT student_id) AS active_students,
      COUNT(*) AS total_progress_records,
      
      COUNT(*) FILTER (
        WHERE (resources_completed AND practice_completed AND quiz_completed)
      ) AS total_completed_subtopics

    FROM subtopic_progress
    `,
    {
      type: QueryTypes.SELECT,
    }
  );

  return stats[0] || {};
}

/* ─────────────────────────────────────────────────────────────
   INTEGRATION HELPERS (USED BY PROGRESS ENGINE)
───────────────────────────────────────────────────────────── */

/**
 * Called by subtopicProgressService after updates
 */
function emitProgressUpdate(payload) {
  trackEvent(EVENTS.SUBTOPIC_PROGRESS_UPDATED, payload);

  const isCompleted =
    payload.resources_completed &&
    payload.practice_completed &&
    payload.quiz_completed;

  if (isCompleted) {
    trackEvent(EVENTS.SUBTOPIC_COMPLETED, payload);
  }
}

/* ─────────────────────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────────────────────── */

module.exports = {
  analyticsBus,
  EVENTS,

  trackEvent,
  emitProgressUpdate,

  getUserAnalytics,
  getTopicAnalytics,
  getSystemAnalytics,
};
