// server/tools/analyticsTools.js
// ---------------------------------------------------------------------------
// AI-callable tool: student performance analytics.
//
// Wraps the DB queries that live in:
//   server/routes/analyticsRoutes.js (summary, weak-topics, subject-breakdown,
//                                      score-trend, leaderboard, time-metrics)
//   server/services/aiService.js  (predictGrade)
//
// Does NOT modify those files.
// ---------------------------------------------------------------------------

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// Lazy-load aiService — avoids crash if GEMINI_API_KEY is not set at boot
function getAiService() {
  return require('../services/aiService');
}

// ---------------------------------------------------------------------------
// getPerformance(userId)
//
// Returns a comprehensive performance snapshot: summary stats, weak topics,
// subject breakdown, and score trend. This is the primary tool the AI calls
// when a student asks about their progress.
//
// Output shape:
// {
//   summary:           { total_attempts, accuracy_pct, study_streak_days,
//                        xp_points, subjects_practiced, active_days, total_time_seconds },
//   weak_topics:       [ { topic, subject_name, attempt_count, accuracy_pct } ],
//   subject_breakdown: [ { subject_id, subject_name, attempts, accuracy_pct, avg_time_seconds } ],
//   score_trend:       [ { date, avg_score } ],   // last 30 days
// }
// ---------------------------------------------------------------------------
async function getPerformance(userId) {
  if (!userId) {
    return toolError('getPerformance', 'userId is required');
  }

  try {
    const [userRows, attemptRows, weakTopics, subjectBreakdown, scoreTrend] =
      await Promise.all([

        // XP + streak
        sequelize.query(
          `SELECT COALESCE(xp_points, 0)        AS xp_points,
                  COALESCE(study_streak_days, 0) AS study_streak_days
           FROM users WHERE id = :userId`,
          { replacements: { userId }, type: QueryTypes.SELECT }
        ),

        // Overall attempt stats
        sequelize.query(
          `SELECT
             COUNT(*)::INTEGER                                                           AS total_attempts,
             COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END))::INTEGER, 0) AS accuracy_pct,
             COUNT(DISTINCT q.subject_id_uuid)::INTEGER                                 AS subjects_practiced,
             COUNT(DISTINCT DATE(pa.attempted_at))::INTEGER                             AS active_days,
             COALESCE(SUM(pa.time_taken_ms) / 1000, 0)::BIGINT                         AS total_time_seconds
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           WHERE pa.student_id = :userId`,
          { replacements: { userId }, type: QueryTypes.SELECT }
        ),

        // Weak topics (last 30 days, min 2 attempts)
        sequelize.query(
          `SELECT
             q.topic,
             s.name                                                             AS subject_name,
             q.subtopic_id,
             COUNT(*)::INTEGER                                                  AS attempt_count,
             ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)     AS accuracy_pct
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           JOIN subjects  s ON s.id = q.subject_id_uuid
           WHERE pa.student_id = :userId
             AND pa.attempted_at > NOW() - INTERVAL '30 days'
             AND q.topic IS NOT NULL
           GROUP BY q.topic, s.name, q.subtopic_id
           HAVING COUNT(*) >= 2
           ORDER BY accuracy_pct ASC
           LIMIT 5`,
          { replacements: { userId }, type: QueryTypes.SELECT }
        ),

        // Subject breakdown
        sequelize.query(
          `SELECT
             s.id                                                                AS subject_id,
             s.name                                                              AS subject_name,
             COUNT(pa.id)::INTEGER                                               AS attempts,
             ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)      AS accuracy_pct,
             ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)                           AS avg_time_seconds
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           JOIN subjects  s ON s.id = q.subject_id_uuid
           WHERE pa.student_id = :userId
           GROUP BY s.id, s.name
           ORDER BY accuracy_pct DESC`,
          { replacements: { userId }, type: QueryTypes.SELECT }
        ),

        // Score trend — last 30 days
        sequelize.query(
          `SELECT
             DATE(pa.attempted_at)                                          AS date,
             ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score
           FROM practice_attempts pa
           WHERE pa.student_id = :userId
             AND pa.attempted_at > NOW() - (30 * INTERVAL '1 day')
           GROUP BY DATE(pa.attempted_at)
           ORDER BY date ASC`,
          { replacements: { userId }, type: QueryTypes.SELECT }
        ),
      ]);

    const u = userRows[0]    || {};
    const a = attemptRows[0] || {};

    return toolSuccess('getPerformance', {
      summary: {
        total_attempts:     a.total_attempts     || 0,
        accuracy_pct:       a.accuracy_pct       || 0,
        study_streak_days:  u.study_streak_days  || 0,
        xp_points:          u.xp_points          || 0,
        subjects_practiced: a.subjects_practiced || 0,
        active_days:        a.active_days        || 0,
        total_time_seconds: a.total_time_seconds || 0,
      },
      weak_topics:       weakTopics,
      subject_breakdown: subjectBreakdown,
      score_trend:       scoreTrend,
    });

  } catch (err) {
    return toolError('getPerformance', err.message, err);
  }
}

// ---------------------------------------------------------------------------
// predictGrade(userId, subjectId)
//
// Calls aiService.predictGrade with the student's real performance data.
// Returns a structured grade prediction with study advice.
//
// Output shape:
// {
//   subject_name, predictedGrade, confidence, weakestTopics, studyAdvice
// }
// ---------------------------------------------------------------------------
async function predictGrade(userId, subjectId) {
  if (!userId || !subjectId) {
    return toolError('predictGrade', 'userId and subjectId are required');
  }

  try {
    // Fetch per-topic stats for this subject
    const [subjectRows, topicRows] = await Promise.all([
      sequelize.query(
        `SELECT s.name AS subject_name, eb.name AS exam_board
         FROM subjects s
         LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
         WHERE s.id = :subjectId`,
        { replacements: { subjectId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           q.topic                                                             AS name,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)     AS correct_pct,
           COUNT(*)::INTEGER                                                   AS attempts_count
         FROM practice_attempts pa
         JOIN questions q ON q.id = pa.question_id
         WHERE pa.student_id    = :userId
           AND q.subject_id_uuid = :subjectId
           AND q.topic IS NOT NULL
         GROUP BY q.topic
         ORDER BY correct_pct ASC`,
        { replacements: { userId, subjectId }, type: QueryTypes.SELECT }
      ),
    ]);

    if (!subjectRows.length) {
      return toolError('predictGrade', `Subject not found: ${subjectId}`, null, 404);
    }

    const { subject_name, exam_board } = subjectRows[0];
    const overallCorrectPct = topicRows.length
      ? topicRows.reduce((sum, t) => sum + parseFloat(t.correct_pct), 0) / topicRows.length
      : 0;
    const totalAttempts = topicRows.reduce((sum, t) => sum + t.attempts_count, 0);

    const topics = topicRows.map((t) => ({
      name:          t.name,
      correctPct:    parseFloat(t.correct_pct),
      attemptsCount: t.attempts_count,
    }));

    const { predictGrade: aiPredictGrade } = getAiService();
    const prediction = await aiPredictGrade({
      subjectName: subject_name,
      examBoard:   exam_board,
      topics,
      overallCorrectPct,
      totalAttempts,
      avgTimePerQuestionMs: 0,
    });

    return toolSuccess('predictGrade', { subject_name, ...prediction });

  } catch (err) {
    return toolError('predictGrade', err.message, err);
  }
}

// ---------------------------------------------------------------------------
// getLeaderboard(userId, subjectId)
//
// Returns the top-10 leaderboard for a subject (or global).
// Anonymises other students — only the requesting user sees their own name.
// ---------------------------------------------------------------------------
async function getLeaderboard(userId, subjectId = null) {
  if (!userId) {
    return toolError('getLeaderboard', 'userId is required');
  }

  try {
    const subjectClause  = subjectId ? 'AND q.subject_id_uuid = :subject_id' : '';
    const replacements   = { userId };
    if (subjectId) replacements.subject_id = subjectId;

    const rows = await sequelize.query(
      `SELECT
         SUBSTRING(u.first_name, 1, 3) || '***'                        AS display_name,
         (u.id = :userId)::BOOLEAN                                      AS is_me,
         COALESCE(u.xp_points, 0)                                       AS xp_points,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)  AS accuracy_pct,
         COUNT(pa.id)::INTEGER                                           AS attempts
       FROM users u
       JOIN practice_attempts pa ON pa.student_id = u.id
       JOIN questions q           ON q.id = pa.question_id
       WHERE pa.attempted_at > NOW() - INTERVAL '7 days'
         ${subjectClause}
       GROUP BY u.id, u.first_name, u.xp_points
       ORDER BY xp_points DESC, accuracy_pct DESC
       LIMIT 10`,
      { replacements, type: QueryTypes.SELECT }
    );

    return toolSuccess('getLeaderboard', { leaderboard: rows });

  } catch (err) {
    return toolError('getLeaderboard', err.message, err);
  }
}

module.exports = { getPerformance, predictGrade, getLeaderboard };
