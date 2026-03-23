// server/routes/aiRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// AI-powered endpoints:
//   POST /api/ai/hint              — generate Socratic hint for a question
//   POST /api/ai/explain           — richer AI explanation after answering
//   GET  /api/ai/predict-grade/:studentId/:subjectId  — grade prediction
//   POST /api/ai/notes/generate    — generate revision notes for a topic
//   GET  /api/ai/cohort-gaps/:subjectId  — teacher cohort gap analysis
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const {
  generateHint,
  generateExplanation,
  generateRevisionNotes,
  predictGrade,
  analyzeCohortGaps,
} = require('../services/aiService');

// ─── POST /api/ai/hint ────────────────────────────────────────────────────────
// Body: { question_id, hint_level (1|2|3) }
// Returns: { hint: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/hint', protect, async (req, res) => {
  const { question_id, hint_level = 1 } = req.body;

  if (!question_id) {
    return res.status(400).json({ success: false, error: 'question_id is required' });
  }

  try {
    // Fetch question + options (no is_correct)
    const questions = await sequelize.query(
      `SELECT q.question_text, q.topic, eb.code AS exam_board_code
       FROM questions q
       LEFT JOIN exam_boards eb ON q.exam_board_id = eb.id
       WHERE q.id = :id AND q.status = 'approved'`,
      { replacements: { id: question_id }, type: QueryTypes.SELECT }
    );

    if (!questions.length) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const options = await sequelize.query(
      `SELECT option_text FROM answer_options WHERE question_id = :id ORDER BY id ASC`,
      { replacements: { id: question_id }, type: QueryTypes.SELECT }
    );

    const hint = await generateHint({
      questionText: questions[0].question_text,
      options,
      topic:      questions[0].topic,
      examBoard:  questions[0].exam_board_code,
      hintLevel:  Math.min(Math.max(parseInt(hint_level) || 1, 1), 3),
    });

    return res.status(200).json({ success: true, hint });

  } catch (err) {
    console.error('[POST /ai/hint]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate hint' });
  }
});

// ─── POST /api/ai/explain ─────────────────────────────────────────────────────
// Body: { question_id, selected_option_id }
// Returns: { explanation: string }
// Call this AFTER /api/questions/:id/answer has validated the answer
// ─────────────────────────────────────────────────────────────────────────────
router.post('/explain', protect, async (req, res) => {
  const { question_id, selected_option_id } = req.body;

  if (!question_id || !selected_option_id) {
    return res.status(400).json({ success: false, error: 'question_id and selected_option_id required' });
  }

  try {
    const questions = await sequelize.query(
      `SELECT q.question_text, q.topic, q.explanation, eb.code AS exam_board_code
       FROM questions q
       LEFT JOIN exam_boards eb ON q.exam_board_id = eb.id
       WHERE q.id = :id AND q.status = 'approved'`,
      { replacements: { id: question_id }, type: QueryTypes.SELECT }
    );

    if (!questions.length) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const allOptions = await sequelize.query(
      `SELECT id, option_text, is_correct FROM answer_options WHERE question_id = :id ORDER BY id ASC`,
      { replacements: { id: question_id }, type: QueryTypes.SELECT }
    );

    const selectedOption = allOptions.find(o => String(o.id) === String(selected_option_id));
    const correctOption  = allOptions.find(o => o.is_correct);

    if (!selectedOption) {
      return res.status(400).json({ success: false, error: 'Invalid selected_option_id' });
    }

    const explanation = await generateExplanation({
      questionText:      questions[0].question_text,
      options:           allOptions,
      correctOptionText: correctOption?.option_text || '',
      selectedOptionText: selectedOption.option_text,
      wasCorrect:        selectedOption.is_correct,
      existingExplanation: questions[0].explanation,
      topic:             questions[0].topic,
      examBoard:         questions[0].exam_board_code,
    });

    return res.status(200).json({ success: true, explanation });

  } catch (err) {
    console.error('[POST /ai/explain]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate explanation' });
  }
});

// ─── GET /api/ai/predict-grade/:studentId/:subjectId ─────────────────────────
// Returns: { predictedGrade, confidence, weakestTopics[], studyAdvice }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/predict-grade/:studentId/:subjectId', protect, async (req, res) => {
  const { studentId, subjectId } = req.params;

  // Students can only access their own prediction; admins/teachers can access any
  if (req.user.role === 'student' && req.user.id !== studentId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    // Overall stats
    const overallStats = await sequelize.query(
      `SELECT
         COUNT(*) AS total_attempts,
         AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END) AS overall_correct_pct,
         AVG(pa.time_taken_ms) AS avg_time_ms
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE pa.student_id = :studentId AND q.subject_id = :subjectId`,
      { replacements: { studentId, subjectId }, type: QueryTypes.SELECT }
    );

    // Per-topic stats
    const topicStats = await sequelize.query(
      `SELECT
         q.topic AS name,
         AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END) AS correct_pct,
         COUNT(*) AS attempts_count
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE pa.student_id = :studentId AND q.subject_id = :subjectId AND q.topic IS NOT NULL
       GROUP BY q.topic
       ORDER BY correct_pct ASC`,
      { replacements: { studentId, subjectId }, type: QueryTypes.SELECT }
    );

    // Subject + exam board name
    const subjectInfo = await sequelize.query(
      `SELECT s.name AS subject_name, eb.name AS exam_board_name
       FROM subjects s
       LEFT JOIN exam_boards eb ON s.exam_board_id = eb.id
       WHERE s.id = :subjectId`,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    const stats = overallStats[0];
    const prediction = await predictGrade({
      subjectName:        subjectInfo[0]?.subject_name || 'Unknown Subject',
      examBoard:          subjectInfo[0]?.exam_board_name || 'IGCSE',
      topics:             topicStats.map(t => ({
        name:          t.name,
        correctPct:    parseFloat(t.correct_pct) || 0,
        attemptsCount: parseInt(t.attempts_count) || 0,
      })),
      overallCorrectPct:  parseFloat(stats.overall_correct_pct) || 0,
      totalAttempts:      parseInt(stats.total_attempts) || 0,
      avgTimePerQuestionMs: parseFloat(stats.avg_time_ms) || 0,
    });

    return res.status(200).json({ success: true, data: prediction });

  } catch (err) {
    console.error('[GET /ai/predict-grade]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate grade prediction' });
  }
});

// ─── POST /api/ai/notes/generate ─────────────────────────────────────────────
// Body: { subject_id, topic_name }
// Returns: { notes: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/notes/generate', protect, async (req, res) => {
  const { subject_id, topic_name } = req.body;

  if (!subject_id || !topic_name) {
    return res.status(400).json({ success: false, error: 'subject_id and topic_name required' });
  }

  try {
    const subjectInfo = await sequelize.query(
      `SELECT s.name AS subject_name, eb.name AS exam_board_name
       FROM subjects s
       LEFT JOIN exam_boards eb ON s.exam_board_id = eb.id
       WHERE s.id = :subject_id`,
      { replacements: { subject_id }, type: QueryTypes.SELECT }
    );

    if (!subjectInfo.length) {
      return res.status(404).json({ success: false, error: 'Subject not found' });
    }

    const notes = await generateRevisionNotes({
      subjectName: subjectInfo[0].subject_name,
      topicName:   topic_name,
      examBoard:   subjectInfo[0].exam_board_name,
    });

    return res.status(200).json({ success: true, notes });

  } catch (err) {
    console.error('[POST /ai/notes/generate]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate notes' });
  }
});

// ─── GET /api/ai/cohort-gaps/:subjectId ──────────────────────────────────────
// Teacher/admin only — class-wide gap analysis with AI intervention advice
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cohort-gaps/:subjectId', protect, authorize('teacher', 'admin'), async (req, res) => {
  const { subjectId } = req.params;

  try {
    const cohortTopics = await sequelize.query(
      `SELECT
         q.topic AS name,
         AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END) AS avg_correct_pct,
         COUNT(DISTINCT pa.student_id) FILTER (
           WHERE (
             SELECT AVG(CASE WHEN pa2.is_correct THEN 100.0 ELSE 0.0 END)
             FROM practice_attempts pa2
             JOIN questions q2 ON pa2.question_id = q2.id
             WHERE pa2.student_id = pa.student_id AND q2.subject_id = :subjectId AND q2.topic = q.topic
           ) < 60
         ) AS students_below_60_pct
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE q.subject_id = :subjectId AND q.topic IS NOT NULL
       GROUP BY q.topic
       HAVING COUNT(*) >= 5
       ORDER BY avg_correct_pct ASC`,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    const studentCount = await sequelize.query(
      `SELECT COUNT(DISTINCT pa.student_id) AS count
       FROM practice_attempts pa
       JOIN questions q ON pa.question_id = q.id
       WHERE q.subject_id = :subjectId`,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    const subjectInfo = await sequelize.query(
      `SELECT s.name, eb.name AS board FROM subjects s LEFT JOIN exam_boards eb ON s.exam_board_id = eb.id WHERE s.id = :subjectId`,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    const interventionAdvice = await analyzeCohortGaps({
      subjectName:   subjectInfo[0]?.name || 'Subject',
      examBoard:     subjectInfo[0]?.board || 'IGCSE',
      cohortTopics:  cohortTopics.map(t => ({
        name:                t.name,
        avgCorrectPct:       parseFloat(t.avg_correct_pct) || 0,
        studentsBelow60Pct:  parseInt(t.students_below_60_pct) || 0,
      })),
      studentCount: parseInt(studentCount[0]?.count) || 0,
    });

    return res.status(200).json({
      success: true,
      data: {
        topics:             cohortTopics,
        interventionAdvice,
        studentCount:       parseInt(studentCount[0]?.count) || 0,
      }
    });

  } catch (err) {
    console.error('[GET /ai/cohort-gaps]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to analyse cohort gaps' });
  }
});

module.exports = router;
