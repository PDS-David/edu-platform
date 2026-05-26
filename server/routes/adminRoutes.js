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
    // User stats — role::text cast avoids enum comparison errors on some PG versions
    const [userRow] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE role::text = 'student')                                              AS students,
        COUNT(*) FILTER (WHERE role::text = 'student'
                           AND COALESCE(last_login, created_at) >= NOW() - INTERVAL '1 day')        AS active_today,
        COUNT(*) FILTER (WHERE role::text = 'student'
                           AND created_at >= NOW() - INTERVAL '7 days')                             AS new_this_week
      FROM users
    `, { type: QueryTypes.SELECT });

    // Question / attempt stats (quiz_attempts may be empty initially)
    let qRow = { answered_today: 0, answered_this_week: 0, total_pending: 0 };
    try {
      const [_qRow] = await sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE qa.created_at >= NOW() - INTERVAL '1 day')   AS answered_today,
          COUNT(*) FILTER (WHERE qa.created_at >= NOW() - INTERVAL '7 days')  AS answered_this_week,
          (SELECT COUNT(*) FROM questions
            WHERE COALESCE(is_ai_generated, false) = true
              AND COALESCE(status, 'pending') NOT IN ('approved','active'))::INTEGER AS total_pending
        FROM quiz_attempts qa
      `, { type: QueryTypes.SELECT });
      if (_qRow) qRow = _qRow;
    } catch (_) { /* quiz_attempts may not exist yet */ }

    // Revenue / subscription stats
    let revRow = { total_active_subs: 0, new_subs_this_month: 0 };
    try {
      const [_revRow] = await sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE subscription_status::text = 'active')                               AS total_active_subs,
          COUNT(*) FILTER (WHERE subscription_status::text = 'active'
                             AND created_at >= NOW() - INTERVAL '30 days')                           AS new_subs_this_month
        FROM users
      `, { type: QueryTypes.SELECT });
      if (_revRow) revRow = _revRow;
    } catch (_) { /* subscription_status column may not exist */ }

    // Top subjects by avg accuracy (last 30 days)
    // student_answers table may not yet exist — fall back to empty array safely
    let topSubjects = [];
    try {
      topSubjects = await sequelize.query(`
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
    } catch (_) { /* table may not exist yet */ }

    // Daily activity — quiz attempt count per day for last 14 days
    let dailyActivity = [];
    try {
      dailyActivity = await sequelize.query(`
        SELECT
          TO_CHAR(created_at::DATE, 'YYYY-MM-DD') AS date,
          COUNT(*)::INTEGER                        AS attempt_count
        FROM quiz_attempts
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY created_at::DATE
        ORDER BY created_at::DATE ASC
      `, { type: QueryTypes.SELECT });
    } catch (_) { /* quiz_attempts may not exist yet */ }

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
// POST /api/admin/send-notification
// Sends an in-app notification to all users, students only, or teachers only.
// Body: { target: 'all'|'students'|'teachers', title: string, message: string }
// ─────────────────────────────────────────────
router.post('/send-notification', protect, adminOnly, async (req, res) => {
  try {
    const { target = 'all', title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'title and message are required' });
    }

    const roleMap = { students: 'student', teachers: 'teacher' };
    const roleFilter = roleMap[target] ? ` AND role = '${roleMap[target]}'` : '';

    const users = await sequelize.query(
      `SELECT id FROM users WHERE is_active = true${roleFilter}`,
      { type: QueryTypes.SELECT }
    );

    if (users.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No matching users found' });
    }

    // Check if notifications table has updated_at column
    const cols = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND column_name='updated_at'`,
      { type: QueryTypes.SELECT }
    );
    const hasUpdatedAt = cols.length > 0;

    await Promise.all(users.map(u =>
      sequelize.query(
        hasUpdatedAt
          ? `INSERT INTO notifications (user_id, title, message, type, created_at, updated_at) VALUES (:uid, :title, :msg, 'info', NOW(), NOW())`
          : `INSERT INTO notifications (user_id, title, message, type, created_at) VALUES (:uid, :title, :msg, 'info', NOW())`,
        { replacements: { uid: u.id, title, msg: message }, type: QueryTypes.INSERT }
      )
    ));

    console.log(`[admin] Notification sent to ${users.length} users by admin ${req.user.id}`);
    return res.json({ success: true, sent: users.length });
  } catch (err) {
    console.error('[POST /admin/send-notification]', err.message);
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
// LIST TEACHERS (for modal dropdowns)
// Uses role::text cast to avoid enum-not-found errors
// ─────────────────────────────────────────────
router.get('/teachers', protect, adminOnly, async (req, res) => {
  try {
    // Cast role to text to handle both enum (enum_users_role) and varchar role columns.
    // Filter only our application users (first_name IS NOT NULL excludes Supabase auth rows).
    const rows = await sequelize.query(
      `SELECT id, email, first_name, last_name,
              COALESCE(is_active, true) AS is_active, created_at
       FROM users
       WHERE role::text = 'teacher'
         AND first_name IS NOT NULL
         AND COALESCE(is_active, true) = true
       ORDER BY last_name ASC, first_name ASC`,
      { type: QueryTypes.SELECT }
    );
    return success(res, rows);
  } catch (err) {
    console.error('[GET /admin/teachers]', err.message);
    return error(res, 'Failed to fetch teachers');
  }
});

// ─────────────────────────────────────────────
// TEACHER ASSIGNMENTS
// ─────────────────────────────────────────────
router.get('/teacher-assignments', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ts.id,
              u.id         AS teacher_id,
              u.email,
              u.first_name || ' ' || u.last_name AS teacher_name,
              u.first_name,
              u.last_name,
              s.id         AS subject_id,
              s.name       AS subject_name,
              eb.code      AS exam_board_code,
              eb.name      AS exam_board_name,
              ts.is_active,
              ts.assigned_at
       FROM teacher_subjects ts
       JOIN users       u  ON u.id  = ts.teacher_id
       JOIN subjects    s  ON s.id  = ts.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE ts.is_active = true
       ORDER BY u.last_name ASC, s.name ASC`,
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

// ── POST /api/admin/generate-topics ──────────────────────────────────────────
// Uses Gemini AI to generate curriculum-appropriate topics and subtopics for a
// given subject, then inserts them into the database.
// Body: { subject_id, subject_name, exam_board_code }
router.post('/generate-topics', protect, adminOnly, async (req, res) => {
  const { subject_id, subject_name, exam_board_code = 'WAEC' } = req.body;
  if (!subject_id || !subject_name) {
    return res.status(400).json({ success: false, error: 'subject_id and subject_name are required' });
  }

  // Check if topics already exist
  const existing = await sequelize.query(
    `SELECT COUNT(*)::int AS cnt FROM topics WHERE subject_id = :subjectId AND is_active = true`,
    { replacements: { subjectId: parseInt(subject_id) }, type: QueryTypes.SELECT }
  );
  if (existing[0]?.cnt > 0) {
    return res.json({ success: true, message: 'Topics already exist', already_exists: true });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ success: false, error: 'AI not configured — set GEMINI_API_KEY' });
  }

  try {
    const prompt = `You are a Nigerian secondary school curriculum expert.
Generate a structured list of topics and subtopics for ${exam_board_code} ${subject_name}.

Return ONLY valid JSON — no markdown, no preamble:
{
  "topics": [
    {
      "name": "Topic name",
      "subtopics": ["Subtopic 1", "Subtopic 2", "Subtopic 3"]
    }
  ]
}

Rules:
- Produce 8-12 topics, each with 3-6 subtopics
- Topics must match the official ${exam_board_code} ${subject_name} syllabus
- Names must be concise (3-7 words)
- Order topics from foundational to advanced`;

    const raw     = await generate(prompt, 'generate-questions');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    const topicsArr = parsed.topics || [];

    if (!topicsArr.length) {
      return res.status(500).json({ success: false, error: 'AI returned no topics' });
    }

    let created = 0;
    for (let i = 0; i < topicsArr.length; i++) {
      const t = topicsArr[i];
      const [topicRow] = await sequelize.query(
        `INSERT INTO topics (subject_id, name, order_index, is_active, created_at, updated_at)
         VALUES (:subjectId, :name, :order, true, NOW(), NOW())
         RETURNING id`,
        { replacements: { subjectId: parseInt(subject_id), name: t.name, order: i }, type: QueryTypes.SELECT }
      );
      const topicId = topicRow?.id;
      if (!topicId) continue;

      for (let j = 0; j < (t.subtopics || []).length; j++) {
        await sequelize.query(
          `INSERT INTO subtopics (topic_id, subject_id, name, order_index, is_active, created_at, updated_at)
           VALUES (:topicId, :subjectId, :name, :order, true, NOW(), NOW())`,
          { replacements: { topicId, subjectId: parseInt(subject_id), name: t.subtopics[j], order: j }, type: QueryTypes.INSERT }
        ).catch(() => {}); // ignore subtopic insert errors
      }
      created++;
    }

    return res.json({ success: true, message: `Generated ${created} topics with subtopics`, count: created });
  } catch (err) {
    console.error('[POST /admin/generate-topics]', err.message);
    return res.status(500).json({ success: false, error: 'Topic generation failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/health
// One-shot smoke check of the 15-step onboarding workflow.
//   ?full=1 → in addition to schema/seed checks, runs a live walkthrough
//             (creates throw-away exam type, subject, topic, subtopic,
//              question, resource and a synthetic student) to verify every
//              step end-to-end. Cleans up after itself.
// Always admin-only.
// ─────────────────────────────────────────────
router.get('/health', protect, adminOnly, async (req, res) => {
  const checks = [];
  const t0 = Date.now();
  const ok = (name, info = '') => checks.push({ name, ok: true, info });
  const ko = (name, info = '') => checks.push({ name, ok: false, info });

  // ── 1. DB connectivity ────────────────────────────────────────
  try {
    await sequelize.authenticate();
    ok('db.connect');
  } catch (e) {
    ko('db.connect', e.message);
    return res.status(503).json({ success: false, checks, duration_ms: Date.now() - t0 });
  }

  // ── 2. Required tables present ────────────────────────────────
  const requiredTables = [
    'users', 'exam_boards', 'subjects', 'teacher_subjects',
    'topics', 'subtopics', 'resources', 'questions',
    'student_subjects', 'student_exam_types',
    'subtopic_progress', 'practice_attempts', 'quiz_attempts',
  ];
  const present = new Set();
  for (const t of requiredTables) {
    const r = await sequelize.query(
      `SELECT to_regclass(:fq) IS NOT NULL AS exists`,
      { replacements: { fq: `public.${t}` }, type: QueryTypes.SELECT }
    );
    if (r[0]?.exists) { present.add(t); ok(`schema.table.${t}`); }
    else ko(`schema.table.${t}`, 'missing');
  }

  // ── 3. Critical columns we rely on ────────────────────────────
  const requiredColumns = [
    ['users',              'pending_exam_board_ids'],
    ['users',              'last_activity_date'],
    ['subtopic_progress',  'last_accessed'],
    ['practice_attempts',  'student_id'],
    ['student_exam_types', 'student_id'],
  ];
  for (const [table, column] of requiredColumns) {
    const r = await sequelize.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = :table AND column_name = :column`,
      { replacements: { table, column }, type: QueryTypes.SELECT }
    );
    if (!r.length) ko(`schema.column.${table}.${column}`, 'missing');
    else ok(`schema.column.${table}.${column}`, r[0].data_type);
  }

  // student_id columns above must be uuid (we rebuilt them)
  for (const t of ['practice_attempts', 'student_exam_types']) {
    const r = await sequelize.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = :t AND column_name = 'student_id'`,
      { replacements: { t }, type: QueryTypes.SELECT }
    );
    if (r[0]?.data_type === 'uuid') ok(`schema.${t}.student_id is uuid`);
    else ko(`schema.${t}.student_id is uuid`, `got ${r[0]?.data_type || 'missing'}`);
  }

  // ── 4. Seed data sanity ──────────────────────────────────────
  const counts = {};
  for (const tbl of ['exam_boards', 'subjects', 'questions']) {
    if (!present.has(tbl)) continue;
    const r = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM ${tbl}`, { type: QueryTypes.SELECT }
    );
    counts[tbl] = r[0].n;
    r[0].n > 0 ? ok(`seed.${tbl}`, `${r[0].n} rows`) : ko(`seed.${tbl}`, '0 rows');
  }

  // ── 5. Optional: live 15-step walkthrough (?full=1) ──────────
  let walkthrough = null;
  if (req.query.full === '1') {
    walkthrough = { steps: [], passed: 0, failed: 0 };
    const stamp = Date.now();
    const created = { boardId: null, subjectId: null, topicId: null,
                      subtopicId: null, questionId: null, studentId: null };
    const w = (name, okFlag, info = '') => {
      walkthrough.steps.push({ name, ok: okFlag, info });
      okFlag ? walkthrough.passed++ : walkthrough.failed++;
    };
    const adminId = req.user.id;
    try {
      // 1. exam type
      const [b] = await sequelize.query(
        `INSERT INTO exam_boards (name, code, country, is_active, created_at, updated_at)
         VALUES (:n, :c, 'Nigeria', true, NOW(), NOW()) RETURNING id`,
        { replacements: { n: `HEALTH-${stamp}`, c: `HC${stamp.toString().slice(-6)}` },
          type: QueryTypes.SELECT });
      created.boardId = b.id;
      w('1. create exam type', true, `id=${b.id}`);

      // 2. subject
      const [s] = await sequelize.query(
        `INSERT INTO subjects (exam_board_id, name, code, is_active, created_at, updated_at)
         VALUES (:b, :n, :c, true, NOW(), NOW()) RETURNING id`,
        { replacements: { b: created.boardId, n: `Health Subj ${stamp}`,
                          c: `HS${stamp.toString().slice(-6)}` }, type: QueryTypes.SELECT });
      created.subjectId = s.id;
      w('2. create subject', true, `id=${s.id}`);

      // 3-4. find a teacher and assign
      const [teacher] = await sequelize.query(
        `SELECT id FROM users WHERE role='teacher' AND is_active=true LIMIT 1`,
        { type: QueryTypes.SELECT });
      if (!teacher) throw new Error('no active teacher exists');
      await sequelize.query(
        `INSERT INTO teacher_subjects (teacher_id, subject_id, exam_board_id,
            assigned_by, assigned_at, is_active)
         VALUES (:t, :s, :b, :a, NOW(), true)
         ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true`,
        { replacements: { t: teacher.id, s: created.subjectId,
                          b: created.boardId, a: adminId }, type: QueryTypes.INSERT });
      w('4. assign teacher → subject', true, `teacher=${teacher.id}`);

      // 5. topic
      const [tp] = await sequelize.query(
        `INSERT INTO topics (subject_id, name, description, order_index, is_active, created_at, updated_at)
         VALUES (:s, 'Health Topic', 'health check', 0, true, NOW(), NOW()) RETURNING id`,
        { replacements: { s: created.subjectId }, type: QueryTypes.SELECT });
      created.topicId = tp.id;
      w('5. create topic', true, `id=${tp.id}`);

      // 6. subtopic
      const [st] = await sequelize.query(
        `INSERT INTO subtopics (topic_id, subject_id, name, description, order_index,
            is_active, created_at, updated_at)
         VALUES (:t, :s, 'Health Sub', 'health check', 0, true, NOW(), NOW()) RETURNING id`,
        { replacements: { t: created.topicId, s: created.subjectId },
          type: QueryTypes.SELECT });
      created.subtopicId = st.id;
      w('6. create subtopic', true, `id=${st.id}`);

      // 7. resource (mirror real upload route — only topic/subtopic FK)
      const [rs] = await sequelize.query(
        `INSERT INTO resources (title, resource_type, file_url, is_active, is_free,
            uploaded_by, subtopic_id, topic_id, created_at, updated_at)
         VALUES (:title, 'pdf', '/uploads/resources/_health.pdf', true, true,
                 :uploader, :sub, :top, NOW(), NOW()) RETURNING id`,
        { replacements: { title: `health-${stamp}`, uploader: teacher.id,
                          sub: created.subtopicId, top: created.topicId },
          type: QueryTypes.SELECT });
      w('7. create resource', true, `id=${rs.id}`);

      // 8. question (mirror real teacher question route)
      const [q] = await sequelize.query(
        `INSERT INTO questions (subtopic_id, submitted_by, question_text,
            options, correct_answer, explanation, difficulty, type, marks,
            is_active, created_at, updated_at)
         VALUES (:sub, :creator, 'Health: 1+1=?',
                 '[{"option_text":"1","is_correct":false},{"option_text":"2","is_correct":true}]'::jsonb,
                 '2', 'basic', 'easy', 'mcq', 1, true, NOW(), NOW()) RETURNING id`,
        { replacements: { sub: created.subtopicId, creator: teacher.id },
          type: QueryTypes.SELECT });
      created.questionId = q.id;
      w('8. create question', true, `id=${q.id}`);

      // 9. synthetic student
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('Healthcheck1!', 10);
      const [u] = await sequelize.query(
        `INSERT INTO users (email, password, first_name, last_name, role,
            is_active, is_verified, subscription_status, pending_exam_board_ids,
            created_at, updated_at)
         VALUES (:email, :pw, 'Health', 'Check', 'student',
                 true, true, 'free_trial', ARRAY[:board]::integer[], NOW(), NOW())
         RETURNING id`,
        { replacements: { email: `health-${stamp}@check.local`, pw: hash,
                          board: created.boardId }, type: QueryTypes.SELECT });
      created.studentId = u.id;
      w('9. register student', true, `id=${u.id}`);

      // 10. enrol
      await sequelize.query(
        `INSERT INTO student_subjects (student_id, subject_id, is_active)
         VALUES (:s, :sub, true)
         ON CONFLICT (student_id, subject_id) DO UPDATE SET is_active=true`,
        { replacements: { s: created.studentId, sub: created.subjectId },
          type: QueryTypes.INSERT });
      await sequelize.query(
        `INSERT INTO student_exam_types (student_id, exam_board_id, is_active)
         VALUES (:s, :b, true)
         ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active=true`,
        { replacements: { s: created.studentId, b: created.boardId },
          type: QueryTypes.INSERT });
      w('10. enrol student → subject', true);

      // 11. visibility
      const [enr] = await sequelize.query(
        `SELECT 1 FROM student_subjects WHERE student_id=:s AND subject_id=:sub`,
        { replacements: { s: created.studentId, sub: created.subjectId },
          type: QueryTypes.SELECT });
      w('11. student sees enrolled subject', !!enr);

      // 12. mark resources complete
      await sequelize.query(
        `INSERT INTO subtopic_progress (student_id, subtopic_id, resources_completed,
            last_accessed, created_at, updated_at)
         VALUES (:s, :sub, true, NOW(), NOW(), NOW())
         ON CONFLICT (student_id, subtopic_id) DO UPDATE SET
           resources_completed=true, last_accessed=NOW(), updated_at=NOW()`,
        { replacements: { s: created.studentId, sub: created.subtopicId },
          type: QueryTypes.INSERT });
      w('12. mark resources completed', true);

      // 13. practice attempt
      await sequelize.query(
        `INSERT INTO practice_attempts (student_id, question_id, is_correct,
            time_taken_seconds, attempted_at)
         VALUES (:s, :q, true, 5, NOW())`,
        { replacements: { s: created.studentId, q: created.questionId },
          type: QueryTypes.INSERT });
      w('13. record practice attempt', true);

      // 14. quiz pass
      await sequelize.query(
        `UPDATE subtopic_progress SET quiz_completed=true, updated_at=NOW()
         WHERE student_id=:s AND subtopic_id=:sub`,
        { replacements: { s: created.studentId, sub: created.subtopicId },
          type: QueryTypes.UPDATE });
      w('14. record quiz completion', true);

      // 15. dashboard math
      const [dash] = await sequelize.query(
        `SELECT
           (SELECT COUNT(*)::int FROM practice_attempts WHERE student_id=:s) AS attempts,
           (SELECT COUNT(*)::int FROM subtopic_progress
              WHERE student_id=:s AND quiz_completed=true) AS quizzes`,
        { replacements: { s: created.studentId }, type: QueryTypes.SELECT });
      w('15. dashboard reflects activity',
        dash.attempts >= 1 && dash.quizzes >= 1,
        `attempts=${dash.attempts} quizzes=${dash.quizzes}`);
    } catch (err) {
      w('walkthrough error', false, err.message);
    } finally {
      // cleanup — order matters for FKs
      try {
        if (created.studentId)  await sequelize.query(`DELETE FROM users      WHERE id=:id`, { replacements: { id: created.studentId },  type: QueryTypes.DELETE });
        if (created.questionId) await sequelize.query(`DELETE FROM questions  WHERE id=:id`, { replacements: { id: created.questionId }, type: QueryTypes.DELETE });
        if (created.subtopicId) await sequelize.query(`DELETE FROM resources  WHERE subtopic_id=:id`, { replacements: { id: created.subtopicId }, type: QueryTypes.DELETE });
        if (created.subtopicId) await sequelize.query(`DELETE FROM subtopics  WHERE id=:id`, { replacements: { id: created.subtopicId }, type: QueryTypes.DELETE });
        if (created.topicId)    await sequelize.query(`DELETE FROM topics     WHERE id=:id`, { replacements: { id: created.topicId },    type: QueryTypes.DELETE });
        if (created.subjectId)  await sequelize.query(`DELETE FROM teacher_subjects WHERE subject_id=:id`, { replacements: { id: created.subjectId }, type: QueryTypes.DELETE });
        if (created.subjectId)  await sequelize.query(`DELETE FROM subjects   WHERE id=:id`, { replacements: { id: created.subjectId },  type: QueryTypes.DELETE });
        if (created.boardId)    await sequelize.query(`DELETE FROM exam_boards WHERE id=:id`, { replacements: { id: created.boardId },   type: QueryTypes.DELETE });
      } catch (cleanupErr) {
        walkthrough.cleanup_warning = cleanupErr.message;
      }
    }
  }

  const failedSchema = checks.filter(c => !c.ok).length;
  const overall = failedSchema === 0 && (!walkthrough || walkthrough.failed === 0);
  return res.status(overall ? 200 : 503).json({
    success: overall,
    summary: {
      schema_checks: checks.length,
      schema_failed: failedSchema,
      walkthrough_run: !!walkthrough,
      walkthrough_passed: walkthrough?.passed ?? null,
      walkthrough_failed: walkthrough?.failed ?? null,
      seed_counts: counts,
    },
    checks,
    walkthrough,
    duration_ms: Date.now() - t0,
  });
});

// ── POST /api/admin/migrate-to-r2 ────────────────────────────────────────────
// One-time migration: uploads every resource whose file_url is a local
// /uploads/ path to Cloudflare R2 and updates the DB row.
// Protected: admin only. Safe to call multiple times (already-migrated rows
// are skipped). Query param: ?dry=true to preview without making changes.
router.post('/migrate-to-r2', protect, adminOnly, async (req, res) => {
  const fs   = require('fs');
  const path = require('path');
  const mime = (() => { try { return require('mime-types'); } catch { return null; } })();
  const r2   = require('../utils/r2Storage');
  const dry  = req.query.dry === 'true';

  if (!r2.isR2Enabled()) {
    return res.status(503).json({
      success: false,
      error: 'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL in Render env vars.'
    });
  }

  try {
    const rows = await sequelize.query(
      `SELECT id, title, file_url, original_filename, mime_type
         FROM resources
        WHERE file_url IS NOT NULL
          AND (file_url LIKE '/uploads/%' OR file_url LIKE 'uploads/%')
        ORDER BY created_at ASC`,
      { type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.json({ success: true, message: 'Nothing to migrate — all resources already on R2.', migrated: 0, skipped: 0, failed: 0, results: [] });
    }

    const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
    const results = [];
    let migrated = 0, skipped = 0, failed = 0;

    for (const row of rows) {
      const relPath  = row.file_url.replace(/^\//, '');
      const fullPath = path.join(UPLOADS_DIR, relPath.replace(/^uploads\//, ''));
      const filename = row.original_filename || path.basename(relPath);

      if (!fs.existsSync(fullPath)) {
        results.push({ id: row.id, title: row.title, status: 'skipped', reason: 'file not found on disk' });
        skipped++;
        continue;
      }

      if (dry) {
        results.push({ id: row.id, title: row.title, status: 'would_migrate', file: relPath });
        migrated++;
        continue;
      }

      try {
        const buffer   = fs.readFileSync(fullPath);
        const mimetype = row.mime_type || (mime ? mime.lookup(fullPath) : null) || 'application/octet-stream';
        const { url }  = await r2.uploadBuffer({ buffer, originalname: filename, mimetype });

        await sequelize.query(
          `UPDATE resources SET file_url = :url, updated_at = NOW() WHERE id = :id`,
          { replacements: { url, id: row.id }, type: QueryTypes.UPDATE }
        );

        results.push({ id: row.id, title: row.title, status: 'migrated', url });
        migrated++;
      } catch (err) {
        results.push({ id: row.id, title: row.title, status: 'failed', reason: err.message });
        failed++;
      }
    }

    return res.json({ success: true, dry, migrated, skipped, failed, total: rows.length, results });
  } catch (err) {
    console.error('[migrate-to-r2]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/admin/purge-all-resources ─────────────────────────────────────
// Deletes ALL resources, their assignments (resource_assignments +
// resource_user_assignments), and any R2 objects. Irreversible.
// Protected: admin only. Requires header  X-Confirm: purge-all-resources
router.delete('/purge-all-resources', protect, adminOnly, async (req, res) => {
  if (req.headers['x-confirm'] !== 'purge-all-resources') {
    return res.status(400).json({
      success: false,
      error: 'Missing confirmation header. Send X-Confirm: purge-all-resources'
    });
  }

  try {
    const r2 = require('../utils/r2Storage');

    // Fetch all file_url values so we can delete from R2
    const rows = await sequelize.query(
      `SELECT id, file_url FROM resources WHERE file_url IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );

    // Best-effort R2 deletions (don't block on failures)
    if (r2.isR2Enabled()) {
      await Promise.allSettled(rows.map(r => r2.deleteByUrl(r.file_url)));
    }

    // Delete in FK-safe order
    const [, raResult]  = await sequelize.query(`DELETE FROM resource_assignments`, { type: QueryTypes.DELETE });
    const [, ruaResult] = await sequelize.query(`DELETE FROM resource_user_assignments`, { type: QueryTypes.DELETE });
    const [, rResult]   = await sequelize.query(`DELETE FROM resources`, { type: QueryTypes.DELETE });

    return res.json({
      success: true,
      message: 'All resources and assignments purged.',
      r2_attempted: r2.isR2Enabled() ? rows.length : 0,
      resources_deleted: rows.length,
    });
  } catch (err) {
    console.error('[purge-all-resources]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
