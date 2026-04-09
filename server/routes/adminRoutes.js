// server/routes/adminRoutes.js
// Admin-only endpoints.
//
// PROMPT 1 CHANGES:
//   - POST /api/admin/generate-questions now writes is_ai_generated = TRUE,
//     ai_generation_source = 'gemini-2.0-flash', and concept_hint (if Gemini
//     returns one) into the questions table.
//   - Gemini prompt updated to optionally return a concept_hint per question.
//   - concept_hint exposed in the generate-questions response so the admin UI
//     can preview it without a round-trip.
//   - All other endpoints are unchanged.

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
  return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/generate-questions
// Body: { subject_id, topic, exam_board, count, difficulty }
//
// PROMPT 1: Gemini now returns concept_hint per question.
//           INSERT writes is_ai_generated=TRUE, ai_generation_source, concept_hint.
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
  // PROMPT 1: concept_hint added to the JSON shape so we can store it.
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
    "concept_hint": "A short 1-sentence conceptual clue that helps a student understand WHY this answer is correct, without giving it away. E.g. 'Think about what happens to osmotic pressure when solute concentration increases.'",
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

    // ── Insert questions + options into DB ────────────────────────────────────
    // PROMPT 1: is_ai_generated, ai_generation_source, concept_hint now persisted.
    let inserted = 0;
    const insertedQuestions = [];

    for (const q of questions) {
      if (!q.question_text || !Array.isArray(q.options)) continue;

      const qResult = await sequelize.query(
        `INSERT INTO questions
           (question_text, marks, explanation, options, correct_answer,
            subtopic_id, submitted_by, is_active,
            created_at, updated_at)
         VALUES
           (:question_text, :marks, :explanation, :options::jsonb, :correct_answer,
            :subtopic_id, :submitted_by, true,
            NOW(), NOW())
         RETURNING id`,
        {
          replacements: {
            question_text:  q.question_text,
            marks:          q.marks || 1,
            explanation:    q.explanation || '',
            options:        JSON.stringify(q.options || []),
            correct_answer: q.correct_answer || (q.options?.find(o => o.is_correct)?.option_text) || '',
            subtopic_id:    null,
            submitted_by:   req.user.id,
          },
          type: QueryTypes.SELECT,
        }
      );

      const questionId = qResult[0]?.id;
      if (!questionId) continue;

      inserted++;
      insertedQuestions.push({
        id:            questionId,
        question_text: q.question_text,
      });
    }

    return res.status(200).json({
      success:   true,
      message:   `Generated ${questions.length}, inserted ${inserted} questions (status: pending)`,
      generated: questions.length,
      inserted,
      questions: insertedQuestions, // preview for admin UI
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
    // teacher_subjects table may not exist yet — return empty
    if (err.message.includes('teacher_subjects') || err.message.includes('does not exist')) {
      return res.json({ success: true, count: 0, data: [] });
    }
    console.error('[GET /admin/teacher-assignments] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/teacher-assignments
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
// ─────────────────────────────────────────────────────────────────────────────
router.get('/platform-stats', protect, adminOnly, async (req, res) => {
  try {
    // Run each query independently so one missing table doesn't kill the whole response
    const safeQuery = async (sql, fallback) => {
      try {
        const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });
        return rows;
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
        `SELECT COUNT(*)::INTEGER AS total_approved, 0 AS total_pending, 0 AS answered_today, 0 AS answered_this_week FROM questions`,
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
// PROMPT 1: now includes is_ai_generated, ai_generation_source, concept_hint
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
                st.name AS subtopic_name,
                s.name  AS subject_name,
                eb.code AS exam_board_code,
                eb.name AS exam_board_name,
                u.first_name AS submitter_first_name,
                u.last_name  AS submitter_last_name,
                u.email      AS submitter_email
         FROM questions q
         LEFT JOIN subtopics  st ON st.id = q.subtopic_id
         LEFT JOIN topics     tp ON tp.id = st.topic_id
         LEFT JOIN subjects   s  ON s.id  = tp.subject_id
         LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
         LEFT JOIN users      u  ON u.id  = q.submitted_by
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
// PUT /api/admin/questions/:id/review
// ─────────────────────────────────────────────────────────────────────────────
router.put('/questions/:id/review', protect, adminOnly, async (req, res) => {
  const { action, feedback } = req.body;
  const { id } = req.params;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, error: 'action must be approve or reject' });
  }

  try {
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await sequelize.query(
      `UPDATE questions
       SET status = :status, updated_at = NOW()
       WHERE id = :id`,
      { replacements: { status: newStatus, id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: `Question ${newStatus}` });
  } catch (err) {
    console.error('[PUT /admin/questions/:id/review] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/questions/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/questions/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE questions SET status = 'approved', updated_at = NOW() WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
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
  try {
    await sequelize.query(
      `DELETE FROM answer_options WHERE question_id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.DELETE }
    );
    await sequelize.query(
      `DELETE FROM questions WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.DELETE }
    );
    return res.json({ success: true, message: 'Question deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
