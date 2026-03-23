// server/routes/adminRoutes.js
// Admin-only endpoints:
//   POST /api/admin/generate-questions  — AI question generation via Gemini
//   GET  /api/admin/questions/pending-count — count of pending questions

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect } = require('../middleware/auth');

// ── Admin guard ───────────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// ── Gemini helper ─────────────────────────────────────────────────────────────
const getGeminiModel = () => {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
};

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

  // ── Fetch subject name for the prompt ─────────────────────────────────────
  const subjects = await sequelize.query(
    `SELECT name FROM subjects WHERE id = :id`,
    { replacements: { id: subject_id }, type: QueryTypes.SELECT }
  );
  if (!subjects.length) {
    return res.status(404).json({ success: false, error: 'Subject not found' });
  }
  const subjectName = subjects[0].name;

  // ── Build Gemini prompt ───────────────────────────────────────────────────
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
    "marks": 1,
    "difficulty": "${difficulty}"
  }
]

Rules:
- Exactly one option must have is_correct: true per question
- All four options must be distinct and plausible
- Questions must be ${exam_board}-style — direct, factual, curriculum-aligned
- explanation must state why the correct answer is right and others are wrong
- Do NOT include numbering, preambles, or any text outside the JSON array`;

  try {
    const model  = getGeminiModel();
    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let questions;
    try {
      questions = JSON.parse(cleaned);
    } catch {
      console.error('[generate-questions] Gemini returned non-JSON:', cleaned.slice(0, 300));
      return res.status(502).json({ success: false, error: 'AI returned invalid JSON. Try again.' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(502).json({ success: false, error: 'AI returned empty question set.' });
    }

    // ── Look up exam_board_id UUID ────────────────────────────────────────────
    const boardRows = await sequelize.query(
      'SELECT id FROM exam_boards WHERE UPPER(code) = UPPER(:code) LIMIT 1',
      { replacements: { code: exam_board }, type: QueryTypes.SELECT }
    );
    const examBoardId = boardRows[0]?.id || null;

        // ── Insert questions + options into DB ───────────────────────────────────
    let inserted = 0;
    for (const q of questions) {
      if (!q.question_text || !Array.isArray(q.options)) continue;

      const qResult = await sequelize.query(
        `INSERT INTO questions
           (id, question_text, difficulty, marks, topic, subject_id_uuid,
            exam_board_id, exam_board, source, status, explanation, created_at, updated_at)
         VALUES
           (gen_random_uuid(), :question_text, :difficulty, :marks, :topic,
            :subject_id, :examBoardId, :exam_board, 'ai_generated', 'pending',
            :explanation, NOW(), NOW())
         RETURNING id`,
        {
          replacements: {
            question_text: q.question_text,
            difficulty:    q.difficulty || difficulty,
            marks:         q.marks      || 1,
            topic,
            subject_id,
            examBoardId,
            exam_board,
            explanation:   q.explanation || '',
          },
          type: QueryTypes.INSERT,
        }
      );

      const questionId = qResult[0][0]?.id;
      if (!questionId) continue;

      // Insert options
      for (const opt of q.options) {
        await sequelize.query(
          `INSERT INTO answer_options
             (id, question_id, option_text, is_correct, created_at)
           VALUES
             (gen_random_uuid(), :question_id, :option_text, :is_correct, NOW())`,
          {
            replacements: {
              question_id: questionId,
              option_text: opt.option_text,
              is_correct:  opt.is_correct === true,
            },
            type: QueryTypes.INSERT,
          }
        );
      }
      inserted++;
    }

    return res.status(200).json({
      success:  true,
      message:  `Generated ${questions.length}, inserted ${inserted} questions (status: pending)`,
      generated: questions.length,
      inserted,
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
      `SELECT COUNT(*)::INTEGER AS count FROM questions WHERE status = 'pending'`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: rows[0]?.count || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/subjects — subject list for the generate form
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
// List all teacher→subject assignments with teacher and subject details.
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
    console.error('[GET /admin/teacher-assignments] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/teacher-assignments
// Assign a teacher to a subject (with optional exam board).
// Body: { teacher_id, subject_id, exam_board_id }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/teacher-assignments', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id, exam_board_id } = req.body;

  if (!teacher_id || !subject_id) {
    return res.status(400).json({ success: false, error: 'teacher_id and subject_id are required' });
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
          subjectId:   subject_id,
          examBoardId: exam_board_id || null,
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
// Soft-delete (deactivate) a teacher→subject assignment.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/teacher-assignments/:id', protect, adminOnly, async (req, res) => {
  const { id } = req.params;
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
// Returns platform-wide analytics. All queries run in parallel via Promise.all.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/platform-stats', protect, adminOnly, async (req, res) => {
  try {
    const [
      userStats,
      questionStats,
      revenueStats,
      topSubjects,
      dailyActivity,
    ] = await Promise.all([

      // ── Users ────────────────────────────────────────────────────────────────
      sequelize.query(
        `SELECT
           COUNT(*)::INTEGER                                                   AS total,
           COUNT(*) FILTER (WHERE role = 'student')::INTEGER                  AS students,
           COUNT(*) FILTER (WHERE role = 'teacher')::INTEGER                  AS teachers,
           COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '24 hours')::INTEGER AS active_today,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::INTEGER   AS new_this_week
         FROM users WHERE is_active = true`,
        { type: QueryTypes.SELECT }
      ),

      // ── Questions ────────────────────────────────────────────────────────────
      sequelize.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'approved')::INTEGER AS total_approved,
           COUNT(*) FILTER (WHERE status = 'pending')::INTEGER  AS total_pending,
           (SELECT COUNT(*)::INTEGER FROM practice_attempts
            WHERE attempted_at > NOW() - INTERVAL '24 hours')   AS answered_today,
           (SELECT COUNT(*)::INTEGER FROM practice_attempts
            WHERE attempted_at > NOW() - INTERVAL '7 days')     AS answered_this_week
         FROM questions`,
        { type: QueryTypes.SELECT }
      ),

      // ── Revenue / Subscriptions ───────────────────────────────────────────────
      sequelize.query(
        `SELECT
           COUNT(*) FILTER (WHERE subscription_status = 'active')::INTEGER                                AS total_active_subs,
           COUNT(*) FILTER (WHERE subscription_status IN ('active','free_trial')
                              AND created_at > NOW() - INTERVAL '30 days')::INTEGER AS new_subs_this_month
         FROM users`,
        { type: QueryTypes.SELECT }
      ),

      // ── Top 5 subjects by attempts last 30 days ───────────────────────────────
      sequelize.query(
        `SELECT
           s.name,
           COUNT(pa.id)::INTEGER                                AS attempt_count,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END)::NUMERIC, 1) AS avg_accuracy
         FROM practice_attempts pa
         JOIN questions q  ON q.id  = pa.question_id
         JOIN subjects  s  ON s.id  = q.subject_id_uuid
         WHERE pa.attempted_at > NOW() - INTERVAL '30 days'
         GROUP BY s.name
         ORDER BY attempt_count DESC
         LIMIT 5`,
        { type: QueryTypes.SELECT }
      ),

      // ── Daily activity last 14 days ───────────────────────────────────────────
      sequelize.query(
        `SELECT
           DATE(attempted_at)::TEXT AS date,
           COUNT(*)::INTEGER        AS attempt_count
         FROM practice_attempts
         WHERE attempted_at > NOW() - INTERVAL '14 days'
         GROUP BY DATE(attempted_at)
         ORDER BY date ASC`,
        { type: QueryTypes.SELECT }
      ),
    ]);

    return res.json({
      success: true,
      data: {
        users:          userStats[0]    || {},
        questions:      questionStats[0] || {},
        revenue:        revenueStats[0]  || {},
        top_subjects:   topSubjects,
        daily_activity: dailyActivity,
      },
    });

  } catch (err) {
    console.error('[GET /admin/platform-stats] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
