// server/routes/questionsRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   POST /api/questions/import          (admin — multer JSON/CSV bulk import)
//   POST /api/questions/submit          (any auth user — community submission)
//   GET  /api/questions/pending         (admin — review queue)
//   PUT  /api/questions/:id/review      (admin — approve/reject)
//   GET  /api/questions/random          (auth — ?board=JAMB&subject_id=&count=10)
//   GET  /api/questions/:id             (auth — with answer options)
//   POST /api/questions/:id/answer      (auth — server-side validation)
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

const { protect, authorize }   = require('../middleware/auth');
const { parseJSON, parseCSV, batchInsert } = require('../utils/questionImporter');

// ── XP middleware (fire-and-forget — never crashes the route) ─────────────────
let awardXP = () => {};
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch { /* not yet installed */ }

// ── Multer: store uploads in /tmp, accept JSON and CSV only ──────────────────

const upload = multer({
  dest: '/tmp/eac_imports/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.json' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only .json and .csv files are accepted'));
    }
  },
});

// ── UUID helper ──────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(v); }

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/questions/import
// Admin bulk import via JSON or CSV file
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/import',
  protect,
  authorize('admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' });
    }

    const filePath = req.file.path;
    const ext      = path.extname(req.file.originalname).toLowerCase();

    try {
      // Parse
      let parseResult;
      if (ext === '.json') {
        parseResult = parseJSON(filePath);
      } else {
        parseResult = parseCSV(filePath);
      }

      if (parseResult.questions.length === 0) {
        return res.status(422).json({
          success: false,
          error:   'No valid questions found in file',
          parse_errors: parseResult.errors,
        });
      }

      // Insert
      const result = await batchInsert(parseResult.questions, req.user.id);

      return res.status(200).json({
        success: true,
        message: `Import complete`,
        inserted:     result.inserted,
        skipped:      result.skipped,
        parse_errors: parseResult.errors,
        insert_errors: result.errors,
        total_in_file: parseResult.questions.length + parseResult.errors.length,
      });

    } finally {
      // Always clean up temp file
      fs.unlink(filePath, () => {});
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/questions/submit
// Community submission — any authenticated user
// ─────────────────────────────────────────────────────────────────────────────
router.post('/submit', protect, async (req, res) => {
  const {
    question_text,
    question_type = 'multiple_choice',
    exam_board_id,
    subject_id,
    year,
    topic,
    difficulty = 'medium',
    explanation,
    options,
    hints,
  } = req.body;

  // Basic validation
  if (!question_text || !exam_board_id || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'question_text, exam_board_id, and at least 2 options are required',
    });
  }

  // FIX: exam_board_id is now a UUID — validate format instead of parseInt
  if (!isValidUUID(exam_board_id)) {
    return res.status(400).json({ success: false, error: 'exam_board_id must be a valid UUID' });
  }

  const correctCount = options.filter(o => o.is_correct).length;
  if (correctCount === 0) {
    return res.status(400).json({ success: false, error: 'At least one option must be marked correct' });
  }

  const transaction = await sequelize.transaction();

  try {
    // Insert question as pending
    const inserted = await sequelize.query(
      `INSERT INTO questions
         (question_text, question_type, exam_board_id, subject_id, year,
          topic, difficulty, explanation, source, status, submitted_by,
          created_at, updated_at)
       VALUES
         (:question_text, :question_type, :exam_board_id, :subject_id, :year,
          :topic, :difficulty, :explanation, 'community', 'pending', :submitted_by,
          NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          question_text: question_text.trim(),
          question_type,
          exam_board_id,                   // UUID string — no parseInt
          subject_id:    subject_id || null, // UUID string or null — no parseInt
          year:          year       || null,
          topic:         topic      || null,
          difficulty,
          explanation:   explanation || null,
          submitted_by:  req.user.id,
        },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    const questionId = inserted[0].id;

    // Insert answer options
    for (const opt of options) {
      await sequelize.query(
        `INSERT INTO answer_options (question_id, option_text, is_correct, created_at)
         VALUES (:question_id, :option_text, :is_correct, NOW())`,
        {
          replacements: {
            question_id: questionId,
            option_text: opt.text.trim(),
            is_correct:  opt.is_correct,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    // Insert hints (optional)
    if (Array.isArray(hints)) {
      for (let hi = 0; hi < Math.min(hints.length, 3); hi++) {
        if (hints[hi] && hints[hi].trim()) {
          await sequelize.query(
            `INSERT INTO question_hints (question_id, hint_order, hint_text, created_at)
             VALUES (:question_id, :hint_order, :hint_text, NOW())`,
            {
              replacements: {
                question_id: questionId,
                hint_order:  hi + 1,
                hint_text:   hints[hi].trim(),
              },
              type: QueryTypes.INSERT,
              transaction,
            }
          );
        }
      }
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Question submitted for review. Thank you for contributing!',
      question_id: questionId,
      status: 'pending',
    });

  } catch (err) {
    await transaction.rollback();
    console.error('[POST /questions/submit] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to submit question' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/questions/pending
// Admin review queue — pending community submissions
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending', protect, authorize('admin'), async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '20', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0',  10), 0);

  try {
    const countRows = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS total FROM questions WHERE status = 'pending'`,
      { type: QueryTypes.SELECT }
    );

    const questions = await sequelize.query(
      `SELECT
         q.id,
         q.question_text,
         q.question_type,
         q.exam_board_id,
         eb.name        AS exam_board_name,
         eb.code        AS exam_board_code,
         q.subject_id,
         q.year,
         q.topic,
         q.difficulty,
         q.explanation,
         q.source,
         q.status,
         q.submitted_by,
         u.email        AS submitted_by_email,
         q.created_at
       FROM questions q
       LEFT JOIN exam_boards eb ON q.exam_board_id = eb.id
       LEFT JOIN users u        ON q.submitted_by  = u.id
       WHERE q.status = 'pending'
       ORDER BY q.created_at ASC
       LIMIT :limit OFFSET :offset`,
      { replacements: { limit, offset }, type: QueryTypes.SELECT }
    );

    // Attach options to each pending question
    const qIds = questions.map(q => q.id);
    let optionsByQ = {};
    if (qIds.length > 0) {
      const opts = await sequelize.query(
        `SELECT id, question_id, option_text, is_correct
         FROM answer_options WHERE question_id IN (:ids) ORDER BY id ASC`,
        { replacements: { ids: qIds }, type: QueryTypes.SELECT }
      );
      opts.forEach(o => {
        if (!optionsByQ[o.question_id]) optionsByQ[o.question_id] = [];
        optionsByQ[o.question_id].push(o);
      });
    }

    const data = questions.map(q => ({
      ...q,
      options: optionsByQ[q.id] || [],
    }));

    return res.status(200).json({
      success: true,
      total:   countRows[0]?.total || 0,
      count:   data.length,
      data,
    });

  } catch (err) {
    console.error('[GET /questions/pending] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch pending questions' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/questions/:id/review
// Admin approve or reject a pending question
// Body: { action: 'approve' | 'reject', rejection_reason?: string }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/review', protect, authorize('admin'), async (req, res) => {
  const questionId = req.params.id;
  const { action, rejection_reason } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, error: 'action must be "approve" or "reject"' });
  }

  try {
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const result = await sequelize.query(
      `UPDATE questions
       SET status       = :status,
           reviewed_by  = :reviewed_by,
           reviewed_at  = NOW(),
           updated_at   = NOW()
       WHERE id = :id AND status = 'pending'
       RETURNING id, status`,
      {
        replacements: {
          id:          questionId,
          status:      newStatus,
          reviewed_by: req.user.id,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'Pending question not found' });
    }

    return res.status(200).json({
      success:     true,
      message:     `Question ${newStatus}`,
      question_id: result[0].id,
      status:      result[0].status,
    });

  } catch (err) {
    console.error(`[PUT /questions/${questionId}/review] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to review question' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/questions/random
// Random approved questions — ?board=JAMB&subject_id=<uuid>&count=10
// ─────────────────────────────────────────────────────────────────────────────
router.get('/random', protect, async (req, res) => {
  const { board, subject_id, difficulty } = req.query;
  const count = Math.min(parseInt(req.query.count || '10', 10), 50);

  const replacements = { count, status: 'approved' };
  const filters = [`q.status = :status`];

  if (board) {
    filters.push(`eb.code = :board`);
    replacements.board = board.toUpperCase();
  }

  // FIX: subject_id is now a UUID — validate and pass as string, no parseInt
  if (subject_id) {
    if (!isValidUUID(subject_id)) {
      return res.status(400).json({ success: false, error: 'subject_id must be a valid UUID' });
    }
    filters.push(`q.subject_id_uuid = :subject_id`);
    replacements.subject_id = subject_id;
  }

  if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
    filters.push(`q.difficulty = :difficulty`);
    replacements.difficulty = difficulty;
  }

  // BUG 2 FIX — subtopic_id filter (QuizTab.jsx sends ?subtopic_id=<uuid>)
  const { subtopic_id } = req.query;
  if (subtopic_id) {
    if (!isValidUUID(subtopic_id)) {
      return res.status(400).json({ success: false, error: 'subtopic_id must be a valid UUID' });
    }
    filters.push(`q.subtopic_id = :subtopicId`);
    replacements.subtopicId = subtopic_id;
  }

  // BUG 3 FIX — question_sub_type filter
  // QuizTab.jsx sends ?type=mcq  |  QuizPage.jsx sends ?question_sub_type=mcq
  const subType = req.query.question_sub_type || req.query.type;
  if (subType && ['mcq', 'smart_answers', 'structured'].includes(subType)) {
    filters.push(`q.question_sub_type = :subType`);
    replacements.subType = subType;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const questions = await sequelize.query(
      `SELECT
         q.id,
         q.question_text,
         q.question_type,
         q.exam_board_id,
         eb.code        AS exam_board_code,
         eb.name        AS exam_board_name,
         q.subject_id_uuid AS subject_id,
         q.subtopic_id,
         q.question_sub_type,
         q.year,
         q.topic,
         q.difficulty,
         q.explanation
       FROM questions q
       LEFT JOIN exam_boards eb ON q.exam_board_id = eb.id
       ${whereClause}
       ORDER BY RANDOM()
       LIMIT :count`,
      { replacements, type: QueryTypes.SELECT }
    );

    if (questions.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    // Fetch options — DO NOT send is_correct in the options (client doesn't know)
    const qIds = questions.map(q => q.id);
    const options = await sequelize.query(
      `SELECT id, question_id, option_text
       FROM answer_options
       WHERE question_id IN (:ids)
       ORDER BY id ASC`,
      { replacements: { ids: qIds }, type: QueryTypes.SELECT }
    );

    // Fetch hints
    const hints = await sequelize.query(
      `SELECT question_id, hint_order, hint_text
       FROM question_hints
       WHERE question_id IN (:ids)
       ORDER BY hint_order ASC`,
      { replacements: { ids: qIds }, type: QueryTypes.SELECT }
    );

    const optionsByQ = {};
    options.forEach(o => {
      if (!optionsByQ[o.question_id]) optionsByQ[o.question_id] = [];
      optionsByQ[o.question_id].push(o);
    });

    const hintsByQ = {};
    hints.forEach(h => {
      if (!hintsByQ[h.question_id]) hintsByQ[h.question_id] = [];
      hintsByQ[h.question_id].push(h.hint_text);
    });

    const data = questions.map(q => ({
      ...q,
      options: optionsByQ[q.id] || [],
      hints:   hintsByQ[q.id]   || [],
    }));

    return res.status(200).json({ success: true, count: data.length, data });

  } catch (err) {
    console.error('[GET /questions/random] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch questions' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/questions/:id
// Single question with options (no is_correct) and hints
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  // FIX: question IDs are UUIDs — validate as UUID, not parseInt
  const questionId = req.params.id;

  if (!isValidUUID(questionId)) {
    return res.status(400).json({ success: false, error: 'Invalid question ID' });
  }

  try {
    const questions = await sequelize.query(
      `SELECT
         q.id,
         q.question_text,
         q.question_type,
         q.exam_board_id,
         eb.code  AS exam_board_code,
         eb.name  AS exam_board_name,
         q.subject_id,
         q.year,
         q.topic,
         q.difficulty,
         q.explanation,
         q.status
       FROM questions q
       LEFT JOIN exam_boards eb ON q.exam_board_id = eb.id
       WHERE q.id = :id AND q.status = 'approved'`,
      { replacements: { id: questionId }, type: QueryTypes.SELECT }
    );

    if (questions.length === 0) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const options = await sequelize.query(
      `SELECT id, option_text FROM answer_options WHERE question_id = :id ORDER BY id ASC`,
      { replacements: { id: questionId }, type: QueryTypes.SELECT }
    );

    const hints = await sequelize.query(
      `SELECT hint_order, hint_text FROM question_hints WHERE question_id = :id ORDER BY hint_order ASC`,
      { replacements: { id: questionId }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      data: {
        ...questions[0],
        options: options,
        hints:   hints.map(h => h.hint_text),
      },
    });

  } catch (err) {
    console.error(`[GET /questions/${questionId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch question' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/questions/:id/answer
// Server-side answer validation — never sends correct answer to client
// Body: { selected_option_id: string (UUID), session_id: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/answer', protect, async (req, res) => {
  // FIX: question IDs are UUIDs — validate as UUID, not parseInt
  const questionId = req.params.id;
  const { selected_option_id, session_id, time_taken_ms } = req.body;

  if (!isValidUUID(questionId)) {
    return res.status(400).json({ success: false, error: 'Invalid question ID' });
  }

  if (!selected_option_id) {
    return res.status(400).json({ success: false, error: 'selected_option_id is required' });
  }

  // selected_option_id may be a UUID or an integer depending on answer_options.id type
  // Keep backward compatibility: accept both UUID and integer option IDs
  const optionIdIsUUID   = isValidUUID(String(selected_option_id));
  const optionIdIsInt    = !isNaN(parseInt(selected_option_id, 10));
  if (!optionIdIsUUID && !optionIdIsInt) {
    return res.status(400).json({ success: false, error: 'selected_option_id must be a valid ID' });
  }

  try {
    // Validate question exists and is approved
    const questions = await sequelize.query(
      `SELECT id, explanation FROM questions WHERE id = :id AND status = 'approved'`,
      { replacements: { id: questionId }, type: QueryTypes.SELECT }
    );

    if (questions.length === 0) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    // Check the selected option
    const optionRows = await sequelize.query(
      `SELECT id, option_text, is_correct
       FROM answer_options
       WHERE id = :option_id AND question_id = :question_id`,
      {
        replacements: {
          option_id:   selected_option_id,
          question_id: questionId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (optionRows.length === 0) {
      return res.status(400).json({ success: false, error: 'Selected option does not belong to this question' });
    }

    const selected   = optionRows[0];
    const is_correct = selected.is_correct;

    // Get the correct option(s) to show after answering
    const correctOptions = await sequelize.query(
      `SELECT id, option_text FROM answer_options WHERE question_id = :id AND is_correct = true`,
      { replacements: { id: questionId }, type: QueryTypes.SELECT }
    );

    // Log the attempt
    await sequelize.query(
      `INSERT INTO practice_attempts
         (student_id, question_id, selected_option, is_correct, time_taken_ms, session_id, attempted_at)
       VALUES
         (:student_id, :question_id, :selected_option, :is_correct, :time_taken_ms, :session_id, NOW())`,
      {
        replacements: {
          student_id:      req.user.id,
          question_id:     questionId,
          selected_option: selected_option_id,
          is_correct,
          time_taken_ms:   time_taken_ms || null,
          session_id:      session_id    || null,
        },
        type: QueryTypes.INSERT,
      }
    );

    // Award XP non-blocking — must be before the return
    setImmediate(() => awardXP(req.user.id, 'answer', { is_correct }).catch(() => {}));

    return res.status(200).json({
      success:          true,
      is_correct,
      selected_option:  { id: selected.id, text: selected.option_text },
      correct_options:  correctOptions.map(o => ({ id: o.id, text: o.option_text })),
      explanation:      questions[0].explanation || null,
    });

  } catch (err) {
    console.error(`[POST /questions/${questionId}/answer] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to validate answer' });
  }
});

module.exports = router;
