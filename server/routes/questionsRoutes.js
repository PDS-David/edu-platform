'use strict';
// server/routes/questionsRoutes.js
// GET  /api/questions/random  — fetch questions (JSONB options, correct subtopic join)
// POST /api/questions/:id/answer — validate answer, record practice_attempt

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

let awardXP = () => Promise.resolve();
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch {}

// ── GET /api/questions/random ─────────────────────────────────────────────────
router.get('/random', protect, async (req, res) => {
  const { count = '10', subject_id, subtopic_id, board, difficulty } = req.query;
  const limit = Math.min(Math.max(parseInt(count) || 10, 1), 50);

  const filters      = ['q.is_active = true'];
  const replacements = { limit };

  if (subtopic_id) {
    filters.push('q.subtopic_id = :subtopic_id');
    replacements.subtopic_id = subtopic_id;
  }
  if (subject_id) {
    filters.push('t.subject_id = :subject_id');
    replacements.subject_id = subject_id;
  }
  if (difficulty && ['easy','medium','hard'].includes(difficulty)) {
    filters.push('q.difficulty = :difficulty');
    replacements.difficulty = difficulty;
  }

  let boardJoin = '';
  if (board) {
    boardJoin = `JOIN subjects s_b ON s_b.id = t.subject_id
                 JOIN exam_boards eb_b ON eb_b.id = s_b.exam_board_id
                   AND UPPER(eb_b.code) = UPPER(:board)`;
    replacements.board = board;
  }

  const where = `WHERE ${filters.join(' AND ')}`;

  try {
    const questions = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.marks, q.difficulty, q.explanation,
         q.type, q.topic, q.options, q.correct_answer,
         q.subtopic_id,
         t.subject_id,
         s.name AS subject_name,
         eb.code AS exam_board_code
       FROM questions q
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       JOIN subjects   s  ON s.id  = t.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       ${boardJoin}
       ${where}
       ORDER BY RANDOM()
       LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: questions.length, data: questions });
  } catch (err) {
    console.error('[GET /questions/random]', err.message);
    // Return empty rather than crashing — frontend handles empty gracefully
    return res.json({ success: true, count: 0, data: [] });
  }
});

// ── POST /api/questions/:id/answer ───────────────────────────────────────────
router.post('/:id/answer', protect, async (req, res) => {
  const { id } = req.params;
  const { selected_answer, essay_response, time_taken_seconds = 0 } = req.body;

  try {
    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.marks, q.explanation, q.correct_answer, q.options, q.type
       FROM questions q WHERE q.id = :id AND q.is_active = true`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!questions.length) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const question = questions[0];
    const isEssay  = question.type === 'essay' || !!essay_response;

    let isCorrect    = false;
    let marksAwarded = 0;
    let feedback     = null;

    if (!isEssay) {
      // MCQ — compare against correct_answer (stored as text) or options JSONB
      const correctAnswer = question.correct_answer;
      if (selected_answer !== undefined && selected_answer !== null) {
        isCorrect = String(selected_answer).trim().toLowerCase() ===
                    String(correctAnswer || '').trim().toLowerCase();
      }
      marksAwarded = isCorrect ? (question.marks || 1) : 0;
    } else {
      // Essay — AI marking or fallback
      if (process.env.GEMINI_API_KEY && essay_response?.trim()) {
        try {
          const { GoogleGenerativeAI } = require('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
          const prompt = `You are a Nigerian exam marker. Question: "${question.question_text}". Max marks: ${question.marks || 3}. Model answer: "${question.correct_answer || 'Not specified'}". Student answer: "${essay_response.trim()}". Return ONLY JSON: {"marks_awarded": N, "feedback": "...", "is_correct": true/false}`;
          const result  = await model.generateContent(prompt);
          const raw     = result.response.text().replace(/```json|```/g, '').trim();
          const parsed  = JSON.parse(raw);
          marksAwarded  = Math.min(parsed.marks_awarded || 0, question.marks || 3);
          isCorrect     = parsed.is_correct || marksAwarded >= (question.marks || 3) * 0.5;
          feedback      = parsed.feedback;
        } catch {
          feedback = question.explanation || 'Submitted for review.';
        }
      }
    }

    // Record practice attempt (non-blocking, safe)
    sequelize.query(
      `INSERT INTO practice_attempts
         (student_id, question_id, is_correct, time_taken_seconds, attempted_at)
       VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW())`,
      {
        replacements: {
          studentId:  req.user.id,
          questionId: id,
          isCorrect,
          timeTaken:  parseInt(time_taken_seconds) || 0,
        },
        type: QueryTypes.INSERT,
      }
    ).catch(() => {});

    awardXP(req.user.id, 'answer', { is_correct: isCorrect }).catch(() => {});

    return res.json({
      success:       true,
      is_correct:    isCorrect,
      correct_answer: question.correct_answer,
      explanation:   question.explanation || null,
      marks_awarded: marksAwarded,
      max_marks:     question.marks || 1,
      feedback,
    });
  } catch (err) {
    console.error(`[POST /questions/${id}/answer]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to validate answer' });
  }
});

// ── POST /api/questions/submit — ContributeQuestion page ─────────────────────
router.post('/submit', protect, async (req, res) => {
  const { question_text, subtopic_id, difficulty = 'medium', explanation, options, correct_answer } = req.body;
  if (!question_text?.trim()) return res.status(400).json({ success: false, error: 'question_text is required' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ success: false, error: 'At least 2 options required' });

  const correctOpt = options.find(o => o.is_correct);
  const correctAns = correct_answer || correctOpt?.option_text || correctOpt?.text || '';

  try {
    const result = await sequelize.query(
      `INSERT INTO questions (question_text, subtopic_id, submitted_by, difficulty, explanation, options, correct_answer, type, is_active, created_at, updated_at)
       VALUES (:question_text, :subtopic_id, :submitted_by, :difficulty, :explanation, :options::jsonb, :correct_answer, 'mcq', true, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          question_text:  question_text.trim(),
          subtopic_id:    subtopic_id ? parseInt(subtopic_id) : null,
          submitted_by:   req.user.id,
          difficulty,
          explanation:    explanation?.trim() || null,
          options:        JSON.stringify(options.map(o => ({ option_text: o.option_text || o.text || '', is_correct: !!o.is_correct }))),
          correct_answer: correctAns,
        },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, message: 'Question submitted — thank you!', data: { id: result[0].id } });
  } catch (err) {
    console.error('[POST /questions/submit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
