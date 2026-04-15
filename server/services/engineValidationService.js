'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * ENGINE INTEGRATION VALIDATION LAYER
 * Ensures all engines are aligned before production execution
 */

class EngineValidationService {

  // ─────────────────────────────────────────────
  // 1. Validate Subtopic Progress Integrity
  // ─────────────────────────────────────────────
  static async validateSubtopicProgress(studentId) {
    const rows = await sequelize.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE resources_completed = true
            AND practice_completed = true
            AND quiz_completed = true
        )::int AS mastered
      FROM subtopic_progress
      WHERE student_id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT
      }
    );

    return {
      total: rows[0].total,
      mastered: rows[0].mastered,
      integrity: rows[0].total >= rows[0].mastered
    };
  }

  // ─────────────────────────────────────────────
  // 2. Validate Exam Analytics Sync
  // ─────────────────────────────────────────────
  static async validateAnalyticsSync(studentId) {
    const progress = await this.validateSubtopicProgress(studentId);

    const analytics = await sequelize.query(
      `
      SELECT
        COUNT(*)::int AS analyzed
      FROM exam_analytics
      WHERE student_id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT
      }
    );

    return {
      progress_total: progress.total,
      analytics_total: analytics[0].analyzed,
      in_sync: analytics[0].analyzed >= progress.total
    };
  }

  // ─────────────────────────────────────────────
  // 3. Validate AI Question Coverage
  // ─────────────────────────────────────────────
  static async validateAIQuestionCoverage(studentId) {
    const weakAreas = await sequelize.query(
      `
      SELECT COUNT(*)::int AS weak_count
      FROM exam_analytics
      WHERE student_id = :studentId
        AND mastery_level < 0.6
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT
      }
    );

    const aiQuestions = await sequelize.query(
      `
      SELECT COUNT(*)::int AS generated
      FROM ai_generated_questions
      WHERE student_id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT
      }
    );

    return {
      weak_areas: weakAreas[0].weak_count,
      ai_questions: aiQuestions[0].generated,
      coverage_ok: aiQuestions[0].generated >= weakAreas[0].weak_count
    };
  }

  // ─────────────────────────────────────────────
  // 4. FULL SYSTEM HEALTH CHECK
  // ─────────────────────────────────────────────
  static async fullSystemCheck(studentId) {
    const progress = await this.validateSubtopicProgress(studentId);
    const analytics = await this.validateAnalyticsSync(studentId);
    const ai = await this.validateAIQuestionCoverage(studentId);

    return {
      progress,
      analytics,
      ai,
      system_healthy:
        progress.integrity &&
        analytics.in_sync &&
        ai.coverage_ok
    };
  }
}

module.exports = EngineValidationService;
