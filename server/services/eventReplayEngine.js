'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * EventReplayEngine
 * Reconstructs state from event_store
 */
class EventReplayEngine {

  /**
   * Get all events for a student
   */
  async getUserEvents(studentId) {
    return sequelize.query(
      `
      SELECT *
      FROM event_store
      WHERE payload->>'studentId' = :studentId
      ORDER BY created_at ASC
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT,
      }
    );
  }

  /**
   * Rebuild progress state from events
   */
  async rebuildProgress(studentId) {
    const events = await this.getUserEvents(studentId);

    const state = {};

    for (const event of events) {
      const payload = event.payload;

      const subtopicId = payload.subtopicId;
      if (!subtopicId) continue;

      if (!state[subtopicId]) {
        state[subtopicId] = {
          resources_completed: false,
          practice_completed: false,
          quiz_completed: false,
          notes_viewed: false,
          video_watched: false,
          completed: false,
        };
      }

      // merge progress
      if (payload.progress) {
        state[subtopicId] = {
          ...state[subtopicId],
          ...payload.progress,
          completed: payload.completed || false,
        };
      }
    }

    return state;
  }

  /**
   * Compute weak subtopics
   */
  async getWeakSubtopics(studentId) {
    const progress = await this.rebuildProgress(studentId);

    return Object.entries(progress)
      .filter(([_, p]) => !p.completed)
      .map(([subtopicId, p]) => ({
        subtopicId,
        ...p,
      }));
  }

  /**
   * Compute completion stats
   */
  async getCompletionStats(studentId) {
    const progress = await this.rebuildProgress(studentId);

    const total = Object.keys(progress).length;
    const completed = Object.values(progress).filter(p => p.completed).length;

    return {
      total,
      completed,
      percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }
}

module.exports = new EventReplayEngine();
