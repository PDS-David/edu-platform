'use strict';

// server/routes/analyticsRoutes.js
// All analytics — student dashboard + teacher/admin views.
// Key fix: questions join to subjects via subtopics→topics chain, not directly.
// practice_attempts columns: student_id, question_id, is_correct, attempted_at, time_taken_seconds

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

// Safe wrapper — returns fallback if practice_attempts or related tables missing
const safeQuery = async (sql, replacements, fallback = []) => {
  try {
    return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (e) {
    console.warn('[analytics] query skipped:', e.message.slice(0, 100));
    return fallback;
  }
};

// Correct join chain: questions → subtopics → topics → subjects
const SUBJECT_JOIN = `
  JOIN subtopics st ON st.id = q.subtopic_id
  JOIN topics    t  ON t.id  = st.topic_id
  JOIN subjects  s  ON s.id  = t.subject_id
`;

// ── GET /api/analytics/summary ────────────────────────────────────────────────
router.get('/summary', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const [userRows, attemptRows] = await Promise.all([
      safeQuery(
        `SELECT COALESCE(xp_points, 0) AS xp_points,
                COALESCE(study_streak_days, 0) AS study_streak_days
         FROM users WHERE id = :userId`,
        { userId }, [{}]
      ),
      safeQuery(
        `SELECT
           COUNT(*)::INTEGER AS total_attempts,
           COALESCE(ROUND(AVG(CASE WHEN pa.is_correct THEN 100 ELSE 0 END))::INTEGER, 0) AS accuracy_pct,
           COUNT(DISTINCT t.subject_id)::INTEGER AS subjects_practiced,
           COUNT(DISTINCT DATE(pa.attempted_at))::INTEGER AS active_days,
           COALESCE(SUM(pa.time_taken_seconds), 0)::BIGINT AS total_time_seconds,
           COUNT(*) FILTER (WHERE pa.attempted_at >= CURRENT_DATE)::INTEGER AS today_attempts
         FROM practice_attempts pa
         JOIN questions  q  ON q.id  = pa.question_id
         JOIN subtopics  st ON st.id = q.subtopic_id
         JOIN topics     t  ON t.id  = st.topic_id
         WHERE pa.student_id = :userId`,
        { userId }, [{}]
      ),
    ]);
    const u = userRows[0] || {};
    const a = attemptRows[0] || {};
    return res.json({ success: true, data: {
      total_attempts:     a.total_attempts     || 0,
      accuracy_pct:       a.accuracy_pct       || 0,
      study_streak_days:  u.study_streak_days  || 0,
      xp_points:          u.xp_points          || 0,
      subjects_practiced: a.subjects_practiced || 0,
      active_days:        a.active_days        || 0,
      total_time_seconds: a.total_time_seconds || 0,
      today_attempts:     a.today_attempts     || 0,
    }});
  } catch (err) {
    console.error('[GET /analytics/summary]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/weak-topics?limit=5 ───────────────────────────────────
router.get('/weak-topics', protect, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  try {
    const rows = await safeQuery(
      `-- topic name + id come from the join chain:
       --   practice_attempts → questions → subtopics → topics → subjects
       -- q.topic (a plain text column) is NOT used; t.id/t.name are the authoritative source.
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         s.name AS subject_name,
         COUNT(*)::INTEGER AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       JOIN subjects   s  ON s.id  = t.subject_id
       WHERE pa.student_id = :userId
         AND pa.attempted_at > NOW() - INTERVAL '30 days'
       GROUP BY t.id, t.name, s.name
       HAVING COUNT(*) >= 2
       ORDER BY accuracy_pct ASC
       LIMIT :limit`,
      { userId: req.user.id, limit }
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
    const rows = await safeQuery(
      `SELECT
         DATE(pa.attempted_at) AS date,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score
       FROM practice_attempts pa
       WHERE pa.student_id = :userId
         AND pa.attempted_at > NOW() - (:days * INTERVAL '1 day')
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date ASC`,
      { userId: req.user.id, days }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/subject-breakdown ─────────────────────────────────────
router.get('/subject-breakdown', protect, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT
         s.id AS subject_id,
         s.name AS subject_name,
         COUNT(pa.id)::INTEGER AS attempts,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
         ROUND(AVG(pa.time_taken_seconds), 1) AS avg_time_seconds
       FROM subjects s
       -- anchor on enrolled subjects (via courses)
       INNER JOIN courses     c  ON c.subject_id  = s.id
       INNER JOIN enrollments e  ON e.course_id   = c.id
                                AND e.student_id  = :userId
                                AND e.status      = 'active'
       LEFT JOIN topics     t  ON t.subject_id  = s.id
       LEFT JOIN subtopics  st ON st.topic_id   = t.id
       LEFT JOIN questions  q  ON q.subtopic_id = st.id
       LEFT JOIN practice_attempts pa ON pa.question_id = q.id
                                     AND pa.student_id  = :userId
       GROUP BY s.id, s.name
       ORDER BY attempts DESC NULLS LAST, s.name ASC`,
      { userId: req.user.id }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // Fall back to attempts-only query if schema differs
    try {
      const rows = await safeQuery(
        `SELECT
           s.id AS subject_id,
           s.name AS subject_name,
           COUNT(pa.id)::INTEGER AS attempts,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
           ROUND(AVG(pa.time_taken_seconds), 1) AS avg_time_seconds
         FROM practice_attempts pa
         JOIN questions  q  ON q.id  = pa.question_id
         JOIN subtopics  st ON st.id = q.subtopic_id
         JOIN topics     t  ON t.id  = st.topic_id
         JOIN subjects   s  ON s.id  = t.subject_id
         WHERE pa.student_id = :userId
         GROUP BY s.id, s.name
         ORDER BY accuracy_pct DESC`,
        { userId: req.user.id }
      );
      return res.json({ success: true, data: rows });
    } catch (err2) {
      return res.status(500).json({ success: false, error: err2.message });
    }
  }
});

// ── GET /api/analytics/time-metrics ──────────────────────────────────────────
router.get('/time-metrics', protect, async (req, res) => {
  try {
    const rows = await safeQuery(
      `WITH subject_bench AS (
         SELECT t2.subject_id, AVG(pa2.time_taken_seconds) AS benchmark_seconds
         FROM practice_attempts pa2
         JOIN questions  q2 ON q2.id  = pa2.question_id
         JOIN subtopics  s2 ON s2.id  = q2.subtopic_id
         JOIN topics     t2 ON t2.id  = s2.topic_id
         GROUP BY t2.subject_id
       )
       SELECT
         s.name AS subject_name,
         ROUND(AVG(pa.time_taken_seconds), 1) AS avg_time_seconds,
         ROUND(sb.benchmark_seconds::NUMERIC, 1) AS benchmark_time_seconds
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       JOIN subjects   s  ON s.id  = t.subject_id
       JOIN subject_bench sb ON sb.subject_id = t.subject_id
       WHERE pa.student_id = :userId
       GROUP BY s.name, sb.benchmark_seconds
       ORDER BY s.name`,
      { userId: req.user.id }
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
    const subjectClause = subject_id
      ? 'AND t.subject_id = :subject_id'
      : '';
    const replacements = { userId: req.user.id };
    if (subject_id) replacements.subject_id = subject_id;

    const rows = await safeQuery(
      `SELECT
         SUBSTRING(u.first_name, 1, 3) || '***' AS display_name,
         (u.id = :userId)::BOOLEAN AS is_me,
         COALESCE(u.xp_points, 0) AS xp_points,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
         COUNT(pa.id)::INTEGER AS attempts
       FROM users u
       JOIN practice_attempts pa ON pa.student_id = u.id
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       WHERE pa.attempted_at > NOW() - INTERVAL '7 days'
         ${subjectClause}
       GROUP BY u.id, u.first_name, u.xp_points
       ORDER BY xp_points DESC, accuracy_pct DESC
       LIMIT 10`,
      replacements
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/badges ─────────────────────────────────────────────────
router.get('/badges', protect, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT badge_code, earned_at FROM user_badges
       WHERE user_id = :userId ORDER BY earned_at ASC`,
      { userId: req.user.id }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] }); // table may not exist
  }
});

// ── GET /api/analytics/daily-study ───────────────────────────────────────────
router.get('/daily-study', protect, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT DISTINCT DATE(attempted_at) AS study_date
       FROM practice_attempts
       WHERE student_id = :userId
         AND attempted_at >= NOW() - INTERVAL '60 days'
       ORDER BY study_date ASC`,
      { userId: req.user.id }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/cohort-gaps ───────────────────────────────────────────
// MUST stay before /cohort/:subjectId/topics to avoid Express matching 'gaps' as :subjectId
router.get('/cohort-gaps', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  }
  const { subject_id } = req.query;
  try {
    const rows = await safeQuery(
      `-- topic name comes from the join chain:
       --   practice_attempts → questions → subtopics → topics
       -- Aliased as "topic" to preserve the existing response shape consumed by the
       -- frontend (r.topic in the .map() below remains valid).
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
         COUNT(DISTINCT pa.student_id)::INTEGER AS student_count
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       WHERE true
         ${subject_id ? 'AND t.subject_id = :subject_id' : ''}
       GROUP BY t.id, t.name
       HAVING COUNT(*) >= 3
       ORDER BY avg_accuracy ASC
       LIMIT 15`,
      subject_id ? { subject_id } : {}
    );
    const gaps = rows.map(r => ({
      topic:          r.topic,
      avg_accuracy:   Math.round(r.avg_accuracy),
      student_count:  r.student_count,
      recommendation: r.avg_accuracy < 40
        ? `Critical gap — re-teach ${r.topic} from first principles.`
        : r.avg_accuracy < 60
        ? `Moderate gap in ${r.topic} — targeted revision recommended.`
        : `Minor weakness in ${r.topic} — a quick recap may help.`,
    }));
    return res.json({ success: true, data: { gaps } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/student/:studentId/topics ─────────────────────────────
router.get('/student/:studentId/topics', protect, async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role === 'student' && String(req.user.id) !== String(studentId)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { subject_id } = req.query;
  try {
    const rows = await safeQuery(
      `-- topic name + id come from the join chain:
       --   practice_attempts → questions → subtopics → topics → subjects
       -- Aliased as "topic" so the frontend response shape is unchanged.
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         s.name AS subject_name,
         COUNT(pa.id)::INTEGER AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
         ROUND(AVG(pa.time_taken_seconds), 1) AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       JOIN subjects   s  ON s.id  = t.subject_id
       WHERE pa.student_id = :studentId
         ${subject_id ? 'AND t.subject_id = :subject_id' : ''}
       GROUP BY t.id, t.name, s.name
       ORDER BY accuracy_pct ASC`,
      { studentId, ...(subject_id ? { subject_id } : {}) }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/student/:studentId/summary ────────────────────────────
router.get('/student/:studentId/summary', protect, async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role === 'student' && String(req.user.id) !== String(studentId)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  try {
    const [userRows, attemptRows, progressRows] = await Promise.all([
      safeQuery(
        `SELECT COALESCE(xp_points,0) AS xp_points, COALESCE(study_streak_days,0) AS study_streak_days
         FROM users WHERE id = :studentId`,
        { studentId }, [{}]
      ),
      safeQuery(
        `SELECT
           COUNT(*)::INTEGER AS total_attempts,
           COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END))::INTEGER,0) AS accuracy_pct,
           COALESCE(SUM(time_taken_seconds),0)::BIGINT AS total_time_seconds
         FROM practice_attempts WHERE student_id = :studentId`,
        { studentId }, [{}]
      ),
      safeQuery(
        `SELECT COUNT(*) FILTER (WHERE quiz_completed)::INTEGER AS quizzes_completed
         FROM subtopic_progress WHERE student_id = :studentId`,
        { studentId }, [{}]
      ),
    ]);
    const u = userRows[0] || {};
    const a = attemptRows[0] || {};
    const p = progressRows[0] || {};
    const totalSecs = parseInt(a.total_time_seconds) || 0;
    return res.json({ success: true, data: {
      total_attempts:     a.total_attempts    || 0,
      accuracy_pct:       a.accuracy_pct      || 0,
      study_streak_days:  u.study_streak_days || 0,
      xp_points:          u.xp_points         || 0,
      quizzes_completed:  p.quizzes_completed || 0,
      time_spent_minutes: Math.floor(totalSecs / 60),
      time_spent_seconds: totalSecs % 60,
    }});
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/cohort/:subjectId/topics ──────────────────────────────
router.get('/cohort/:subjectId/topics', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { subjectId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  try {
    const rows = await safeQuery(
      `-- topic name + id come from the join chain:
       --   practice_attempts → questions → subtopics → topics
       -- topics is filtered by subject via t.subject_id = :subjectId.
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         COUNT(DISTINCT pa.student_id)::INTEGER AS student_count,
         COUNT(pa.id)::INTEGER AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
         ROUND(AVG(pa.time_taken_seconds), 1) AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       WHERE t.subject_id = :subjectId
       GROUP BY t.id, t.name
       HAVING COUNT(*) >= 3
       ORDER BY avg_accuracy ASC
       LIMIT :limit`,
      { subjectId, limit }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
