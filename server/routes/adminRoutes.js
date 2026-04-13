// server/routes/adminRoutes.js
// Admin-only endpoints.
//
// PATCH CHANGES APPLIED:
//   - POST /api/admin/generate-questions writes is_ai_generated=TRUE,
//     status='approved', source='ai_generated'
//   - PATCH /api/admin/questions/bulk-approve
//   - GET  /api/admin/users
//   - PUT  /api/admin/users/:id/role
//   - PUT  /api/admin/users/:id/deactivate
//   - DELETE /api/admin/users/:id
//   - GET  /api/admin/users/stats
//
// v4 AI COST CONTROL:
//   Removed inline getGeminiModel() helper.
//   POST /generate-questions now calls generate() from services/ai.js.
//
// v5 UUID FIX:
//   Removed parseInt() from subject_id, exam_board_id, and teacher-subjects PK.
//
// v6 SCHEMA FIX:
//   questions.id          = INTEGER (SERIAL) — not UUID
//   subjects.id           = INTEGER
//   questions.submitted_by = INTEGER in DB (UUID in model — mismatch)
//   Fix: submitted_by omitted from INSERT (DB uses default/NULL)
//         subject_id safely parsed — numeric string → parseInt, UUID → 400 error
//         subjects lookup uses id::text cast to avoid integer parse crash

'use strict';

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');
// v4: central AI hub replaces inline getGeminiModel() helper
const { generate }   = require('../services/ai');

// ── Helpers ───────────────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// v6: Safe subject_id parser.
// subjects.id is INTEGER. The frontend dropdown should send an integer ID.
// If a UUID-like string arrives (frontend bug) we return a clear 400 instead
// of crashing with "invalid input syntax for type integer".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseSubjectId(raw) {
  const s = String(raw || '').trim();
  if (UUID_RE.test(s)) return null;          // UUID — subjects table uses INTEGER pk
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/generate-questions
// Body: { subject_id, topic, exam_board, count, difficulty }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate-questions', protect, adminOnly, async (req, res) => {
  const {
    subject_id,
    topic,
    exam_board = 'JAMB',
    count      = 10,
    difficulty = 'medium',
  } = req.body;

  if (!subject_id || !topic) {
    return res.status(400).json({ success: false, error: 'subject_id and topic are required' });
  }
  if (count < 1 || count > 50) {
    return res.status(400).json({ success: false, error: 'count must be between 1 and 50' });
  }

  // v6: subjects.id is INTEGER — validate before querying
  const safeSubjectId = parseSubjectId(subject_id);
  if (safeSubjectId === null) {
    return res.status(400).json({
      success: false,
      error: 'Invalid subject_id. Please reselect a subject from the dropdown.',
    });
  }

  // ── Fetch subject name ────────────────────────────────────────────────────
  const subjects = await sequelize.query(
    `SELECT name FROM subjects WHERE id = :id`,
    { replacements: { id: safeSubjectId }, type: QueryTypes.SELECT }
  );
  if (!subjects.length) {
    return res.status(404).json({ success: false, error: 'Subject not found' });
  }
  const subjectName = subjects[0].name;

  // ── Build prompt ──────────────────────────────────────────────────────────
  const prompt = `Generate ${count} ${difficulty} ${exam_board} exam MCQ questions on the topic "${topic}" for Nigerian secondary school ${subjectName} students.

Return ONLY a valid JSON array with no preamble, no markdown, no backticks. Each element must follow this exact shape:
[
  {
    "question_text": "...",
    "options": [
      { "option_text": "...", "is_correct": true },
      { "option_text": "...", "is_correct": false },
      { "option_text": "...", "is_correct": false },
      { "option_text": "...", "is_correct": false }
    ],
    "explanation": "...",
    "concept_hint": "A short 1-sentence conceptual clue that helps a student understand WHY this answer is correct, without giving it away.",
    "marks": 1,
    "difficulty": "${difficulty}"
  }
]

Rules:
- Exactly one option must have is_correct: true per question
- All four options must be distinct and plausible
- Questions must be ${exam_board}-style — direct, factual, curriculum-aligned
- explanation must state why the correct answer is right and others are wrong
- concept_hint must be a single sentence, pedagogical, not a giveaway
- Do NOT include numbering, preambles, or any text outside the JSON array`;

  try {
    const raw = await generate(prompt, 'generate-questions');

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let questions;
    try {
      questions = JSON.parse(cleaned);
    } catch {
      console.error('[generate-questions] AI returned non-JSON:', cleaned.slice(0, 300));
      return res.status(502).json({ success: false, error: 'AI returned invalid JSON. Try again.' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(502).json({ success: false, error: 'AI returned empty question set.' });
    }

    // ── Look up exam_board_id (INTEGER FK) ───────────────────────────────────
    const boardRows = await sequelize.query(
      'SELECT id FROM exam_boards WHERE UPPER(code) = UPPER(:code) LIMIT 1',
      { replacements: { code: exam_board }, type: QueryTypes.SELECT }
    );
    const examBoardId = boardRows[0]?.id || null;

    // ── Insert questions into DB ─────────────────────────────────────────────
    // v6: submitted_by is OMITTED — the column type in DB (INTEGER) conflicts
    // with req.user.id (UUID). Omitting lets the DB use its default (NULL).
    // is_ai_generated=TRUE and source='ai_generated' preserve audit trail.
    let inserted = 0;
    const insertedQuestions = [];

    for (const q of questions) {
      if (!q.question_text || !Array.isArray(q.options)) continue;

      let qResult;
      try {
        qResult = await sequelize.query(
          `INSERT INTO questions
             (question_text, marks, explanation, options, correct_answer,
              subtopic_id, difficulty,
              is_ai_generated, ai_generation_source, status, source,
              is_active, created_at, updated_at)
           VALUES
             (:question_text, :marks, :explanation, :options::jsonb, :correct_answer,
              NULL, :difficulty,
              true, 'gemini', 'approved', 'ai_generated',
              true, NOW(), NOW())
           RETURNING id`,
          {
            replacements: {
              question_text:  q.question_text,
              marks:          q.marks || 1,
              difficulty:     q.difficulty || difficulty || 'medium',
              explanation:    q.explanation || '',
              options:        JSON.stringify(q.options || []),
              correct_answer: q.correct_answer ||
                              (q.options?.find(o => o.is_correct)?.option_text) || '',
            },
            type: QueryTypes.SELECT,
          }
        );
      } catch (insertErr) {
        console.error('[generate-questions] INSERT error:', insertErr.message);
        continue; // skip this question, try the rest
      }

      const questionId = qResult[0]?.id;
      if (!questionId) continue;

      inserted++;
      insertedQuestions.push({
        id:            questionId,
        question_text: q.question_text,
        concept_hint:  q.concept_hint || null,
      });
    }

    return res.status(200).json({
      success:   true,
      message:   `Generated ${questions.length}, inserted ${inserted} questions (status: approved)`,
      generated: questions.length,
      inserted,
      questions: insertedQuestions,
    });

  } catch (err) {
    console.error('[generate-questions] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Question generation failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/questions/pending-count
// ─────────────────────────────────────────────────────────────────────────────
router.get('/questions/pending-count', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS count FROM questions WHERE is_active = true`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: rows[0]?.count || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/subjects
// ─────────────────────────────────────────────────────────────────────────────
router.get('/subjects', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT s.id, s.name, eb.code AS exam_board_code
       FROM subjects s
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       ORDER BY s.name`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/teacher-assignments
// ─────────────────────────────────────────────────────────────────────────────
router.get('/teacher-assignments', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         ts.id,
         u.first_name || ' ' || u.last_name AS teacher_name,
         u.email,
         s.name  AS subject_name,
         eb.code AS exam_board_code,
         ts.is_active,
         ts.assigned_at
       FROM teacher_subjects ts
       JOIN users u        ON u.id  = ts.teacher_id
       JOIN subjects s     ON s.id  = ts.subject_id
       LEFT JOIN exam_boards eb ON eb.id = ts.exam_board_id
       ORDER BY u.last_name, s.name`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    if (err.message.includes('teacher_subjects') || err.message.includes('does not exist')) {
      return res.json({ success: true, count: 0, data: [] });
    }
    console.error('[GET /admin/teacher-assignments] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/teacher-assignments
// teacher_subjects.subject_id and exam_board_id are INTEGER FKs
// ─────────────────────────────────────────────────────────────────────────────
router.post('/teacher-assignments', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id, exam_board_id } = req.body;

  if (!teacher_id || !subject_id) {
    return res.status(400).json({ success: false, error: 'teacher_id and subject_id are required' });
  }

  const safeSubjectId   = parseSubjectId(subject_id);
  const safeExamBoardId = exam_board_id ? parseInt(exam_board_id, 10) || null : null;

  if (safeSubjectId === null) {
    return res.status(400).json({ success: false, error: 'Invalid subject_id format' });
  }

  try {
    await sequelize.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, exam_board_id, assigned_by, is_active)
       VALUES (:teacherId, :subjectId, :examBoardId, :adminId, true)
       ON CONFLICT (teacher_id, subject_id)
       DO UPDATE SET is_active = true, exam_board_id = :examBoardId`,
      {
        replacements: {
          teacherId:   teacher_id,
          subjectId:   safeSubjectId,
          examBoardId: safeExamBoardId,
          adminId:     req.user.id,
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({ success: true, message: 'Teacher assigned successfully' });
  } catch (err) {
    console.error('[POST /admin/teacher-assignments] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/teacher-assignments/:id
// teacher_subjects.id is SERIAL (INTEGER)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/teacher-assignments/:id', protect, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active = false WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Assignment removed' });
  } catch (err) {
    console.error('[DELETE /admin/teacher-assignments] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/platform-stats
// ─────────────────────────────────────────────────────────────────────────────
router.get('/platform-stats', protect, adminOnly, async (req, res) => {
  try {
    const safeQuery = async (sql, fallback) => {
      try {
        return await sequelize.query(sql, { type: QueryTypes.SELECT });
      } catch (e) {
        console.warn('[platform-stats] query skipped:', e.message);
        return fallback;
      }
    };

    const [userStats, questionStats, revenueStats, topSubjects, dailyActivity] = await Promise.all([
      safeQuery(
        `SELECT
           COUNT(*)::INTEGER AS total,
           COUNT(*) FILTER (WHERE role = 'student')::INTEGER  AS students,
           COUNT(*) FILTER (WHERE role = 'teacher')::INTEGER  AS teachers,
           COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '24 hours')::INTEGER AS active_today,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::INTEGER   AS new_this_week
         FROM users WHERE is_active = true`,
        [{}]
      ),
      safeQuery(
        `SELECT COUNT(*)::INTEGER AS total_approved FROM questions WHERE is_active = true`,
        [{}]
      ),
      safeQuery(
        `SELECT
           COUNT(*) FILTER (WHERE subscription_status = 'active')::INTEGER AS total_active_subs,
           COUNT(*) FILTER (WHERE subscription_status IN ('active','free_trial')
                              AND created_at > NOW() - INTERVAL '30 days')::INTEGER AS new_subs_this_month
         FROM users`,
        [{}]
      ),
      safeQuery(
        `SELECT s.name, COUNT(pa.id)::INTEGER AS attempt_count,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END)::NUMERIC, 1) AS avg_accuracy
         FROM practice_attempts pa
         JOIN questions q  ON q.id  = pa.question_id
         JOIN subtopics st ON st.id = q.subtopic_id
         JOIN topics    t  ON t.id  = st.topic_id
         JOIN subjects  s  ON s.id  = t.subject_id
         WHERE pa.attempted_at > NOW() - INTERVAL '30 days'
         GROUP BY s.name ORDER BY attempt_count DESC LIMIT 5`,
        []
      ),
      safeQuery(
        `SELECT DATE(attempted_at)::TEXT AS date, COUNT(*)::INTEGER AS attempt_count
         FROM practice_attempts
         WHERE attempted_at > NOW() - INTERVAL '14 days'
         GROUP BY DATE(attempted_at) ORDER BY date ASC`,
        []
      ),
    ]);

    return res.json({
      success: true,
      data: {
        users:          userStats[0]    || {},
        questions:      questionStats[0] || {},
        revenue:        revenueStats[0]  || {},
        top_subjects:   Array.isArray(topSubjects)   ? topSubjects   : [],
        daily_activity: Array.isArray(dailyActivity) ? dailyActivity : [],
      },
    });
  } catch (err) {
    console.error('[GET /admin/platform-stats] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/send-weekly-digest
// ─────────────────────────────────────────────────────────────────────────────
router.post('/send-weekly-digest', protect, adminOnly, async (req, res) => {
  try {
    const scheduledJobs = require('../jobs/scheduledJobs');
    if (typeof scheduledJobs.runWeeklyDigest === 'function') {
      scheduledJobs.runWeeklyDigest().catch(e =>
        console.error('[send-weekly-digest] background error:', e.message)
      );
    }
    return res.json({ success: true, message: 'Weekly digest queued successfully.' });
  } catch (err) {
    console.error('[POST /admin/send-weekly-digest] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to queue digest' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/questions/pending
// ─────────────────────────────────────────────────────────────────────────────
router.get('/questions/pending', protect, adminOnly, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '10'), 50);
  const offset = Math.max(parseInt(req.query.offset || '0'),  0);
  try {
    const [countRows, rows] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::INTEGER AS total FROM questions WHERE is_active = true`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT q.id, q.question_text, q.marks,
                q.explanation, q.created_at,
                q.correct_answer, q.options,
                q.is_ai_generated, q.ai_generation_source,
                st.name AS subtopic_name,
                s.name  AS subject_name,
                eb.code AS exam_board_code,
                eb.name AS exam_board_name
         FROM questions q
         LEFT JOIN subtopics  st ON st.id = q.subtopic_id
         LEFT JOIN topics     tp ON tp.id = st.topic_id
         LEFT JOIN subjects   s  ON s.id  = tp.subject_id
         LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
         WHERE q.is_active = true
         ORDER BY q.created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements: { limit, offset }, type: QueryTypes.SELECT }
      ),
    ]);
    return res.json({
      success: true,
      total:   countRows[0]?.total || 0,
      data:    rows,
    });
  } catch (err) {
    console.error('[GET /admin/questions/pending] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/questions/bulk-approve
// MUST be before /:id/approve to prevent Express matching 'bulk-approve' as id
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/questions/bulk-approve', protect, adminOnly, async (req, res) => {
  const { question_ids } = req.body;

  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'question_ids must be a non-empty array' });
  }

  // questions.id is INTEGER — validate all are numeric
  const numericIds = question_ids.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
  if (numericIds.length === 0) {
    return res.status(400).json({ success: false, error: 'All question_ids must be valid integers' });
  }

  try {
    await sequelize.query(
      `UPDATE questions SET status = 'approved', updated_at = NOW()
       WHERE id = ANY(:ids::integer[])`,
      { replacements: { ids: numericIds }, type: QueryTypes.UPDATE }
    );
    return res.json({
      success:        true,
      message:        `${numericIds.length} question${numericIds.length !== 1 ? 's' : ''} approved`,
      approved_count: numericIds.length,
    });
  } catch (err) {
    console.error('[PATCH /admin/questions/bulk-approve]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/questions/:id/review
// ─────────────────────────────────────────────────────────────────────────────
router.put('/questions/:id/review', protect, adminOnly, async (req, res) => {
  const { action, feedback } = req.body;
  const id = parseInt(req.params.id, 10);

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, error: 'action must be approve or reject' });
  }
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid question id' });

  try {
    await sequelize.query(
      `UPDATE questions SET status = :status, updated_at = NOW() WHERE id = :id`,
      { replacements: { status: action === 'approve' ? 'approved' : 'rejected', id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: `Question ${action === 'approve' ? 'approved' : 'rejected'}` });
  } catch (err) {
    console.error('[PUT /admin/questions/:id/review] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/questions/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/questions/:id/approve', protect, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid question id' });
  try {
    await sequelize.query(
      `UPDATE questions SET status = 'approved', updated_at = NOW() WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Question approved' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/questions/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/questions/:id', protect, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid question id' });
  try {
    await sequelize.query(
      `DELETE FROM answer_options WHERE question_id = :id`,
      { replacements: { id }, type: QueryTypes.DELETE }
    );
    await sequelize.query(
      `DELETE FROM questions WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.DELETE }
    );
    return res.json({ success: true, message: 'Question deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// GET /users/stats MUST be before GET /users/:id
// ═════════════════════════════════════════════════════════════════════════════

router.get('/users/stats', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         COUNT(*)::INTEGER AS total,
         COUNT(*) FILTER (WHERE role='student')::INTEGER AS students,
         COUNT(*) FILTER (WHERE role='teacher')::INTEGER AS teachers,
         COUNT(*) FILTER (WHERE subscription_status='active')::INTEGER AS active_subscriptions
       FROM users WHERE is_active = true`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/users', protect, adminOnly, async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;
  const filters      = ['u.is_active = true'];
  const replacements = {
    limit:  parseInt(limit)  || 20,
    offset: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20),
  };

  if (role) { filters.push('u.role = :role'); replacements.role = role; }
  if (search) {
    filters.push(`(u.first_name ILIKE :search OR u.last_name ILIKE :search OR u.email ILIKE :search)`);
    replacements.search = `%${search}%`;
  }

  const where = `WHERE ${filters.join(' AND ')}`;
  try {
    const [countRows, users] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::INTEGER AS total FROM users u ${where}`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
                u.is_active, u.subscription_status, u.last_login, u.created_at
         FROM users u ${where}
         ORDER BY u.created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT }
      ),
    ]);
    return res.json({ success: true, total: countRows[0]?.total || 0, data: users });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/users/:id/role', protect, adminOnly, async (req, res) => {
  const { role } = req.body;
  if (!['student', 'teacher', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }
  try {
    await sequelize.query(
      `UPDATE users SET role = :role, updated_at = NOW() WHERE id = :id`,
      { replacements: { role, id: req.params.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/users/:id/deactivate', protect, adminOnly, async (req, res) => {
  const { is_active } = req.body;
  try {
    await sequelize.query(
      `UPDATE users SET is_active = :isActive, updated_at = NOW() WHERE id = :id`,
      { replacements: { isActive: !!is_active, id: req.params.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── /admin/teacher-subjects — alias kept for TeacherAssignmentPage ────────────
router.get('/teacher-subjects', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ts.id, ts.teacher_id, ts.subject_id, ts.exam_board_id, ts.is_active, ts.assigned_at,
              u.first_name || ' ' || u.last_name AS teacher_name, u.email,
              s.name AS subject_name, eb.code AS exam_board_code
       FROM teacher_subjects ts
       JOIN users u ON u.id = ts.teacher_id
       JOIN subjects s ON s.id = ts.subject_id
       LEFT JOIN exam_boards eb ON eb.id = ts.exam_board_id
       WHERE ts.is_active = true
       ORDER BY u.last_name, s.name`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    if (err.message.includes('teacher_subjects') || err.message.includes('does not exist')) {
      return res.json({ success: true, count: 0, data: [] });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// teacher_subjects.subject_id = INTEGER FK, exam_board_id = INTEGER FK
router.post('/teacher-subjects', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id, exam_board_id } = req.body;
  if (!teacher_id || !subject_id) {
    return res.status(400).json({ success: false, error: 'teacher_id and subject_id required' });
  }

  const safeSubjectId   = parseSubjectId(subject_id);
  const safeExamBoardId = exam_board_id ? parseInt(exam_board_id, 10) || null : null;

  if (safeSubjectId === null) {
    return res.status(400).json({ success: false, error: 'Invalid subject_id format' });
  }

  try {
    await sequelize.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, exam_board_id, assigned_by, is_active, assigned_at)
       VALUES (:teacherId, :subjectId, :examBoardId, :adminId, true, NOW())
       ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true, assigned_by = :adminId, assigned_at = NOW()`,
      {
        replacements: {
          teacherId:   teacher_id,
          subjectId:   safeSubjectId,
          examBoardId: safeExamBoardId,
          adminId:     req.user.id,
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.json({ success: true, message: 'Teacher assigned to subject' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// teacher_subjects.id = SERIAL (INTEGER)
router.delete('/teacher-subjects/:id', protect, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active = false WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Assignment removed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
