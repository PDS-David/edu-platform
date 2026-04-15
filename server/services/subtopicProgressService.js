'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * SUBTOPIC PROGRESS SERVICE (SMART ENGINE CORE)
 * ---------------------------------------------
 * Single source of truth for:
 * - progress tracking
 * - weighted completion
 * - XP system
 * - streak system
 * - completion evaluation
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
  // UPDATE FIELD (IDEMPOTENT)
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
  // WEIGHTED SCORE CALCULATION
  // ─────────────────────────────────────────────
  static calculateScore(progress) {
    const score =
      (progress.resources_completed ? 0.3 : 0) +
      (progress.practice_completed ? 0.3 : 0) +
      (progress.quiz_completed ? 0.4 : 0);

    return Math.round(score * 100);
  }

  static isCompleted(progress) {
    return this.calculateScore(progress) >= 100;
  }

  // ─────────────────────────────────────────────
  // XP CALCULATION (SMART REWARD SYSTEM)
  // ─────────────────────────────────────────────
  static calculateXP(progress) {
    const score = this.calculateScore(progress);

    let xp = 10;

    if (score >= 40) xp += 2;
    if (score >= 70) xp += 3;
    if (score >= 100) xp += 5;

    return xp;
  }

  // ─────────────────────────────────────────────
  // STREAK SYSTEM
  // ─────────────────────────────────────────────
  static async updateStreak(studentId) {
    const today = new Date().toISOString().slice(0, 10);

    const rows = await sequelize.query(
      `
      SELECT last_login
      FROM users
      WHERE id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT
      }
    );

    const user = rows[0];
    if (!user) return;

    const lastLogin = user.last_login
      ? new Date(user.last_login).toISOString().slice(0, 10)
      : null;

    if (lastLogin === today) return;

    await sequelize.query(
      `
      UPDATE users
      SET study_streak_days = study_streak_days + 1,
          last_login = NOW()
      WHERE id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.UPDATE
      }
    );
  }

  // ─────────────────────────────────────────────
  // MAIN EVALUATION ENGINE
  // ─────────────────────────────────────────────
  static async evaluateCompletion(studentId, subtopicId) {
    const progress = await this.getProgress(studentId, subtopicId);
    if (!progress) return null;

    const score = this.calculateScore(progress);
    const completed = this.isCompleted(progress);

    await this.updateStreak(studentId);

    // already completed → prevent XP duplication
    if (progress.completed_at) {
      return { ...progress, score, completed: true };
    }

    // not completed yet
    if (!completed) {
      return { ...progress, score, completed: false };
    }

    // mark completion
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

    // award XP
    const xp = this.calculateXP(progress);
    await this.awardXP(studentId, xp);

    return {
      ...progress,
      score,
      completed: true,
      xpAwarded: xp
    };
  }

  // ─────────────────────────────────────────────
  // XP AWARD
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
