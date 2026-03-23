// server/routes/analyticsRoutes.js
// All analytics endpoints for student dashboard.
// Existing analytics routes are preserved; new ones are appended.
// If an existing analyticsRoutes.js already exists, merge these handlers.

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

// ── GET /api/analytics/summary ────────────────────────────────────────────────
router.get('/summary', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user base data (streak, xp) — always returns one row
    const userRows = await sequelize.query(
      `SELECT COALESCE(xp_points, 0)          AS xp_points,
              COALESCE(study_streak_days, 0)   AS study_streak_days
       FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    // Fetch attempt aggregates — returns empty if no attempts yet
    const attemptRows = await sequelize.query(
      `SELECT
         COUNT(*)::INTEGER                                                 AS total_attempts,
         COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END))::INTEGER, 0) AS accuracy_pct,
         COUNT(DISTINCT DATE(attempted_at))::INTEGER                      AS subjects_practiced,
         COALESCE(SUM(time_taken_ms) / 1000, 0)::BIGINT                  AS total_time_seconds
       FROM practice_attempts
       WHERE student_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    const u = userRows[0]  || {};
    const a = attemptRows[0] || {};

    return res.json({
      success: true,
      data: {
        total_attempts:     a.total_attempts     || 0,
        accuracy_pct:       a.accuracy_pct       || 0,
        study_streak_days:  u.study_streak_days  || 0,
        xp_points:          u.xp_points          || 0,
        subjects_practiced: a.subjects_practiced || 0,
        total_time_seconds: a.total_time_seconds || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/weak-topics?limit=5 ────────────────────────────────────
router.get('/weak-topics', protect, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  try {
    const rows = await sequelize.query(
      `SELECT
         q.topic,
         s.name        AS subject_name,
         q.subtopic_id,
         COUNT(*)::INTEGER                                                 AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)    AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions q   ON q.id = pa.question_id
       JOIN subjects  s   ON s.id = q.subject_id_uuid
       WHERE pa.student_id = :userId
         AND pa.attempted_at > NOW() - INTERVAL '30 days'
         AND q.topic IS NOT NULL
       GROUP BY q.topic, s.name, q.subtopic_id
       HAVING COUNT(*) >= 2
       ORDER BY accuracy_pct ASC
       LIMIT :limit`,
      { replacements: { userId: req.user.id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/score-trend?days=30 ───────────────────────────────────
router.get('/score-trend', protect, async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  try {
    const rows = await sequelize.query(
      `SELECT
         DATE(pa.attempted_at)                                          AS date,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score
       FROM practice_attempts pa
       WHERE pa.student_id = :userId
         AND pa.attempted_at > NOW() - (:days || ' days')::INTERVAL
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date ASC`,
      { replacements: { userId: req.user.id, days }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/subject-breakdown ─────────────────────────────────────
router.get('/subject-breakdown', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         s.name                                                                AS subject_name,
         COUNT(pa.id)::INTEGER                                                 AS attempts,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)        AS accuracy_pct,
         ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)                             AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       JOIN subjects  s ON s.id = q.subject_id_uuid
       WHERE pa.student_id = :userId
       GROUP BY s.name
       ORDER BY accuracy_pct DESC`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/time-metrics ──────────────────────────────────────────
router.get('/time-metrics', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         s.name                                              AS subject_name,
         ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)          AS avg_time_seconds,
         ROUND(
           (SELECT AVG(pa2.time_taken_ms) / 1000.0
            FROM practice_attempts pa2
            JOIN questions q2 ON q2.id = pa2.question_id
            WHERE q2.subject_id_uuid = q.subject_id_uuid
           ), 1
         )                                                  AS benchmark_time_seconds
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       JOIN subjects  s ON s.id = q.subject_id_uuid
       WHERE pa.student_id = :userId
       GROUP BY s.name, q.subject_id_uuid
       ORDER BY s.name`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/leaderboard?subject_id= ───────────────────────────────
router.get('/leaderboard', protect, async (req, res) => {
  const { subject_id } = req.query;
  try {
    const subjectFilter = subject_id ? 'AND q.subject_id_uuid = :subject_id' : '';
    const rows = await sequelize.query(
      `SELECT
         SUBSTRING(u.first_name, 1, 3) || '***'            AS display_name,
         u.id = :userId                                     AS is_me,
         COALESCE(u.xp_points, 0)                          AS xp_points,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
         COUNT(pa.id)::INTEGER                              AS attempts
       FROM users u
       JOIN practice_attempts pa ON pa.student_id = u.id
       JOIN questions q           ON q.id = pa.question_id
       WHERE pa.attempted_at > NOW() - INTERVAL '7 days'
         ${subjectFilter}
       GROUP BY u.id, u.first_name, u.xp_points
       ORDER BY xp_points DESC, accuracy_pct DESC
       LIMIT 10`,
      { replacements: { userId: req.user.id, subject_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/badges ─────────────────────────────────────────────────
// Used by GamificationBar to show earned badges
router.get('/badges', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT badge_code, earned_at FROM user_badges WHERE user_id = :userId ORDER BY earned_at ASC`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


// ── GET /api/analytics/student/:studentId/topics ─────────────────────────────
// Teacher/admin view: per-topic accuracy for a specific student, optionally
// filtered by subject.  Uses q.topic (varchar on questions) per spec point 7.
router.get('/student/:studentId/topics', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { studentId } = req.params;
  const { subject_id } = req.query;

  try {
    const subjectFilter = subject_id ? 'AND q.subject_id_uuid = :subjectId' : '';
    const rows = await sequelize.query(
      `SELECT
         q.topic,
         s.name                                                              AS subject_name,
         COUNT(pa.id)::INTEGER                                               AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)      AS accuracy_pct,
         ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)                           AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       JOIN subjects  s ON s.id = q.subject_id_uuid
       WHERE pa.student_id = :studentId
         AND q.topic IS NOT NULL
         ${subjectFilter}
       GROUP BY q.topic, s.name
       ORDER BY accuracy_pct ASC`,
      { replacements: { studentId, subjectId: subject_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/student/:studentId/summary ────────────────────────────
// Teacher/admin view: overall attempt summary for a specific student.
router.get('/student/:studentId/summary', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { studentId } = req.params;

  try {
    const userRows = await sequelize.query(
      `SELECT COALESCE(xp_points, 0)        AS xp_points,
              COALESCE(study_streak_days, 0) AS study_streak_days
       FROM users WHERE id = :studentId`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    const attemptRows = await sequelize.query(
      `SELECT
         COUNT(*)::INTEGER                                                          AS total_attempts,
         COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END))::INTEGER, 0) AS accuracy_pct,
         COALESCE(SUM(time_taken_ms) / 1000, 0)::BIGINT                            AS total_time_seconds
       FROM practice_attempts
       WHERE student_id = :studentId`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    const u = userRows[0]    || {};
    const a = attemptRows[0] || {};

    return res.json({
      success: true,
      data: {
        total_attempts:     a.total_attempts     || 0,
        accuracy_pct:       a.accuracy_pct       || 0,
        study_streak_days:  u.study_streak_days  || 0,
        xp_points:          u.xp_points          || 0,
        total_time_seconds: a.total_time_seconds || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/cohort/:subjectId/topics ───────────────────────────────
// Teacher/admin view: class-wide topic accuracy for a given subject.
// Groups by q.topic (varchar on questions), weakest topics first.
router.get('/cohort/:subjectId/topics', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { subjectId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  try {
    const rows = await sequelize.query(
      `SELECT
         q.topic,
         COUNT(DISTINCT pa.student_id)::INTEGER                             AS student_count,
         COUNT(pa.id)::INTEGER                                              AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)     AS avg_accuracy,
         ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)                          AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE q.subject_id_uuid = :subjectId
         AND q.topic IS NOT NULL
       GROUP BY q.topic
       HAVING COUNT(*) >= 3
       ORDER BY avg_accuracy ASC
       LIMIT :limit`,
      { replacements: { subjectId, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
