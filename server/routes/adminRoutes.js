'use strict';
// server/routes/adminRoutes.js

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect }  = require('../middleware/auth');
const { generate } = require('../services/ai');
const { success, error } = require('../utils/response');

// ─────────────────────────────────────────────
// ADMIN GUARD
// ─────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return error(res, 'Admin access required', 403);
  }
  next();
};

// ─────────────────────────────────────────────
// GET /api/admin/platform-stats
// Powers PlatformAnalyticsPanel in AdminDashboard.
// Returns: { users, questions, revenue, top_subjects, daily_activity }
// ─────────────────────────────────────────────
router.get('/platform-stats', protect, adminOnly, async (req, res) => {
  try {
    // User stats
    const [userRow] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE role = 'student')                                              AS students,
        COUNT(*) FILTER (WHERE role = 'student'
                           AND last_login >= NOW() - INTERVAL '1 day')                        AS active_today,
        COUNT(*) FILTER (WHERE role = 'student'
                           AND created_at >= NOW() - INTERVAL '7 days')                       AS new_this_week
      FROM users
    `, { type: QueryTypes.SELECT });

    // Question / attempt stats — use student_answers (has is_correct) joined to quiz_attempts
    const [qRow] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE qa.created_at >= NOW() - INTERVAL '1 day')                    AS answered_today,
        COUNT(*) FILTER (WHERE qa.created_at >= NOW() - INTERVAL '7 days')                   AS answered_this_week,
        (SELECT COUNT(*) FROM questions
          WHERE COALESCE(is_ai_generated, false) = true
            AND COALESCE(status, 'pending') NOT IN ('approved','active'))::INTEGER            AS total_pending
      FROM quiz_attempts qa
    `, { type: QueryTypes.SELECT });

    // Revenue / subscription stats
    const [revRow] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE subscription_status = 'active')                               AS total_active_subs,
        COUNT(*) FILTER (WHERE subscription_status = 'active'
                           AND created_at >= NOW() - INTERVAL '30 days')                     AS new_subs_this_month
      FROM users
    `, { type: QueryTypes.SELECT });

    // Top subjects by avg accuracy (last 30 days)
    // student_answers.is_correct joined via quiz_attempts → questions → subtopics → topics → subjects
    const topSubjects = await sequelize.query(`
      SELECT
        s.name,
        ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 1) AS avg_accuracy
      FROM student_answers sa
      JOIN quiz_attempts   qa ON qa.id = sa.attempt_id
      JOIN questions        q ON q.id  = sa.question_id
      LEFT JOIN subtopics  st ON st.id = q.subtopic_id
      LEFT JOIN topics      t ON t.id  = st.topic_id
      LEFT JOIN subjects    s ON s.id  = t.subject_id
      WHERE qa.created_at >= NOW() - INTERVAL '30 days'
        AND s.name IS NOT NULL
      GROUP BY s.name
      ORDER BY avg_accuracy DESC
      LIMIT 5
    `, { type: QueryTypes.SELECT });

    // Daily activity — quiz attempt count per day for last 14 days
    const dailyActivity = await sequelize.query(`
      SELECT
        TO_CHAR(created_at::DATE, 'YYYY-MM-DD') AS date,
        COUNT(*)::INTEGER                        AS attempt_count
      FROM quiz_attempts
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY created_at::DATE
      ORDER BY created_at::DATE ASC
    `, { type: QueryTypes.SELECT });

    return res.json({
      success: true,
      data: {
        users: {
          students:      parseInt(userRow.students)      || 0,
          active_today:  parseInt(userRow.active_today)  || 0,
          new_this_week: parseInt(userRow.new_this_week) || 0,
        },
        questions: {
          answered_today:      parseInt(qRow.answered_today)      || 0,
          answered_this_week:  parseInt(qRow.answered_this_week)  || 0,
          total_pending:       parseInt(qRow.total_pending)        || 0,
        },
        revenue: {
          total_active_subs:    parseInt(revRow.total_active_subs)    || 0,
          new_subs_this_month:  parseInt(revRow.new_subs_this_month)  || 0,
        },
        top_subjects:   topSubjects,
        daily_activity: dailyActivity,
      },
    });
  } catch (err) {
    console.error('[GET /admin/platform-stats]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/subjects
// Flat list for the AI question generator subject dropdown.
// ─────────────────────────────────────────────
router.get('/subjects', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, name FROM subjects WHERE COALESCE(is_active, true) = true ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /admin/subjects]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/questions/pending-count
// Badge count for AI-generated questions awaiting review.
// ─────────────────────────────────────────────
router.get('/questions/pending-count', protect, adminOnly, async (req, res) => {
  try {
    const [row] = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM questions
       WHERE COALESCE(is_ai_generated, false) = true
         AND COALESCE(status, 'pending') NOT IN ('approved', 'active')`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: row.count || 0 });
  } catch (err) {
    console.error('[GET /admin/questions/pending-count]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// QUESTION REVIEW ROUTES
// ─────────────────────────────────────────────

// GET /api/admin/questions/pending  — list questions awaiting review
router.get('/questions/pending', protect, adminOnly, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '10', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);

    const rows = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.options, q.correct_answer,
         q.difficulty, q.explanation, q.status, q.is_ai_generated,
         q.created_at,
         u.first_name, u.last_name, u.email AS submitted_by_email,
         s.name AS subject_name, st.name AS subtopic_name
       FROM questions q
       LEFT JOIN users      u  ON q.submitted_by  = u.id
       LEFT JOIN subtopics  st ON q.subtopic_id   = st.id
       LEFT JOIN subjects   s  ON st.subject_id   = s.id
       WHERE COALESCE(q.status, 'pending') NOT IN ('approved', 'active', 'rejected')
          OR (q.is_ai_generated = true AND COALESCE(q.status, 'pending') NOT IN ('approved', 'active', 'rejected'))
       ORDER BY q.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { limit, offset }, type: QueryTypes.SELECT }
    );

    const [countRow] = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM questions
       WHERE COALESCE(status, 'pending') NOT IN ('approved', 'active', 'rejected')`,
      { type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: rows, total: countRow?.count || 0 });
  } catch (err) {
    console.error('[GET /admin/questions/pending]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/questions/:id/review  — approve or reject a question
router.put('/questions/:id/review', protect, adminOnly, async (req, res) => {
  try {
    const { action, feedback } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be "approve" or "reject"' });
    }
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await sequelize.query(
      `UPDATE questions
       SET status = :status,
           review_feedback = :feedback,
           reviewed_by = :reviewer,
           reviewed_at = NOW(),
           updated_at  = NOW()
       WHERE id = :id`,
      {
        replacements: {
          status:   newStatus,
          feedback: feedback?.trim() || null,
          reviewer: req.user.id,
          id:       req.params.id,
        },
        type: QueryTypes.UPDATE,
      }
    );

    return res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('[PUT /admin/questions/:id/review]', err.message);
    // Column might not exist yet — try without the optional columns
    try {
      const newStatus = req.body.action === 'approve' ? 'approved' : 'rejected';
      await sequelize.query(
        `UPDATE questions SET status = :status, updated_at = NOW() WHERE id = :id`,
        { replacements: { status: newStatus, id: req.params.id }, type: QueryTypes.UPDATE }
      );
      return res.json({ success: true, status: newStatus });
    } catch (err2) {
      return res.status(500).json({ success: false, error: err2.message });
    }
  }
});

// ─────────────────────────────────────────────
// POST /api/admin/send-weekly-digest
// Queues (or sends) a weekly activity digest email to all students.
// Stub implementation — replace body with real job queue when ready.
// ─────────────────────────────────────────────
router.post('/send-weekly-digest', protect, adminOnly, async (req, res) => {
  try {
    // TODO: enqueue a Bull job → send per-student summary emails
    // e.g. weeklyDigestQueue.add({ triggeredBy: req.user.id });
    console.log(`[admin] Weekly digest queued by admin ${req.user.id} at ${new Date().toISOString()}`);
    return res.json({ success: true, message: 'Weekly digest queued successfully' });
  } catch (err) {
    console.error('[POST /admin/send-weekly-digest]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// AI QUESTION GENERATION
// ─────────────────────────────────────────────
router.post('/generate-questions', protect, adminOnly, async (req, res) => {
  const { subject_id, topic, count = 10, difficulty = 'medium' } = req.body;

  if (!subject_id || !topic) {
    return error(res, 'subject_id and topic are required', 400);
  }

  try {
    const subjectRows = await sequelize.query(
      `SELECT name FROM subjects WHERE id = :id`,
      { replacements: { id: subject_id }, type: QueryTypes.SELECT }
    );

    if (!subjectRows.length) return error(res, 'Subject not found', 404);

    const prompt = `Generate ${count} ${difficulty} multiple-choice questions on the topic "${topic}" for the subject "${subjectRows[0].name}". Return ONLY a valid JSON array, no markdown. Each object must have: question_text (string), options (array of 4 strings), correct_answer (string matching one option), explanation (string).`;

    const raw     = await generate(prompt);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(cleaned);

    let inserted = 0;
    for (const q of questions) {
      if (!q.question_text) continue;
      await sequelize.query(
        `INSERT INTO questions
           (question_text, options, correct_answer, difficulty,
            is_ai_generated, status, created_at, updated_at)
         VALUES (:q, :o::jsonb, :c, :d, true, 'pending', NOW(), NOW())`,
        {
          replacements: {
            q: q.question_text,
            o: JSON.stringify(q.options || []),
            c: q.correct_answer,
            d: difficulty,
          },
          type: QueryTypes.INSERT,
        }
      );
      inserted++;
    }

    return success(res, { generated: questions.length, inserted, questions });
  } catch (err) {
    console.error('[admin.generate]', err.message);
    return error(res, 'AI generation failed: ' + err.message);
  }
});

// ─────────────────────────────────────────────
// TEACHER ASSIGNMENTS
// ─────────────────────────────────────────────
router.get('/teacher-assignments', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ts.id, u.email, u.first_name, u.last_name, s.name AS subject
       FROM teacher_subjects ts
       JOIN users    u ON u.id = ts.teacher_id
       JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.is_active = true
       ORDER BY u.email, s.name`,
      { type: QueryTypes.SELECT }
    );
    return success(res, rows);
  } catch (err) {
    console.error('[GET /admin/teacher-assignments]', err.message);
    return error(res, 'Failed to fetch assignments');
  }
});

router.post('/teacher-assignments', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id } = req.body;
  if (!teacher_id || !subject_id) return error(res, 'teacher_id and subject_id required', 400);

  try {
    await sequelize.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, is_active)
       VALUES (:t, :s, true)
       ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true`,
      { replacements: { t: teacher_id, s: subject_id }, type: QueryTypes.INSERT }
    );
    return success(res, { message: 'Assignment saved' });
  } catch (err) {
    console.error('[POST /admin/teacher-assignments]', err.message);
    return error(res, 'Failed to save assignment');
  }
});

router.delete('/teacher-assignments/:id', protect, adminOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active = false WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
    );
    return success(res, { message: 'Assignment removed' });
  } catch (err) {
    console.error('[DELETE /admin/teacher-assignments/:id]', err.message);
    return error(res, 'Failed to delete assignment');
  }
});

// ─────────────────────────────────────────────
// TEACHER-SUBJECTS ALIASES
// TeacherAssignmentPage calls /admin/teacher-subjects — alias to same handlers
// ─────────────────────────────────────────────
router.get('/teacher-subjects', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ts.id, u.email, u.first_name, u.last_name, s.name AS subject
       FROM teacher_subjects ts
       JOIN users    u ON u.id = ts.teacher_id
       JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.is_active = true
       ORDER BY u.email, s.name`,
      { type: QueryTypes.SELECT }
    );
    return success(res, rows);
  } catch (err) {
    console.error('[GET /admin/teacher-subjects]', err.message);
    return error(res, 'Failed to fetch assignments');
  }
});

router.post('/teacher-subjects', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id, exam_board_id } = req.body;
  if (!teacher_id || !subject_id) return error(res, 'teacher_id and subject_id required', 400);
  try {
    await sequelize.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, is_active)
       VALUES (:t, :s, true)
       ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true`,
      { replacements: { t: teacher_id, s: subject_id }, type: QueryTypes.INSERT }
    );
    return success(res, { message: 'Assignment saved' });
  } catch (err) {
    console.error('[POST /admin/teacher-subjects]', err.message);
    return error(res, 'Failed to save assignment');
  }
});

router.delete('/teacher-subjects/:id', protect, adminOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active = false WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
    );
    return success(res, { message: 'Assignment removed' });
  } catch (err) {
    console.error('[DELETE /admin/teacher-subjects/:id]', err.message);
    return error(res, 'Failed to delete assignment');
  }
});

module.exports = router;
