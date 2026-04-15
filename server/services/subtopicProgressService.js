'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * Progress Engine Core Service
 * Handles all learning state transitions safely & idempotently
 */

class SubtopicProgressService {

  // ─────────────────────────────────────────────
  // GET OR CREATE PROGRESS ROW
  // ─────────────────────────────────────────────
  static async getOrCreate(studentId, subtopicId) {
    const existing = await sequelize.query(
      `
      SELECT *
      FROM subtopic_progress
      WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.SELECT
      }
    );

    if (existing.length) return existing[0];

    await sequelize.query(
      `
      INSERT INTO subtopic_progress (student_id, subtopic_id)
      VALUES (:studentId, :subtopicId)
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.INSERT
      }
    );

    const created = await this.getOrCreate(studentId, subtopicId);
    return created;
  }

  // ─────────────────────────────────────────────
  // UPDATE FIELD (SAFE UPSERT STYLE)
  // ─────────────────────────────────────────────
  static async updateField(studentId, subtopicId, field, value) {
    await this.getOrCreate(studentId, subtopicId);

    await sequelize.query(
      `
      UPDATE subtopic_progress
      SET ${field} = :value,
          updated_at = NOW()
      WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId, value },
        type: QueryTypes.UPDATE
      }
    );

    return this.getProgress(studentId, subtopicId);
  }

  // ─────────────────────────────────────────────
  // GET PROGRESS
  // ─────────────────────────────────────────────
  static async getProgress(studentId, subtopicId) {
    const rows = await sequelize.query(
      `
      SELECT *
      FROM subtopic_progress
      WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.SELECT
      }
    );

    return rows[0] || null;
  }

  // ─────────────────────────────────────────────
  // CHECK COMPLETION STATE
  // ─────────────────────────────────────────────
  static async evaluateCompletion(studentId, subtopicId) {
    const progress = await this.getProgress(studentId, subtopicId);

    if (!progress) return null;

    const isComplete =
      progress.resources_completed &&
      progress.practice_completed &&
      progress.quiz_completed;

    if (!isComplete) return progress;

    // already completed → prevent duplicate XP
    if (progress.completed_at) return progress;

    await sequelize.query(
      `
      UPDATE subtopic_progress
      SET completed_at = NOW()
      WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId },
        type: QueryTypes.UPDATE
      }
    );

    // optional XP hook (Phase 2.4.3)
    await this.awardXP(studentId, 10);

    return this.getProgress(studentId, subtopicId);
  }

  // ─────────────────────────────────────────────
  // XP SYSTEM (MINIMAL CORE)
  // ─────────────────────────────────────────────
  static async awardXP(studentId, points) {
    await sequelize.query(
      `
      UPDATE users
      SET xp_points = xp_points + :points
      WHERE id = :studentId
      `,
      {
        replacements: { studentId, points },
        type: QueryTypes.UPDATE
      }
    );
  }
}

module.exports = SubtopicProgressService;
