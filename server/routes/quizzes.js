'use strict';
// server/routes/quizzes.js
// Uses actual schema: questions.options (JSONB), questions.correct_answer (TEXT),
// practice_attempts (student_id, question_id, is_correct, time_taken_seconds)
// Quiz history stored in practice_attempts (no separate quiz_attempts table needed)

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

let awardXP = () => {};
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch {}

// ── GET /api/quizzes/attempt-count ───────────────────────────────────────────
router.get('/attempt-count', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  if (!subtopic_id) return res.status(400).json({ success: false, error: 'subtopic_id required' });
  try {
    const rows = await sequelize.query(
      `SELECT COUNT(DISTINCT pa.student_id)::INTEGER AS total
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE q.subtopic_id = :subtopicId`,
      { replacements: { subtopicId: subtopic_id }, type: QueryTypes.SELECT }
    );
    const total = rows[0]?.total || 0;
    return res.json({ success: true, data: { total, label: total >= 1000 ? `${Math.floor(total/100)*100}+` : `${total}` } });
  } catch (err) {
    return res.json({ success: true, data: { total: 0, label: '0' } });
  }
});

// ── POST /api/quizzes/attempt ─────────────────────────────────────────────────
// Body: { subtopic_id, answers: [{ question_id, selected_answer, time_taken_seconds }] }
router.post('/attempt', protect, async (req, res) => {
  const { subtopic_id, answers = [] } = req.body;
  if (!subtopic_id || !answers.length) {
    return res.status(400).json({ success: false, error: 'subtopic_id and answers required' });
  }

  try {
    const questionIds = answers.map(a => a.question_id).filter(Boolean);
    if (!questionIds.length) return res.status(400).json({ success: false, error: 'No valid question IDs' });

    // Fetch questions with correct answers
    const questionRows = await sequelize.query(
      `SELECT id, question_text, marks, explanation, correct_answer, options, type
       FROM questions WHERE id = ANY(ARRAY[:ids]::int[]) AND is_active = true`,
      { replacements: { ids: questionIds }, type: QueryTypes.SELECT }
    );
    const questionMap = Object.fromEntries(questionRows.map(q => [String(q.id), q]));

    let totalScore = 0;
    let maxScore   = 0;
    const results  = [];

    for (const answer of answers) {
      const question = questionMap[String(answer.question_id)];
      if (!question) continue;

      const markValue  = question.marks || 1;
      maxScore        += markValue;

      const isCorrect = String(answer.selected_answer || '').trim().toLowerCase() ===
                        String(question.correct_answer || '').trim().toLowerCase();
      const marks     = isCorrect ? markValue : 0;
      totalScore     += marks;

      results.push({
        question_id:    answer.question_id,
        question_text:  question.question_text,
        selected_answer: answer.selected_answer,
        correct_answer:  question.correct_answer,
        is_correct:      isCorrect,
        marks_awarded:   marks,
        max_marks:       markValue,
        explanation:     question.explanation,
        options:         question.options,
      });

      // Record attempt (non-blocking)
      sequelize.query(
        `INSERT INTO practice_attempts (student_id, question_id, is_correct, time_taken_seconds, attempted_at)
         VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW())`,
        {
          replacements: {
            studentId:  req.user.id,
            questionId: answer.question_id,
            isCorrect,
            timeTaken:  parseInt(answer.time_taken_seconds) || 0,
          },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});
    }

    // Update subtopic_progress
    const accuracyPct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    if (accuracyPct >= 60) {
      sequelize.query(
        `INSERT INTO subtopic_progress (student_id, subtopic_id, quiz_completed, updated_at)
         VALUES (:studentId, :subtopicId, true, NOW())
         ON CONFLICT (student_id, subtopic_id) DO UPDATE SET quiz_completed = true, updated_at = NOW()`,
        { replacements: { studentId: req.user.id, subtopicId: subtopic_id }, type: QueryTypes.INSERT }
      ).catch(() => {});
    }

    awardXP(req.user.id, 'quiz', { score: totalScore, max: maxScore }).catch(() => {});

    return res.json({
      success:      true,
      data: {
        subtopic_id,
        total_score:  totalScore,
        max_score:    maxScore,
        accuracy_pct: accuracyPct,
        passed:       accuracyPct >= 60,
        answers:      results,
      },
    });
  } catch (err) {
    console.error('[POST /quizzes/attempt]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/quizzes/attempt/:attemptId ──────────────────────────────────────
// Returns a simple practice attempt result — used by QuizResultsPage
router.get('/attempt/:attemptId', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT pa.id, pa.question_id, pa.is_correct, pa.attempted_at,
              q.question_text, q.correct_answer, q.explanation, q.marks
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.id = :id AND pa.student_id = :studentId`,
      { replacements: { id: req.params.attemptId, studentId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Attempt not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/quizzes/history/:studentId/:subtopicId ──────────────────────────
router.get('/history/:studentId/:subtopicId', protect, async (req, res) => {
  const { studentId, subtopicId } = req.params;
  if (String(req.user.id) !== String(studentId) && !['teacher','admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  try {
    const rows = await sequelize.query(
      `SELECT DATE(pa.attempted_at) AS date,
              COUNT(*)::INTEGER AS attempts,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.student_id = :studentId AND q.subtopic_id = :subtopicId
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date DESC LIMIT 10`,
      { replacements: { studentId, subtopicId }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

// ── GET /api/quizzes/history ─────────────────────────────────────────────────
router.get('/history', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  const studentId = req.user.id;
  try {
    const rows = await sequelize.query(
      `SELECT DATE(pa.attempted_at) AS date,
              COUNT(*)::INTEGER AS attempts,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.student_id = :studentId ${subtopic_id ? 'AND q.subtopic_id = :subtopicId' : ''}
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date DESC LIMIT 20`,
      { replacements: { studentId, ...(subtopic_id ? { subtopicId: subtopic_id } : {}) }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

// ── GET /api/quizzes ──────────────────────────────────────────────────────────
router.get('/', protect, async (_req, res) => {
  return res.json({ success: true, data: [], message: 'Use /quizzes/attempt to submit a quiz' });
});

module.exports = router;
