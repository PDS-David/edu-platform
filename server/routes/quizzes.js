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
// Body: { subtopic_id, answers: [{ question_id, selected_answer|selected_option_id, time_taken_seconds }] }
router.post('/attempt', protect, async (req, res) => {
  const { subtopic_id, subject_id, paper_type, total_time_ms, answers = [] } = req.body;
  if (!subtopic_id || !answers.length) {
    return res.status(400).json({ success: false, error: 'subtopic_id and answers required' });
  }

  try {
    const questionIds = answers.map(a => a.question_id).filter(Boolean);
    if (!questionIds.length) return res.status(400).json({ success: false, error: 'No valid question IDs' });

    // Fetch questions — questions.id is UUID, use TEXT cast for ANY()
    const questionRows = await sequelize.query(
      `SELECT id, question_text, marks, explanation, correct_answer, options, type
       FROM questions WHERE id::text = ANY(ARRAY[:ids]::text[]) AND is_active = true
         AND COALESCE(status, 'approved') IN ('approved', 'active')`,
      { replacements: { ids: questionIds.map(String) }, type: QueryTypes.SELECT }
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

      // Accept selected_answer (option text) OR selected_option_id (also option text in JSONB schema)
      const submittedAnswer = answer.selected_answer ?? answer.selected_option_id ?? '';
      const isCorrect = String(submittedAnswer).trim().toLowerCase() ===
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

    // Generate a stable attempt_id from the first practice_attempt row
    // so the frontend can navigate to /quiz-results/:attemptId
    let attemptId = null;
    try {
      const paRow = await sequelize.query(
        `SELECT id FROM practice_attempts
         WHERE student_id = :studentId AND question_id = ANY(ARRAY[:ids]::text[])
         ORDER BY attempted_at DESC LIMIT 1`,
        { replacements: { studentId: req.user.id, ids: questionIds.map(String) }, type: QueryTypes.SELECT }
      );
      attemptId = paRow[0]?.id || null;
    } catch (_) {}

    return res.json({
      success:      true,
      attempt_id:   attemptId,
      data: {
        attempt_id,
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
// Returns quiz results in the envelope QuizResultsPage expects:
// { attempt: {...}, answers: [...], benchmark: {...}, examiner_recommendation: '' }
//
// attemptId is a practice_attempts.id (UUID).
// We look up all attempts from the same session (same student, within 5 minutes of this attempt).
router.get('/attempt/:attemptId', protect, async (req, res) => {
  try {
    // Anchor row — find the reference attempt
    const anchor = await sequelize.query(
      `SELECT pa.id, pa.student_id, pa.attempted_at, pa.question_id,
              q.subtopic_id
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.id::text = :id AND pa.student_id = :studentId`,
      { replacements: { id: req.params.attemptId, studentId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!anchor.length) {
      return res.status(404).json({ success: false, error: 'Attempt not found' });
    }

    const { attempted_at, subtopic_id } = anchor[0];

    // All attempts in this session window (5 min before → 30s after anchor)
    const sessionRows = await sequelize.query(
      `SELECT pa.id, pa.question_id, pa.is_correct,
              pa.time_taken_seconds, pa.attempted_at,
              q.question_text, q.correct_answer, q.explanation, q.marks, q.options
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.student_id = :studentId
         AND pa.attempted_at BETWEEN (:anchor::timestamptz - INTERVAL '5 minutes')
                                 AND (:anchor::timestamptz + INTERVAL '30 seconds')
       ORDER BY pa.attempted_at ASC`,
      { replacements: { studentId: req.user.id, anchor: attempted_at }, type: QueryTypes.SELECT }
    );

    const answers = sessionRows.map(row => {
      // Find which option text was selected — stored in options JSONB
      const opts = Array.isArray(row.options) ? row.options : [];
      const correctOpt = opts.find(o => o.is_correct);
      return {
        question_id:         row.question_id,
        question_text:       row.question_text,
        is_correct:          row.is_correct,
        marks_awarded:       row.is_correct ? (row.marks || 1) : 0,
        max_marks:           row.marks || 1,
        correct_answer:      row.correct_answer,
        explanation:         row.explanation,
        selected_option_text: row.is_correct
          ? row.correct_answer
          : null, // we don't store what was selected — show null
        correct_options: correctOpt
          ? [{ id: correctOpt.option_text, option_text: correctOpt.option_text }]
          : [],
        ai_marking_scheme: {},
        ai_explanation:    row.explanation || '',
      };
    });

    const totalScore  = answers.reduce((s, a) => s + a.marks_awarded, 0);
    const maxScore    = answers.reduce((s, a) => s + a.max_marks, 0);
    const accuracyPct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const totalTimeMs = sessionRows.reduce((s, r) => s + (r.time_taken_seconds || 0) * 1000, 0);

    // Subtopic name
    let subtopicName = '';
    if (subtopic_id) {
      const stRows = await sequelize.query(
        `SELECT st.name, s.name AS subject_name FROM subtopics st LEFT JOIN topics t ON t.id=st.topic_id LEFT JOIN subjects s ON s.id=t.subject_id WHERE st.id=:id`,
        { replacements: { id: subtopic_id }, type: QueryTypes.SELECT }
      ).catch(() => []);
      subtopicName = stRows[0]?.name || '';
    }

    return res.json({
      success: true,
      data: {
        attempt: {
          id:            req.params.attemptId,
          subtopic_id,
          subtopic_name: subtopicName,
          total_score:   totalScore,
          max_score:     maxScore,
          accuracy_pct:  accuracyPct,
          total_time_ms: totalTimeMs,
        },
        answers,
        benchmark:                null,
        examiner_recommendation:  accuracyPct >= 70
          ? 'Excellent performance! You are well prepared for this topic.'
          : accuracyPct >= 50
          ? 'Good effort. Review the questions you missed and try again.'
          : 'Keep practising. Focus on the explanations for incorrect answers.',
      },
    });
  } catch (err) {
    console.error('[GET /quizzes/attempt/:id]', err.message);
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
