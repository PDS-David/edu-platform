'use strict';
// server/routes/questionsRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/questions/random        — fetch random questions
// POST /api/questions/:id/answer    — validate MCQ or essay answer
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

const UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// XP middleware (optional — won't break if missing)
let awardXP = () => Promise.resolve();
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch {}

// ── GET /api/questions/random ─────────────────────────────────────────────────
// Query params: count, subject_id, subtopic_id, board, difficulty,
//               question_sub_type, mode
router.get('/random', protect, async (req, res) => {
  const {
    count              = '10',
    subject_id,
    subtopic_id,
    board,
    difficulty,
    question_sub_type,
    mode,              // 'practice' | undefined
  } = req.query;

  const limit = Math.min(Math.max(parseInt(count) || 10, 1), 50);

  const filters      = [];
  const replacements = { limit };

  // Status filter: 'practice' mode includes AI-generated questions too
  // (they are already set to 'approved' — this is just a note)
  filters.push("q.status = 'approved'");
  filters.push('q.is_active = true');

  if (subject_id  && isValidUUID(subject_id))  {
    filters.push('q.subject_id_uuid = :subject_id');
    replacements.subject_id = subject_id;
  }
  if (subtopic_id && isValidUUID(subtopic_id)) {
    filters.push('q.subtopic_id = :subtopic_id');
    replacements.subtopic_id = subtopic_id;
  }
  if (difficulty && ['easy','medium','hard'].includes(difficulty)) {
    filters.push('q.difficulty = :difficulty');
    replacements.difficulty = difficulty;
  }
  if (question_sub_type && ['mcq','structured','smart'].includes(question_sub_type)) {
    filters.push('q.question_sub_type = :question_sub_type');
    replacements.question_sub_type = question_sub_type;
  }

  // Board filter — join through subjects → exam_boards
  let boardJoin = '';
  if (board) {
    boardJoin = `JOIN subjects sub ON sub.id = q.subject_id_uuid
                 JOIN exam_boards eb ON eb.id = sub.exam_board_id AND UPPER(eb.code) = UPPER(:board)`;
    replacements.board = board;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const questions = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.marks, q.difficulty, q.explanation,
         q.question_type, q.question_sub_type, q.topic, q.year,
         q.source, q.concept_hint, q.hints,
         q.subject_id_uuid AS subject_id, q.subtopic_id,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'id', ao.id, 'option_text', ao.option_text
           ) ORDER BY ao.id)
            FROM answer_options ao WHERE ao.question_id = q.id),
           q.options
         ) AS options,
         eb.code AS exam_board_code
       FROM questions q
       ${boardJoin}
       LEFT JOIN subjects   sub2 ON sub2.id  = q.subject_id_uuid
       LEFT JOIN exam_boards eb  ON eb.id    = sub2.exam_board_id
       ${where}
       ORDER BY RANDOM()
       LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, count: questions.length, data: questions });
  } catch (err) {
    console.error('[GET /questions/random]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch questions' });
  }
});

// ── POST /api/questions/:id/answer ───────────────────────────────────────────
// Validates a student's answer (MCQ or essay).
// Body: { selected_option_id?, essay_response?, session_id?, time_taken_ms?, mode? }
// Returns: { success, is_correct, correct_options, explanation, marks_awarded, max_marks }
router.post('/:id/answer', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid question ID' });
  }

  const {
    selected_option_id,
    essay_response,
    session_id,
    time_taken_ms = 0,
    mode          = 'practice',
  } = req.body;

  try {
    // Fetch question
    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.marks, q.explanation, q.correct_answer,
              q.question_type, q.question_sub_type
       FROM questions q WHERE q.id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!questions.length) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const question = questions[0];
    const isEssay  = !!essay_response || question.question_sub_type === 'essay';

    // ── MCQ validation ────────────────────────────────────────────────────────
    if (!isEssay) {
      if (!selected_option_id) {
        return res.status(400).json({ success: false, error: 'selected_option_id is required for MCQ' });
      }

      // Fetch correct options
      const correctOptions = await sequelize.query(
        `SELECT id, option_text FROM answer_options WHERE question_id = :id AND is_correct = true`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );

      // Check if selected option is correct
      const selectedOption = await sequelize.query(
        `SELECT id, option_text, is_correct FROM answer_options WHERE id = :optId`,
        { replacements: { optId: selected_option_id }, type: QueryTypes.SELECT }
      );

      const isCorrect = selectedOption[0]?.is_correct === true;

      // Record practice attempt (non-blocking)
      sequelize.query(
        `INSERT INTO practice_attempts
           (id, student_id, question_id, is_correct, time_taken_ms, attempted_at)
         VALUES (gen_random_uuid(), :studentId, :questionId, :isCorrect, :timeTaken, NOW())
         ON CONFLICT DO NOTHING`,
        {
          replacements: {
            studentId:  req.user.id,
            questionId: id,
            isCorrect:  isCorrect,
            timeTaken:  parseInt(time_taken_ms) || 0,
          },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});

      // Award XP (non-blocking)
      awardXP(req.user.id, 'answer', { is_correct: isCorrect }).catch(() => {});

      return res.status(200).json({
        success:         true,
        is_correct:      isCorrect,
        correct_options: correctOptions,
        explanation:     question.explanation || null,
        marks_awarded:   isCorrect ? (question.marks || 1) : 0,
        max_marks:       question.marks || 1,
      });
    }

    // ── Essay validation ──────────────────────────────────────────────────────
    // Use AI to mark the essay (non-blocking Gemini call)
    let feedback      = 'Your answer has been submitted.';
    let marksAwarded  = 0;
    let modelAnswer   = question.correct_answer || null;

    if (process.env.GEMINI_API_KEY && essay_response?.trim()) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `You are a Nigerian secondary school exam marker (WAEC/JAMB/NECO standard).
Question: "${question.question_text}"
Maximum marks: ${question.marks || 3}
Correct answer guidance: "${question.correct_answer || 'Not specified'}"

Student's essay answer: "${essay_response.trim()}"

Provide:
1. Marks awarded out of ${question.marks || 3} (integer)
2. Brief feedback (2-3 sentences max)
3. Model answer (1-2 sentences)

Return ONLY valid JSON, no markdown:
{"marks_awarded": N, "feedback": "...", "model_answer": "..."}`;

        const result  = await model.generateContent(prompt);
        const raw     = result.response.text().trim().replace(/```json|```/g, '').trim();
        const parsed  = JSON.parse(raw);
        marksAwarded  = Math.min(parsed.marks_awarded || 0, question.marks || 3);
        feedback      = parsed.feedback || feedback;
        modelAnswer   = parsed.model_answer || modelAnswer;
      } catch {
        // Gemini failed — use stored explanation as fallback
        feedback = question.explanation || 'Your answer has been submitted for review.';
      }
    }

    // Record attempt (non-blocking)
    sequelize.query(
      `INSERT INTO practice_attempts
         (id, student_id, question_id, is_correct, time_taken_ms, attempted_at)
       VALUES (gen_random_uuid(), :studentId, :questionId, :isCorrect, :timeTaken, NOW())`,
      {
        replacements: {
          studentId:  req.user.id,
          questionId: id,
          isCorrect:  marksAwarded > 0,
          timeTaken:  parseInt(time_taken_ms) || 0,
        },
        type: QueryTypes.INSERT,
      }
    ).catch(() => {});

    return res.status(200).json({
      success:      true,
      is_correct:   marksAwarded >= (question.marks || 3),
      marks_awarded: marksAwarded,
      max_marks:    question.marks || 3,
      feedback,
      model_answer: modelAnswer,
      explanation:  question.explanation || null,
    });

  } catch (err) {
    console.error(`[POST /questions/${id}/answer]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to validate answer' });
  }
});

module.exports = router;
