'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * AnalyticsEngine
 * ----------------
 * Single source of truth for:
 * - student dashboard analytics
 * - weak topic computation
 * - progress summary
 * - cohort intelligence
 * - score trends
 *
 * Routes MUST NOT contain SQL logic.
 */

class AnalyticsEngine {
  // ─────────────────────────────────────────────
  // CORE DASHBOARD SUMMARY
  // ─────────────────────────────────────────────
  static async getProgressSummary(userId) {
    const [userRows, attemptRows] = await Promise.all([
      sequelize.query(
        `
        SELECT
          COALESCE(xp_points, 0) AS xp_points,
          COALESCE(study_streak_days, 0) AS study_streak_days
        FROM users
        WHERE id = :userId
        `,
        { replacements: { userId }, type: QueryTypes.SELECT }
      ),

      sequelize.query(
        `
        SELECT
          COUNT(*)::INTEGER AS total_attempts,

          COALESCE(
            ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END))::INTEGER,
            0
          ) AS accuracy_pct,

          COALESCE(SUM(time_taken_seconds), 0)::BIGINT AS total_time_seconds,

          COUNT(DISTINCT DATE(attempted_at))::INTEGER AS active_days

        FROM practice_attempts
        WHERE student_id = :userId
        `,
        { replacements: { userId }, type: QueryTypes.SELECT }
      ),
    ]);

    const u = userRows[0] || {};
    const a = attemptRows[0] || {};

    return {
      total_attempts: a.total_attempts || 0,
      accuracy_pct: a.accuracy_pct || 0,
      study_streak_days: u.study_streak_days || 0,
      xp_points: u.xp_points || 0,
      active_days: a.active_days || 0,
      total_time_seconds: a.total_time_seconds || 0,
    };
  }

  // ─────────────────────────────────────────────
  // WEAK TOPIC ENGINE
  // ─────────────────────────────────────────────
  static async getWeakTopics(userId, limit = 5) {
    const rows = await sequelize.query(
      `
      SELECT
        q.topic,
        s.name AS subject_name,
        COUNT(*)::INTEGER AS attempt_count,

        ROUND(
          AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),
          1
        ) AS accuracy_pct

      FROM practice_attempts pa
      JOIN questions q  ON q.id = pa.question_id
      JOIN subtopics st ON st.id = q.subtopic_id
      JOIN topics t     ON t.id = st.topic_id
      JOIN subjects s   ON s.id = t.subject_id

      WHERE pa.student_id = :userId
        AND pa.attempted_at > NOW() - INTERVAL '30 days'
        AND q.topic IS NOT NULL

      GROUP BY q.topic, s.name
      HAVING COUNT(*) >= 2

      ORDER BY accuracy_pct ASC
      LIMIT :limit
      `,
      {
        replacements: { userId, limit },
        type: QueryTypes.SELECT,
      }
    );

    return rows;
  }

  // ─────────────────────────────────────────────
  // SCORE TREND (TIME SERIES)
  // ─────────────────────────────────────────────
  static async getScoreTrend(userId, days = 30) {
    return sequelize.query(
      `
      SELECT
        DATE(attempted_at) AS date,
        ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score
      FROM practice_attempts
      WHERE student_id = :userId
        AND attempted_at > NOW() - (:days * INTERVAL '1 day')
      GROUP BY DATE(attempted_at)
      ORDER BY date ASC
      `,
      {
        replacements: { userId, days },
        type: QueryTypes.SELECT,
      }
    );
  }

  // ─────────────────────────────────────────────
  // SUBJECT PERFORMANCE BREAKDOWN
  // ─────────────────────────────────────────────
  static async getSubjectBreakdown(userId) {
    return sequelize.query(
      `
      SELECT
        s.id AS subject_id,
        s.name AS subject_name,

        COUNT(pa.id)::INTEGER AS attempts,

        ROUND(
          AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),
          1
        ) AS accuracy_pct,

        ROUND(AVG(pa.time_taken_seconds), 1) AS avg_time_seconds

      FROM practice_attempts pa
      JOIN questions q  ON q.id = pa.question_id
      JOIN subtopics st ON st.id = q.subtopic_id
      JOIN topics t     ON t.id = st.topic_id
      JOIN subjects s   ON s.id = t.subject_id

      WHERE pa.student_id = :userId

      GROUP BY s.id, s.name
      ORDER BY accuracy_pct DESC
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      }
    );
  }

  // ─────────────────────────────────────────────
  // TIME METRICS (EFFICIENCY ANALYSIS)
  // ─────────────────────────────────────────────
  static async getTimeMetrics(userId) {
    return sequelize.query(
      `
      WITH subject_bench AS (
        SELECT
          t.subject_id,
          AVG(pa.time_taken_seconds) AS benchmark_seconds
        FROM practice_attempts pa
        JOIN questions q ON q.id = pa.question_id
        JOIN subtopics st ON st.id = q.subtopic_id
        JOIN topics t ON t.id = st.topic_id
        GROUP BY t.subject_id
      )

      SELECT
        s.name AS subject_name,
        ROUND(AVG(pa.time_taken_seconds), 1) AS avg_time_seconds,
        ROUND(sb.benchmark_seconds::NUMERIC, 1) AS benchmark_time_seconds

      FROM practice_attempts pa
      JOIN questions q ON q.id = pa.question_id
      JOIN subtopics st ON st.id = q.subtopic_id
      JOIN topics t ON t.id = st.topic_id
      JOIN subjects s ON s.id = t.subject_id
      JOIN subject_bench sb ON sb.subject_id = t.subject_id

      WHERE pa.student_id = :userId

      GROUP BY s.name, sb.benchmark_seconds
      ORDER BY s.name
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      }
    );
  }

  // ─────────────────────────────────────────────
  // LEADERBOARD ENGINE
  // ─────────────────────────────────────────────
  static async getLeaderboard(userId, subjectId = null) {
    const subjectClause = subjectId ? 'AND t.subject_id = :subjectId' : '';

    return sequelize.query(
      `
      SELECT
        SUBSTRING(u.first_name, 1, 3) || '***' AS display_name,

        (u.id = :userId)::BOOLEAN AS is_me,

        COALESCE(u.xp_points, 0) AS xp_points,

        ROUND(
          AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),
          1
        ) AS accuracy_pct,

        COUNT(pa.id)::INTEGER AS attempts

      FROM users u
      JOIN practice_attempts pa ON pa.student_id = u.id
      JOIN questions q ON q.id = pa.question_id
      JOIN subtopics st ON st.id = q.subtopic_id
      JOIN topics t ON t.id = st.topic_id

      WHERE pa.attempted_at > NOW() - INTERVAL '7 days'
      ${subjectClause}

      GROUP BY u.id, u.first_name, u.xp_points
      ORDER BY xp_points DESC, accuracy_pct DESC
      LIMIT 10
      `,
      {
        replacements: { userId, subjectId },
        type: QueryTypes.SELECT,
      }
    );
  }

  // ─────────────────────────────────────────────
  // COHORT GAP DETECTION (TEACHER/ADMIN)
  // ─────────────────────────────────────────────
  static async getCohortGaps(subjectId = null) {
    const subjectFilter = subjectId ? 'AND t.subject_id = :subjectId' : '';

    const rows = await sequelize.query(
      `
      SELECT
        q.topic,
        ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
        COUNT(DISTINCT pa.student_id)::INTEGER AS student_count

      FROM practice_attempts pa
      JOIN questions q ON q.id = pa.question_id
      JOIN subtopics st ON st.id = q.subtopic_id
      JOIN topics t ON t.id = st.topic_id

      WHERE q.topic IS NOT NULL
      ${subjectFilter}

      GROUP BY q.topic
      HAVING COUNT(*) >= 3
      ORDER BY avg_accuracy ASC
      LIMIT 15
      `,
      {
        replacements: { subjectId },
        type: QueryTypes.SELECT,
      }
    );

    return rows.map(r => ({
      topic: r.topic,
      avg_accuracy: Math.round(r.avg_accuracy),
      student_count: r.student_count,
      recommendation:
        r.avg_accuracy < 40
          ? `Critical gap — re-teach ${r.topic} from fundamentals.`
          : r.avg_accuracy < 60
          ? `Moderate weakness in ${r.topic} — targeted revision needed.`
          : `Minor gap in ${r.topic} — quick revision recommended.`,
    }));
  }
}

module.exports = AnalyticsEngine;
