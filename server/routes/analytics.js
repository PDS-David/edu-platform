// server/routes/analytics.js
// ─────────────────────────────────────────────────────────────────────────────
// Existing endpoints (unchanged):
//   GET /api/analytics/student/:id        — full student analytics profile
//   GET /api/analytics/learning-gaps/:id  — student learning gaps (paginated)
//   GET /api/analytics/daily-study/:id    — last 7 days study time
//   GET /api/analytics/weekly-accuracy/:id — last 7 weeks accuracy
//
// NEW endpoints added for Wave 1B (AI Buddy dashboard features):
//   GET /api/analytics/student/:studentId/topics    — per-topic performance
//   GET /api/analytics/student/:studentId/summary   — overall stats for dashboard
//   GET /api/analytics/cohort/:subjectId/topics     — class-wide topic averages (teacher)
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return UUID_REGEX.test(value);
}

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/student/:id  (existing — unchanged)
// ─────────────────────────────────────────────────────────────
router.get('/student/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid student ID. Must be a valid UUID.',
    });
  }

  try {
    const users = await sequelize.query(
      `SELECT id, first_name, last_name, email, role FROM users WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const student = users[0];

    const overall = await sequelize.query(
      `SELECT
        COUNT(*)::INTEGER                                     AS total_records,
        COALESCE(SUM(total_questions_attempted), 0)::INTEGER  AS total_questions_attempted,
        COALESCE(SUM(correct_answers), 0)::INTEGER            AS total_correct_answers,
        COALESCE(SUM(wrong_answers), 0)::INTEGER              AS total_wrong_answers,
        COALESCE(ROUND(AVG(accuracy_percentage), 2), 0)       AS avg_accuracy_percentage,
        COALESCE(SUM(total_study_time_seconds), 0)::INTEGER   AS total_study_time_seconds,
        COALESCE(MAX(current_streak_days), 0)::INTEGER        AS current_streak_days,
        COALESCE(MAX(longest_streak_days), 0)::INTEGER        AS longest_streak_days,
        COALESCE(SUM(topics_started), 0)::INTEGER             AS total_topics_started,
        COALESCE(SUM(topics_completed), 0)::INTEGER           AS total_topics_completed,
        COALESCE(SUM(topics_mastered), 0)::INTEGER            AS total_topics_mastered,
        COALESCE(ROUND(AVG(completion_percentage), 2), 0)     AS avg_completion_percentage,
        COALESCE(SUM(total_login_days), 0)::INTEGER           AS total_login_days,
        MAX(last_activity_date)                               AS last_activity_date
       FROM student_analytics
       WHERE student_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    const subjects = await sequelize.query(
      `SELECT
        sa.id, sa.subject_id,
        s.name AS subject_name, s.icon_emoji AS subject_icon, s.color AS subject_color,
        eb.code AS exam_board_code, eb.name AS exam_board_name,
        sa.total_questions_attempted, sa.correct_answers, sa.wrong_answers,
        sa.accuracy_percentage, sa.total_study_time_seconds, sa.average_time_per_question,
        sa.topics_started, sa.topics_completed, sa.topics_mastered,
        sa.completion_percentage, sa.class_average_score,
        sa.percentile_rank, sa.rank_in_class, sa.last_activity_date, sa.updated_at
       FROM student_analytics sa
       LEFT JOIN subjects    s  ON sa.subject_id    = s.id
       LEFT JOIN exam_boards eb ON sa.exam_board_id = eb.id
       WHERE sa.student_id = :id
       ORDER BY sa.accuracy_percentage DESC NULLS LAST`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    const quizRows = await sequelize.query(
      `SELECT
        COUNT(*)::INTEGER AS total_attempts,
        COALESCE(ROUND(AVG(score), 2), 0) AS average_score,
        COALESCE(MAX(score), 0) AS highest_score,
        COALESCE(MIN(score) FILTER (WHERE status = 'completed'), 0) AS lowest_completed_score,
        COUNT(*) FILTER (WHERE status = 'completed' AND percentage >= 50)::INTEGER AS total_passed,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS total_completed,
        COUNT(*) FILTER (WHERE status = 'abandoned')::INTEGER AS total_abandoned
       FROM quiz_attempts WHERE student_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    const enrollmentRows = await sequelize.query(
      `SELECT
        COUNT(DISTINCT course_id)::INTEGER AS total_enrolled,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS courses_completed,
        COUNT(*) FILTER (WHERE status = 'in_progress')::INTEGER AS courses_in_progress
       FROM enrollments WHERE student_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    const gapSummary = await sequelize.query(
      `SELECT gap_severity, COUNT(*)::INTEGER AS count
       FROM learning_gaps
       WHERE student_id = :id AND is_resolved = false
       GROUP BY gap_severity
       ORDER BY CASE gap_severity
         WHEN 'critical' THEN 1 WHEN 'high' THEN 2
         WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    const o = overall[0];
    const q = quizRows[0];
    const e = enrollmentRows[0];

    return res.status(200).json({
      success: true,
      data: {
        student: { id: student.id, first_name: student.first_name, last_name: student.last_name, email: student.email, role: student.role },
        overall: {
          total_questions_attempted: o.total_questions_attempted,
          total_correct_answers: o.total_correct_answers,
          total_wrong_answers: o.total_wrong_answers,
          avg_accuracy_percentage: parseFloat(o.avg_accuracy_percentage),
          total_study_time_seconds: o.total_study_time_seconds,
          total_study_hours: Math.round(o.total_study_time_seconds / 3600),
          current_streak_days: o.current_streak_days,
          longest_streak_days: o.longest_streak_days,
          total_topics_started: o.total_topics_started,
          total_topics_completed: o.total_topics_completed,
          total_topics_mastered: o.total_topics_mastered,
          avg_completion_percentage: parseFloat(o.avg_completion_percentage),
          total_login_days: o.total_login_days,
          last_activity_date: o.last_activity_date,
        },
        subjects: subjects.map(row => ({
          ...row,
          accuracy_percentage: parseFloat(row.accuracy_percentage),
          completion_percentage: parseFloat(row.completion_percentage),
          class_average_score: row.class_average_score ? parseFloat(row.class_average_score) : null,
        })),
        quizzes: {
          total_attempts: q.total_attempts,
          total_completed: q.total_completed,
          total_abandoned: q.total_abandoned,
          total_passed: q.total_passed,
          average_score: parseFloat(q.average_score),
          highest_score: parseFloat(q.highest_score),
          lowest_completed_score: parseFloat(q.lowest_completed_score),
        },
        enrollments: {
          total_enrolled: e.total_enrolled,
          courses_completed: e.courses_completed,
          courses_in_progress: e.courses_in_progress,
        },
        learning_gaps: gapSummary,
      },
    });
  } catch (error) {
    console.error(`[GET /api/analytics/student/${req.params.id}] Error:`, error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/learning-gaps/:id  (existing — unchanged)
// ─────────────────────────────────────────────────────────────
router.get('/learning-gaps/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid student ID.' });
  }

  const safeLimit  = Math.min(parseInt(req.query.limit  || '20', 10), 100);
  const safeOffset = Math.max(parseInt(req.query.offset || '0',  10), 0);
  const { severity, subject_id, resolved } = req.query;

  try {
    const filters = [];
    const replacements = { id, limit: safeLimit, offset: safeOffset };

    filters.push('lg.student_id = :id');
    if (severity)   { filters.push('lg.gap_severity = :severity');   replacements.severity = severity; }
    if (subject_id) { filters.push('lg.subject_id   = :subject_id'); replacements.subject_id = subject_id; }
    if (resolved !== undefined) {
      filters.push('lg.is_resolved = :resolved');
      replacements.resolved = resolved === 'true';
    } else {
      filters.push('lg.is_resolved = false');
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const orderBy = req.query.sort === 'severity'
      ? `CASE lg.gap_severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END`
      : 'lg.identified_at DESC';

    const countRows = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS total FROM learning_gaps lg ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );

    const gaps = await sequelize.query(
      `SELECT lg.*, s.name AS subject_name
       FROM learning_gaps lg
       LEFT JOIN subjects s ON lg.subject_id = s.id
       ${where} ORDER BY ${orderBy} LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true, student_id: id,
      total: countRows[0].total, limit: safeLimit, offset: safeOffset,
      has_more: safeOffset + safeLimit < countRows[0].total,
      data: gaps,
    });
  } catch (error) {
    console.error(`[GET /analytics/learning-gaps/${id}] Error:`, error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch learning gaps' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/daily-study/:id  (existing — unchanged)
// ─────────────────────────────────────────────────────────────
router.get('/daily-study/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid student ID.' });

  try {
    const userCheck = await sequelize.query(
      `SELECT id FROM users WHERE id = :id`, { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (userCheck.length === 0) return res.status(404).json({ success: false, error: 'Student not found' });

    const rows = await sequelize.query(
      `SELECT DATE(attempted_at) AS study_date,
              COALESCE(SUM(time_taken_ms) / 1000, 0)::INTEGER AS study_seconds
       FROM practice_attempts
       WHERE student_id = :id AND attempted_at >= NOW() - INTERVAL '6 days'
       GROUP BY DATE(attempted_at) ORDER BY study_date ASC`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr  = d.toISOString().split('T')[0];
      const dayLabel = DAY_NAMES[d.getDay()];
      const found    = rows.find(r => String(r.study_date).split('T')[0] === dateStr);
      result.push({ day: dayLabel, date: dateStr, study_seconds: found ? found.study_seconds : 0, hours: parseFloat(((found ? found.study_seconds : 0) / 3600).toFixed(2)) });
    }

    return res.status(200).json({ success: true, student_id: id, period: 'last_7_days', data: result });
  } catch (error) {
    console.error(`[GET /analytics/daily-study/${id}] Error:`, error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch daily study data' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/weekly-accuracy/:id  (existing — unchanged)
// ─────────────────────────────────────────────────────────────
router.get('/weekly-accuracy/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid student ID.' });

  try {
    const userCheck = await sequelize.query(
      `SELECT id FROM users WHERE id = :id`, { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (userCheck.length === 0) return res.status(404).json({ success: false, error: 'Student not found' });

    const rows = await sequelize.query(
      `SELECT DATE_TRUNC('week', attempted_at)::DATE AS week_start,
              COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END)::NUMERIC, 2), 0) AS avg_accuracy
       FROM practice_attempts
       WHERE student_id = :id
         AND attempted_at >= NOW() - INTERVAL '48 days'
       GROUP BY DATE_TRUNC('week', attempted_at) ORDER BY week_start ASC`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      const dayOfWeek = d.getDay();
      const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
      const monday = new Date(d);
      monday.setDate(d.getDate() + diffToMonday - i * 7);
      const weekStart = monday.toISOString().split('T')[0];
      const label = i === 0 ? 'This Wk' : `Wk ${7 - i}`;
      const found = rows.find(r => String(r.week_start).split('T')[0] === weekStart);
      result.push({ week: label, week_start: weekStart, accuracy: found ? parseFloat(found.avg_accuracy) : null });
    }

    return res.status(200).json({ success: true, student_id: id, period: 'last_7_weeks', data: result });
  } catch (error) {
    console.error(`[GET /analytics/weekly-accuracy/${id}] Error:`, error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch weekly accuracy data' });
  }
});

// =============================================================================
// NEW ENDPOINTS — Wave 1B (AI Buddy dashboard features)
// =============================================================================

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/student/:studentId/topics
// Per-topic performance for a student filtered by subject.
// Used by: My Performance tab (Strength/Weakness tables)
//          Grade prediction card
// Query params: subject_id (required)
// ─────────────────────────────────────────────────────────────
router.get('/student/:studentId/topics', protect, async (req, res) => {
  const { studentId } = req.params;
  const { subject_id } = req.query;

  if (!isValidUUID(studentId)) {
    return res.status(400).json({ success: false, error: 'Invalid studentId' });
  }

  // Students can only access their own data
  if (req.user.role === 'student' && req.user.id !== studentId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  if (!subject_id || !isValidUUID(subject_id)) {
    return res.status(400).json({ success: false, error: 'subject_id query param is required and must be a UUID' });
  }

  try {
    const topics = await sequelize.query(
      `SELECT
         q.topic                                                        AS name,
         COUNT(*)::INTEGER                                              AS attempts,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END)::NUMERIC, 2) AS correct_pct,
         ROUND(AVG(pa.time_taken_ms)::NUMERIC, 0)::INTEGER             AS avg_time_ms,
         COUNT(*) FILTER (WHERE pa.is_correct)::INTEGER                AS correct_count,
         COUNT(*) FILTER (WHERE NOT pa.is_correct)::INTEGER            AS wrong_count,
         MAX(pa.attempted_at)                                          AS last_attempted
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE pa.student_id  = :studentId
         AND q.subject_id_uuid = :subjectId
         AND q.topic IS NOT NULL
       GROUP BY q.topic
       ORDER BY correct_pct ASC`,
      { replacements: { studentId, subjectId: subject_id }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      student_id: studentId,
      subject_id,
      count: topics.length,
      data: topics.map(t => ({
        ...t,
        correct_pct: parseFloat(t.correct_pct) || 0,
      })),
    });
  } catch (error) {
    console.error(`[GET /analytics/student/${studentId}/topics] Error:`, error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch topic analytics' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/student/:studentId/summary
// Overall stats used by My Performance dashboard card
// and the predicted grade feature.
// ─────────────────────────────────────────────────────────────
router.get('/student/:studentId/summary', protect, async (req, res) => {
  const { studentId } = req.params;

  if (!isValidUUID(studentId)) {
    return res.status(400).json({ success: false, error: 'Invalid studentId' });
  }

  if (req.user.role === 'student' && req.user.id !== studentId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    // Overall practice attempts stats
    const practiceStats = await sequelize.query(
      `SELECT
         COUNT(*)::INTEGER                                                   AS total_attempts,
         COUNT(DISTINCT q.subject_id_uuid)::INTEGER                         AS subjects_practiced,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END)::NUMERIC, 2) AS overall_correct_pct,
         ROUND(AVG(pa.time_taken_ms)::NUMERIC, 0)::INTEGER                  AS avg_time_ms,
         COUNT(DISTINCT DATE(pa.attempted_at))::INTEGER                     AS active_days,
         MAX(pa.attempted_at)                                               AS last_active
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE pa.student_id = :studentId`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    // Time spent from practice attempts (sum of time_taken_ms)
    const timeStats = await sequelize.query(
      `SELECT
         COALESCE(SUM(time_taken_ms), 0)::BIGINT AS total_time_ms
       FROM practice_attempts
       WHERE student_id = :studentId`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    // Subtopic completion counts
    const progressStats = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE resources_completed)::INTEGER AS resources_done,
         COUNT(*) FILTER (WHERE practice_completed)::INTEGER  AS practice_done,
         COUNT(*) FILTER (WHERE quiz_completed)::INTEGER      AS quizzes_done,
         COUNT(*)::INTEGER                                    AS total_subtopics_started
       FROM subtopic_progress
       WHERE student_id = :studentId`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    const p = practiceStats[0];
    const t = timeStats[0];
    const s = progressStats[0];

    const totalMs   = parseInt(t.total_time_ms) || 0;
    const totalMins = Math.floor(totalMs / 60000);
    const totalSecs = Math.floor((totalMs % 60000) / 1000);

    return res.status(200).json({
      success: true,
      data: {
        total_attempts:       p.total_attempts,
        subjects_practiced:   p.subjects_practiced,
        overall_correct_pct:  parseFloat(p.overall_correct_pct) || 0,
        avg_time_ms:          p.avg_time_ms,
        active_days:          p.active_days,
        last_active:          p.last_active,
        time_spent_minutes:   totalMins,
        time_spent_seconds:   totalSecs,
        time_spent_display:   `${totalMins} min ${totalSecs} sec`,
        subtopics_started:    s.total_subtopics_started,
        resources_completed:  s.resources_done,
        practice_completed:   s.practice_done,
        quizzes_completed:    s.quizzes_done,
      },
    });
  } catch (error) {
    console.error(`[GET /analytics/student/${studentId}/summary] Error:`, error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch summary analytics' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/cohort/:subjectId/topics
// Class-wide topic averages — teacher and admin only.
// Used by: Teacher cohort dashboard heatmap.
// ─────────────────────────────────────────────────────────────
router.get('/cohort/:subjectId/topics', protect, authorize('teacher', 'admin'), async (req, res) => {
  const { subjectId } = req.params;

  if (!isValidUUID(subjectId)) {
    return res.status(400).json({ success: false, error: 'Invalid subjectId' });
  }

  try {
    const topics = await sequelize.query(
      `SELECT
         q.topic                                                           AS name,
         COUNT(DISTINCT pa.student_id)::INTEGER                           AS student_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END)::NUMERIC, 2) AS avg_correct_pct,
         ROUND(AVG(pa.time_taken_ms)::NUMERIC, 0)::INTEGER                AS avg_time_ms,
         COUNT(DISTINCT pa.student_id) FILTER (
           WHERE pa.student_id IN (
             SELECT pa2.student_id FROM practice_attempts pa2
             JOIN questions q2 ON pa2.question_id = q2.id
             WHERE q2.subject_id_uuid = :subjectId AND q2.topic = q.topic
             GROUP BY pa2.student_id
             HAVING AVG(CASE WHEN pa2.is_correct THEN 100.0 ELSE 0.0 END) < 60
           )
         )::INTEGER                                                       AS students_below_60
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE q.subject_id_uuid = :subjectId
         AND q.topic IS NOT NULL
       GROUP BY q.topic
       HAVING COUNT(*) >= 3
       ORDER BY avg_correct_pct ASC`,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    const studentCount = await sequelize.query(
      `SELECT COUNT(DISTINCT pa.student_id)::INTEGER AS count
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE q.subject_id_uuid = :subjectId`,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      subject_id:    subjectId,
      student_count: studentCount[0].count,
      count:         topics.length,
      data:          topics.map(t => ({
        ...t,
        avg_correct_pct: parseFloat(t.avg_correct_pct) || 0,
      })),
    });
  } catch (error) {
    console.error(`[GET /analytics/cohort/${subjectId}/topics] Error:`, error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch cohort analytics' });
  }
});

module.exports = router;
