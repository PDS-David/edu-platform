'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * Subtopic Progress Service
 * -------------------------
 * Central logic for:
 * - updating learning activities
 * - computing completion state
 * - syncing derived completion field
 */

class SubtopicProgressService {

  // ─────────────────────────────────────────────
  // Ensure row exists
  // ─────────────────────────────────────────────
  static async ensureProgress(studentId, subtopicId) {
    const existing = await sequelize.query(
      `
      SELECT id FROM subtopic_progress
      WHERE student_id = :studentId AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.SELECT
      }
    );

    if (existing.length) return existing[0].id;

    const result = await sequelize.query(
      `
      INSERT INTO subtopic_progress (student_id, subtopic_id)
      VALUES (:studentId, :subtopicId)
      RETURNING id
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.SELECT
      }
    );

    return result[0].id;
  }

  // ─────────────────────────────────────────────
  // Update a single progress flag
  // ─────────────────────────────────────────────
  static async updateProgress(studentId, subtopicId, field, value = true) {

    const allowedFields = [
      'resources_completed',
      'practice_completed',
      'quiz_completed',
      'notes_viewed',
      'video_watched'
    ];

    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid progress field: ${field}`);
    }

    await this.ensureProgress(studentId, subtopicId);

    await sequelize.query(
      `
      UPDATE subtopic_progress
      SET ${field} = :value,
          updated_at = NOW(),
          completed_at = CASE
            WHEN (
              resources_completed = true AND
              practice_completed = true AND
              quiz_completed = true AND
              notes_viewed = true AND
              video_watched = true
            )
            THEN NOW()
            ELSE completed_at
          END
      WHERE student_id = :studentId AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId, value },
        type: QueryTypes.UPDATE
      }
    );

    return this.getProgress(studentId, subtopicId);
  }

  // ─────────────────────────────────────────────
  // Get progress state
  // ─────────────────────────────────────────────
  static async getProgress(studentId, subtopicId) {
    const rows = await sequelize.query(
      `
      SELECT *
      FROM subtopic_progress
      WHERE student_id = :studentId AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.SELECT
      }
    );

    return rows[0] || null;
  }

  // ─────────────────────────────────────────────
  // Compute completion status (SMART ENGINE)
  // ─────────────────────────────────────────────
  static isCompleted(progress) {
    if (!progress) return false;

    return (
      progress.resources_completed &&
      progress.practice_completed &&
      progress.quiz_completed &&
      progress.notes_viewed &&
      progress.video_watched
    );
  }

  // ─────────────────────────────────────────────
  // Get completion percentage
  // ─────────────────────────────────────────────
  static getCompletionPercentage(progress) {
    if (!progress) return 0;

    const fields = [
      progress.resources_completed,
      progress.practice_completed,
      progress.quiz_completed,
      progress.notes_viewed,
      progress.video_watched
    ];

    const done = fields.filter(Boolean).length;

    return Math.round((done / fields.length) * 100);
  }

  // ─────────────────────────────────────────────
  // Mark full completion manually
  // ─────────────────────────────────────────────
  static async markCompleted(studentId, subtopicId) {
    await this.ensureProgress(studentId, subtopicId);

    await sequelize.query(
      `
      UPDATE subtopic_progress
      SET resources_completed = true,
          practice_completed = true,
          quiz_completed = true,
          notes_viewed = true,
          video_watched = true,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE student_id = :studentId AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.UPDATE
      }
    );

    return this.getProgress(studentId, subtopicId);
  }
}

module.exports = SubtopicProgressService;
