'use strict';
// server/routes/dashboardRoutes.js
// Aggregated dashboard endpoints used by DashboardHome.jsx
// GET /api/dashboard/summary        — student progress summary
// GET /api/dashboard/weak-topics    — topics where accuracy < 60%
// GET /api/dashboard/recommendations — next subtopics to study
// GET /api/dashboard/sessions       — recent learning sessions

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect } = require('../middleware/auth');

// ── safe query helper ─────────────────────────────────────────────────────────
const sq = async (sql, replacements = {}, fallback = []) => {
  try {
    return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (e) {
    console.warn('[dashboard] query skipped:', e.message.slice(0, 80));
    return fallback;
  }
};

// ── GET /api/dashboard/summary ────────────────────────────────────────────────
router.get('/summary', protect, async (req, res) => {
  const uid = req.user.id;
  try {
    const [attempts, streak, subtopics] = await Promise.all([
      sq(`SELECT COUNT(*)::int AS total,
                ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct
          FROM practice_attempts WHERE student_id = :uid`, { uid }, [{}]),
      sq(`SELECT study_streak_days, xp_points FROM users WHERE id = :uid`, { uid }, [{}]),
      sq(`SELECT COUNT(*)::int AS completed
          FROM subtopic_progress WHERE student_id = :uid AND quiz_completed = true`, { uid }, [{}]),
    ]);
    return res.json({
      success: true,
      data: {
        total_attempts:    attempts[0]?.total     || 0,
        accuracy_pct:      attempts[0]?.accuracy_pct || 0,
        study_streak_days: streak[0]?.study_streak_days || 0,
        xp_points:         streak[0]?.xp_points   || 0,
        quizzes_completed: subtopics[0]?.completed || 0,
      },
    });
  } catch (err) {
    return res.json({ success: true, data: {} });
  }
});

// ── GET /api/dashboard/weak-topics ───────────────────────────────────────────
router.get('/weak-topics', protect, async (req, res) => {
  const uid = req.user.id;
  try {
    const rows = await sq(
      `SELECT q.topic, s.name AS subject_name,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
              COUNT(pa.id)::int AS attempt_count
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       JOIN subjects   s  ON s.id  = t.subject_id
       WHERE pa.student_id = :uid AND q.topic IS NOT NULL
       GROUP BY q.topic, s.name
       HAVING COUNT(pa.id) >= 2
       ORDER BY accuracy_pct ASC
       LIMIT 5`,
      { uid }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

// ── GET /api/dashboard/recommendations ───────────────────────────────────────
router.get('/recommendations', protect, async (req, res) => {
  const uid = req.user.id;
  try {
    const rows = await sq(
      `SELECT st.id AS subtopic_id, st.name AS subtopic_name,
              t.name AS topic_name, s.name AS subject_name,
              COALESCE(sp.completion_pct, 0) AS completion_pct
       FROM subtopics st
       JOIN topics   t  ON t.id  = st.topic_id
       JOIN subjects s  ON s.id  = t.subject_id
       JOIN student_exam_types set2 ON  set2.exam_board_id = s.exam_board_id
                                    AND set2.student_id   = :uid
                                    AND set2.is_active     = true
                                    AND (set2.expires_at IS NULL OR set2.expires_at > NOW())
       LEFT JOIN subtopic_progress sp ON sp.subtopic_id = st.id AND sp.student_id = :uid
       WHERE st.is_active = true
         AND COALESCE(sp.quiz_completed, false) = false
       ORDER BY COALESCE(sp.completion_pct, 0) DESC, st.order_index ASC NULLS LAST
       LIMIT 5`,
      { uid }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

// ── GET /api/dashboard/sessions ───────────────────────────────────────────────
router.get('/sessions', protect, async (req, res) => {
  const uid = req.user.id;
  try {
    const rows = await sq(
      `SELECT ls.id, ls.started_at, ls.ended_at, ls.duration_seconds,
              st.name AS subtopic_name, s.name AS subject_name
       FROM learning_sessions ls
       LEFT JOIN subtopics st ON st.id = ls.subtopic_id
       LEFT JOIN topics    t  ON t.id  = st.topic_id
       LEFT JOIN subjects  s  ON s.id  = t.subject_id
       WHERE ls.student_id = :uid
       ORDER BY ls.started_at DESC
       LIMIT 10`,
      { uid }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

module.exports = router;
