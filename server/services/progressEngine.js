'use strict';

const SubtopicProgressService = require('./subtopicProgressService');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

class ProgressEngine {

  // ─────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────
  static async trackAction({
    studentId,
    subtopicId,
    action
  }) {

    // 1. Map action → DB field
    const actionMap = {
      resource: 'resources_completed',
      practice: 'practice_completed',
      quiz: 'quiz_completed',
      notes: 'notes_viewed',
      video: 'video_watched'
    };

    const field = actionMap[action];

    if (!field) {
      throw new Error(`Invalid action: ${action}`);
    }

    // 2. Update progress
    const progress = await SubtopicProgressService.updateProgress(
      studentId,
      subtopicId,
      field,
      true
    );

    // 3. Evaluate completion
    const isCompleted = SubtopicProgressService.isCompleted(progress);

    if (isCompleted) {
      await this.handleCompletion(studentId, subtopicId);
    }

    return {
      progress,
      completed: isCompleted,
      percentage: SubtopicProgressService.getCompletionPercentage(progress)
    };
  }

  // ─────────────────────────────────────────────
  // COMPLETION HANDLER
  // ─────────────────────────────────────────────
  static async handleCompletion(studentId, subtopicId) {

    // prevent duplicate XP
    const alreadyProcessed = await sequelize.query(
      `
      SELECT completed_at
      FROM subtopic_progress
      WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.SELECT
      }
    );

    if (alreadyProcessed[0]?.completed_at) {
      return;
    }

    // 1. mark completed
    await SubtopicProgressService.markCompleted(studentId, subtopicId);

    // 2. award XP
    await sequelize.query(
      `
      UPDATE users
      SET xp_points = xp_points + 10
      WHERE id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.UPDATE
      }
    );

    // 3. unlock next subtopic (future expansion hook)
    await this.unlockNext(studentId, subtopicId);
  }

  // ─────────────────────────────────────────────
  // NEXT SUBTOPIC LOGIC (BASIC VERSION)
  // ─────────────────────────────────────────────
  static async unlockNext(studentId, subtopicId) {

    const current = await sequelize.query(
      `
      SELECT topic_id, order_index
      FROM subtopics
      WHERE id = :subtopicId
      `,
      {
        replacements: { subtopicId },
        type: QueryTypes.SELECT
      }
    );

    if (!current.length) return;

    const { topic_id, order_index } = current[0];

    const next = await sequelize.query(
      `
      SELECT id
      FROM subtopics
      WHERE topic_id = :topicId
      AND order_index > :orderIndex
      ORDER BY order_index ASC
      LIMIT 1
      `,
      {
        replacements: {
          topicId: topic_id,
          orderIndex: order_index
        },
        type: QueryTypes.SELECT
      }
    );

    if (!next.length) return;

    // future hook: unlock system (can be expanded later)
    return next[0].id;
  }
}

module.exports = ProgressEngine;
