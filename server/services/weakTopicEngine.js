'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * WeakTopicEngine
 * Computes intelligent weakness score per subtopic
 */
class WeakTopicEngine {

  /**
   * Get raw progress from DB (fast baseline)
   */
  async getProgress(studentId) {
    return sequelize.query(
      `
      SELECT
        subtopic_id,
        resources_completed,
        practice_completed,
        quiz_completed,
        notes_viewed,
        video_watched,
        completed_at
      FROM subtopic_progress
      WHERE student_id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT,
      }
    );
  }

  /**
   * Get event intensity (how many attempts/interactions)
   */
  async getEventIntensity(studentId) {
    return sequelize.query(
      `
      SELECT
        (payload->>'subtopicId')::int AS subtopic_id,
        COUNT(*) as interactions
      FROM event_store
      WHERE payload->>'studentId' = :studentId
      GROUP BY subtopic_id
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT,
      }
    );
  }

  /**
   * Compute weakness score
   */
  computeScore(progress, intensityMap) {
    const interactions = intensityMap[progress.subtopic_id] || 0;

    let score = 0;

    // Core learning signals
    if (!progress.resources_completed) score += 1;
    if (!progress.practice_completed) score += 2;
    if (!progress.quiz_completed) score += 3;

    // Engagement signals
    if (!progress.notes_viewed) score += 1;
    if (!progress.video_watched) score += 1;

    // Completion penalty
    if (!progress.completed_at) score += 2;

    // Struggle signal (many interactions but not completed)
    if (interactions > 5 && !progress.completed_at) {
      score += 3;
    }

    return score;
  }

  /**
   * Main API
   */
  async getWeakTopics(studentId) {
    const progressList = await this.getProgress(studentId);
    const intensityList = await this.getEventIntensity(studentId);

    // Map intensity
    const intensityMap = {};
    for (const row of intensityList) {
      intensityMap[row.subtopic_id] = parseInt(row.interactions, 10);
    }

    // Compute scores
    const scored = progressList.map(p => {
      const score = this.computeScore(p, intensityMap);

      return {
        subtopicId: p.subtopic_id,
        score,
        completed: !!p.completed_at,
        signals: {
          practice: p.practice_completed,
          quiz: p.quiz_completed,
          resources: p.resources_completed,
        }
      };
    });

    // Sort descending (worst first)
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Top weak topics (for recommendations)
   */
  async getTopWeakTopics(studentId, limit = 5) {
    const all = await this.getWeakTopics(studentId);

    return all
      .filter(t => !t.completed)
      .slice(0, limit);
  }
}

module.exports = new WeakTopicEngine();
