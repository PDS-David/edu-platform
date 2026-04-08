// ─────────────────────────────────────────────────────────────────────────────
// All analytics endpoints — student dashboard + teacher/admin views.
//
// FIXES applied across both review passes:
//   1. subject-breakdown now returns subject_id (s.id) so the grade-prediction
//      dropdown in StudentAnalyticsDashboard can pass a real UUID.
//   2. leaderboard: replaced invalid named-param mix ($1 vs :name) that caused
//      Sequelize to throw "bind message supplies N parameters, but prepared
//      statement requires M". subject_id added to replacements only when used.
//   3. leaderboard: (u.id = :userId)::BOOLEAN cast so is_me is always a real
//      boolean on the client, not a driver-version-dependent string.
//   4. cohort-gaps endpoint mounted on /api/analytics (dashboard calls
//      GET /analytics/cohort-gaps, not /ai/cohort-gaps).
//   5. score-trend INTERVAL: (:days * INTERVAL '1 day') — safe integer
//      multiplication; avoids pg cast errors on all driver versions.
//   6. time-metrics: correlated subquery referenced outer alias `q` which is
//      out of scope inside the subquery, causing PostgreSQL to throw
//      "missing FROM-clause entry for table q" at runtime. Fixed with a WITH
//      CTE that pre-aggregates the global per-subject benchmark independently,
//      then JOINs it into the main query.
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

// ── GET /api/analytics/summary ────────────────────────────────────────────────
router.get('/summary', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const [userRows, attemptRows] = await Promise.all([
      sequelize.query(
        `SELECT COALESCE(xp_points, 0)        AS xp_points,
                COALESCE(study_streak_days, 0) AS study_streak_days
         FROM users WHERE id = :userId`,
        { replacements: { userId }, type: QueryTypes.SELECT }
      ),
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
    ]);

    const u = userRows[0]    || {};
    const a = attemptRows[0] || {};

    return res.json({
      success: true,
      data: {
        total_attempts:     a.total_attempts     || 0,
        accuracy_pct:       a.accuracy_pct       || 0,
        study_streak_days:  u.study_streak_days  || 0,
        xp_points:          u.xp_points          || 0,
        subjects_practiced: a.subjects_practiced || 0,
        active_days:        a.active_days        || 0,
        total_time_seconds: a.total_time_seconds || 0,
      },
    });
  } catch (err) {
    console.error('[GET /analytics/summary]', err.message);
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
         s.name                                                              AS subject_name,
         q.subtopic_id,
         COUNT(*)::INTEGER                                                   AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)      AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       JOIN subjects  s ON s.id = q.subject_id_uuid
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
    console.error('[GET /analytics/weak-topics]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/score-trend?days=30 ───────────────────────────────────
// FIX 5: (:days * INTERVAL '1 day') — multiplying an integer binding by a
// typed interval literal is valid standard PostgreSQL and safe across all
// pg driver versions. Avoids the broken (:days || ' days')::INTERVAL cast.
router.get('/score-trend', protect, async (req, res) => {
  const rawDays = Math.min(parseInt(req.query.days) || 30, 90);
  try {
    const rows = await sequelize.query(
      `SELECT
         DATE(pa.attempted_at)                                          AS date,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score
       FROM practice_attempts pa
       WHERE pa.student_id = :userId
         AND pa.attempted_at > NOW() - (:days * INTERVAL '1 day')
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date ASC`,
      { replacements: { userId: req.user.id, days: rawDays }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/score-trend]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/subject-breakdown ─────────────────────────────────────
// FIX 1: returns s.id AS subject_id so the frontend can pass a real UUID to
// downstream endpoints like /leaderboard?subject_id= and /cohort/:id/topics.
// GROUP BY includes s.id to avoid collapsing subjects with identical names.
router.get('/subject-breakdown', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         s.id                                                                  AS subject_id,
         s.name                                                                AS subject_name,
         COUNT(pa.id)::INTEGER                                                 AS attempts,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)        AS accuracy_pct,
         ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)                             AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       JOIN subjects  s ON s.id = q.subject_id_uuid
       WHERE pa.student_id = :userId
       GROUP BY s.id, s.name
       ORDER BY accuracy_pct DESC`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/subject-breakdown]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/time-metrics ──────────────────────────────────────────
// FIX 6: The original correlated subquery used `q.subject_id_uuid` inside its
// own WHERE clause, but `q` is the outer query's alias — it is not in scope
// inside a subquery. PostgreSQL raises "missing FROM-clause entry for table q"
// at runtime.
//
// Fix: a WITH CTE (`subject_bench`) pre-aggregates the global average time per
// subject across ALL attempts (no student filter — that is the benchmark).
// The main query then JOINs this CTE on subject_id_uuid so each row gets the
// correct global benchmark without any cross-scope reference.
router.get('/time-metrics', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `WITH subject_bench AS (
         SELECT
           q2.subject_id_uuid,
           AVG(pa2.time_taken_ms) / 1000.0 AS benchmark_time_seconds
         FROM practice_attempts pa2
         JOIN questions q2 ON q2.id = pa2.question_id
         GROUP BY q2.subject_id_uuid
       )
       SELECT
         s.name                                              AS subject_name,
         ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)          AS avg_time_seconds,
         ROUND(sb.benchmark_time_seconds::NUMERIC, 1)       AS benchmark_time_seconds
       FROM practice_attempts pa
       JOIN questions      q  ON q.id  = pa.question_id
       JOIN subjects        s  ON s.id  = q.subject_id_uuid
       JOIN subject_bench  sb ON sb.subject_id_uuid = q.subject_id_uuid
       WHERE pa.student_id = :userId
       GROUP BY s.name, q.subject_id_uuid, sb.benchmark_time_seconds
       ORDER BY s.name`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/time-metrics]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/leaderboard?subject_id= ───────────────────────────────
// FIX 2: subject_id added to replacements only when the clause is active,
//         preventing Sequelize from passing a NULL binding for an absent placeholder.
// FIX 3: (u.id = :userId)::BOOLEAN ensures is_me is always a proper boolean
//         on the client regardless of pg driver version.
router.get('/leaderboard', protect, async (req, res) => {
  const { subject_id } = req.query;
  try {
    const subjectClause = subject_id
      ? 'AND q.subject_id_uuid = :subject_id'
      : '';

    const replacements = { userId: req.user.id };
    if (subject_id) replacements.subject_id = subject_id;

    const rows = await sequelize.query(
      `SELECT
         SUBSTRING(u.first_name, 1, 3) || '***'                          AS display_name,
         (u.id = :userId)::BOOLEAN                                        AS is_me,
         COALESCE(u.xp_points, 0)                                         AS xp_points,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)    AS accuracy_pct,
         COUNT(pa.id)::INTEGER                                             AS attempts
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
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/leaderboard]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/badges ─────────────────────────────────────────────────
router.get('/badges', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT badge_code, earned_at
       FROM user_badges
       WHERE user_id = :userId
       ORDER BY earned_at ASC`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/badges]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/cohort-gaps?class_id=&subject_id= ─────────────────────
// FIX 4: mounted on /api/analytics (dashboard calls GET /analytics/cohort-gaps).
// Teacher/admin only. Returns weakest topics with a plain-text recommendation.
// Supports optional class_id (scoped to enrolled students) and subject_id filters.
// ── GET /api/analytics/daily-study ──────────────────────────────────────────
// Returns distinct calendar days studied in the last 60 days.
// Used by MiniCalendar in StudentDashboard to highlight active days.
//
// BUG FIX (Bug 4): StudentDashboard.jsx called /analytics/daily-study/:id
// which never existed in this file. Endpoint added here. Identity comes from
// the JWT (req.user.id) so no :studentId param is needed — no IDOR risk.
router.get('/daily-study', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT DATE(attempted_at) AS study_date
       FROM practice_attempts
       WHERE student_id = :userId
         AND attempted_at >= NOW() - INTERVAL '60 days'
       ORDER BY study_date ASC`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/daily-study]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ⚠️  LOAD-BEARING ORDER (Bug 10): /cohort-gaps MUST stay declared before
// /cohort/:subjectId/topics. If the order were reversed, Express would match
// the literal string "gaps" as :subjectId and this route would become
// unreachable. DO NOT reorder these two routes.
router.get('/cohort-gaps', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  }

  const { class_id, subject_id } = req.query;

  try {
    let topicRows;

    if (class_id) {
      // Class-scoped: only attempts from enrolled students
      topicRows = await sequelize.query(
        `SELECT
           q.topic,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
           COUNT(DISTINCT pa.student_id)::INTEGER                        AS student_count
         FROM practice_attempts pa
         JOIN questions         q  ON q.id = pa.question_id
         JOIN class_memberships cm ON cm.student_id = pa.student_id
           AND cm.class_id = :class_id
         WHERE q.topic IS NOT NULL
           ${subject_id ? 'AND q.subject_id_uuid = :subject_id' : ''}
         GROUP BY q.topic
         HAVING COUNT(*) >= 3
         ORDER BY avg_accuracy ASC
         LIMIT 15`,
        {
          replacements: { class_id, ...(subject_id ? { subject_id } : {}) },
          type: QueryTypes.SELECT,
        }
      );
    } else {
      // Global fallback: all attempts across all students
      topicRows = await sequelize.query(
        `SELECT
           q.topic,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
           COUNT(DISTINCT pa.student_id)::INTEGER                        AS student_count
         FROM practice_attempts pa
         JOIN questions q ON q.id = pa.question_id
         WHERE q.topic IS NOT NULL
           ${subject_id ? 'AND q.subject_id_uuid = :subject_id' : ''}
         GROUP BY q.topic
         HAVING COUNT(*) >= 5
         ORDER BY avg_accuracy ASC
         LIMIT 15`,
        {
          replacements: subject_id ? { subject_id } : {},
          type: QueryTypes.SELECT,
        }
      );
    }

    const gaps = topicRows.map(t => ({
      topic:          t.topic,
      avg_accuracy:   Math.round(t.avg_accuracy),
      student_count:  t.student_count,
      recommendation: t.avg_accuracy < 40
        ? `Critical gap — consider re-teaching ${t.topic} from first principles.`
        : t.avg_accuracy < 60
        ? `Moderate gap in ${t.topic} — targeted revision exercises recommended.`
        : `Minor weakness in ${t.topic} — a quick recap may help.`,
    }));

    return res.json({ success: true, data: { gaps } });
  } catch (err) {
    console.error('[GET /analytics/cohort-gaps]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Teacher/Admin views ───────────────────────────────────────────────────────

// GET /api/analytics/student/:studentId/topics
router.get('/student/:studentId/topics', protect, async (req, res) => {
  // FIX (Bug B): Students can view their own topic performance; teachers/admins can view any student.
  const { studentId } = req.params;
  if (req.user.role === 'student' && req.user.id !== studentId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  if (!['student', 'teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { subject_id } = req.query;

  try {
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
         ${subject_id ? 'AND q.subject_id_uuid = :subject_id' : ''}
       GROUP BY q.topic, s.name
       ORDER BY accuracy_pct ASC`,
      {
        replacements: { studentId, ...(subject_id ? { subject_id } : {}) },
        type: QueryTypes.SELECT,
      }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/student/topics]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/student/:studentId/summary
router.get('/student/:studentId/summary', protect, async (req, res) => {
  // FIX (Bug A): Students can view their own summary; teachers/admins can view any student.
  // Also expanded response to include quizzes_completed, time_spent_minutes, time_spent_seconds
  // which StudentDashboard reads from summaryData.
  const { studentId } = req.params;
  if (req.user.role === 'student' && req.user.id !== studentId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  if (!['student', 'teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    const [userRows, attemptRows, progressRows] = await Promise.all([
      sequelize.query(
        `SELECT COALESCE(xp_points, 0)        AS xp_points,
                COALESCE(study_streak_days, 0) AS study_streak_days
         FROM users WHERE id = :studentId`,
        { replacements: { studentId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           COUNT(*)::INTEGER                                                           AS total_attempts,
           COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END))::INTEGER, 0) AS accuracy_pct,
           COALESCE(SUM(time_taken_ms), 0)::BIGINT                                    AS total_time_ms
         FROM practice_attempts
         WHERE student_id = :studentId`,
        { replacements: { studentId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           COUNT(*) FILTER (WHERE quiz_completed)::INTEGER AS quizzes_completed
         FROM subtopic_progress
         WHERE student_id = :studentId`,
        { replacements: { studentId }, type: QueryTypes.SELECT }
      ),
    ]);

    const u = userRows[0]    || {};
    const a = attemptRows[0] || {};
    const p = progressRows[0] || {};

    const totalMs   = parseInt(a.total_time_ms) || 0;
    const totalMins = Math.floor(totalMs / 60000);
    const totalSecs = Math.floor((totalMs % 60000) / 1000);

    return res.json({
      success: true,
      data: {
        total_attempts:     a.total_attempts      || 0,
        accuracy_pct:       a.accuracy_pct        || 0,
        study_streak_days:  u.study_streak_days   || 0,
        xp_points:          u.xp_points           || 0,
        quizzes_completed:  p.quizzes_completed   || 0,
        time_spent_minutes: totalMins,
        time_spent_seconds: totalSecs,
      },
    });
  } catch (err) {
    console.error('[GET /analytics/student/summary]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/cohort/:subjectId/topics
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
         COUNT(DISTINCT pa.student_id)::INTEGER                              AS student_count,
         COUNT(pa.id)::INTEGER                                               AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1)      AS avg_accuracy,
         ROUND(AVG(pa.time_taken_ms) / 1000.0, 1)                           AS avg_time_seconds
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
    console.error('[GET /analytics/cohort/topics]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;


