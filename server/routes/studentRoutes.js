'use strict';
// server/routes/studentRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Student-specific endpoints:
//   POST /api/students/join-class          — join a class with join code
//   GET  /api/students/performance         — performance data for dashboard
//   POST /api/students/remediation         — generate targeted AI questions
//   GET  /api/students/remediation/status  — check if student has weak concepts
//   POST /api/students/test/:testId/submit — submit a teacher-assigned test
//   GET  /api/students/test/:testId        — get test details for StudentTestPage
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

const UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// ── POST /api/students/join-class ─────────────────────────────────────────────
router.post('/join-class', protect, async (req, res) => {
  const { join_code } = req.body;
  if (!join_code?.trim()) {
    return res.status(400).json({ success: false, error: 'join_code is required' });
  }
  try {
    let classes = [];
    try {
      classes = await sequelize.query(
        `SELECT id, name FROM classes WHERE UPPER(join_code) = UPPER(:code)`,
        { replacements: { code: join_code.trim() }, type: QueryTypes.SELECT }
      );
    } catch { return res.status(404).json({ success: false, error: 'Class system not yet active.' }); }
    if (!classes.length) {
      return res.status(404).json({ success: false, error: 'Invalid join code. Please check and try again.' });
    }
    const cls = classes[0];
    await sequelize.query(
      `INSERT INTO class_memberships (class_id, student_id, joined_at)
       VALUES (:classId, :studentId, NOW())
       ON CONFLICT (class_id, student_id) DO NOTHING`,
      { replacements: { classId: cls.id, studentId: req.user.id }, type: QueryTypes.INSERT }
    );
    return res.status(200).json({ success: true, message: `Joined "${cls.name}" successfully`, data: { class_name: cls.name } });
  } catch (err) {
    console.error('[POST /students/join-class]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/students/performance ─────────────────────────────────────────────
// Returns performance data for a student's subject (for My Performance tab)
router.get('/performance', protect, async (req, res) => {
  const { subject_id } = req.query;
  const studentId = req.user.id;

  try {
    const filters      = ['sp.student_id = :studentId'];
    const replacements = { studentId };

    if (subject_id && isValidUUID(subject_id)) {
      filters.push('st.subject_id = :subjectId');
      replacements.subjectId = subject_id;
    }

    const [subtopicPerf, studyTime] = await Promise.all([
      sequelize.query(
        `SELECT
           st.id, st.name,
           CASE WHEN sp.resources_completed AND sp.practice_completed AND sp.quiz_completed
                THEN 'complete' ELSE 'in_progress' END AS completion,
           COUNT(pa.id)::INTEGER  AS attempts,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS score_avg,
           MAX(pa.attempted_at) AS last_attempt,
           CASE WHEN COUNT(pa.id) >= 2 AND
                     (SELECT ROUND(AVG(CASE WHEN pa2.is_correct THEN 100.0 ELSE 0 END),1)
                      FROM practice_attempts pa2
                      JOIN questions q2 ON q2.id = pa2.question_id
                      WHERE pa2.student_id = sp.student_id AND q2.subtopic_id = st.id
                      ORDER BY pa2.attempted_at DESC LIMIT 3) >
                     (SELECT ROUND(AVG(CASE WHEN pa3.is_correct THEN 100.0 ELSE 0 END),1)
                      FROM practice_attempts pa3
                      JOIN questions q3 ON q3.id = pa3.question_id
                      WHERE pa3.student_id = sp.student_id AND q3.subtopic_id = st.id
                      ORDER BY pa3.attempted_at ASC LIMIT 3)
                THEN 'up'
                ELSE 'down' END AS trend
         FROM subtopic_progress sp
         JOIN subtopics st ON sp.subtopic_id = st.id
         LEFT JOIN practice_attempts pa ON pa.student_id = sp.student_id
           AND pa.question_id IN (SELECT id FROM questions WHERE subtopic_id = st.id)
         WHERE ${filters.join(' AND ')}
         GROUP BY st.id, st.name, sp.resources_completed, sp.practice_completed, sp.quiz_completed, sp.student_id
         ORDER BY score_avg ASC NULLS LAST`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COALESCE(SUM(time_taken_seconds), 0)::BIGINT AS total_ms
         FROM practice_attempts
         WHERE student_id = :studentId
           AND attempted_at > NOW() - INTERVAL '30 days'`,
        { replacements: { studentId }, type: QueryTypes.SELECT }
      ),
    ]);

    const totalSecs  = parseInt(studyTime[0]?.total_ms || 0);
    const perfMins   = Math.floor(totalSecs / 60);
    const perfSecs   = totalSecs % 60;

    const strengthRows = subtopicPerf.filter(r => (r.score_avg || 0) >= 60).slice(0, 5);
    const weaknessRows = subtopicPerf.filter(r => (r.score_avg || 100) < 60).slice(0, 5);

    return res.status(200).json({
      success: true,
      data: {
        strength_rows: strengthRows,
        weakness_rows: weaknessRows,
        perf_mins:     perfMins,
        perf_secs:     perfSecs,
        study_dates:   [], // Placeholder — expand if needed
      },
    });
  } catch (err) {
    console.error('[GET /students/performance]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/students/remediation ───────────────────────────────────────────
// Generates targeted AI practice questions for the student's weak concepts.
// Returns { conceptSets: [{ concept_name, mastery_score, questions: [...] }] }
router.post('/remediation', protect, async (req, res) => {
  try {
    const { generateRemediationSet } = require('../services/remediationService');
    const result = await generateRemediationSet(req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[POST /students/remediation]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to generate remediation set: ' + err.message,
    });
  }
});

// ── GET /api/students/remediation/status ─────────────────────────────────────
// Returns whether student has weak concepts without generating questions.
router.get('/remediation/status', protect, async (req, res) => {
  try {
    const { getWeakConcepts } = require('../services/weakConceptService');
    const weakConcepts = await getWeakConcepts(req.user.id);
    return res.status(200).json({
      success:            true,
      has_weak_concepts:  weakConcepts.length > 0,
      weak_concept_count: weakConcepts.length,
      concepts:           weakConcepts.map(c => ({
        id:            c.id,
        name:          c.name,
        mastery_score: c.mastery_score,
      })),
    });
  } catch (err) {
    console.error('[GET /students/remediation/status]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/students/test/:testId ───────────────────────────────────────────
// Returns test details + questions for StudentTestPage.jsx
router.get('/test/:testId', protect, async (req, res) => {
  const { testId } = req.params;
  if (!isValidUUID(testId)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID' });
  }
  try {
    const tests = await sequelize.query(
      `SELECT ct.id, ct.title, ct.duration_minutes, ct.total_marks,
              u.first_name || ' ' || u.last_name AS teacher_name
       FROM custom_tests ct
       JOIN users u ON u.id = ct.teacher_id
       WHERE ct.id = :testId AND ct.is_published = true`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );
    if (!tests.length) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }
    const test = tests[0];

    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.marks, q.difficulty,
              tq.question_order,
              q.options
       FROM test_questions tq
       JOIN questions q ON q.id = tq.question_id
       WHERE tq.test_id = :testId
       ORDER BY tq.question_order ASC`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      data: { ...test, questions },
    });
  } catch (err) {
    console.error(`[GET /students/test/${testId}]`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/students/test/:testId/submit ───────────────────────────────────
// Submits a student's test answers.
// Body: { answers: [{ question_id, selected_option_id }], total_time_ms }
router.post('/test/:testId/submit', protect, async (req, res) => {
  const { testId } = req.params;
  if (!isValidUUID(testId)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID' });
  }

  const { answers = [], total_time_ms = 0 } = req.body;
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ success: false, error: 'answers array is required' });
  }

  try {
    // Resolve correct options for all questions
    const questionIds = answers.map(a => a.question_id).filter(Boolean);
    // Use correct_answer from questions table (JSONB options approach)
    const questionRows = await sequelize.query(
      `SELECT id, correct_answer FROM questions WHERE id = ANY(:questionIds::int[])`,
      { replacements: { questionIds }, type: QueryTypes.SELECT }
    );
    const correctMap = {};
    for (const r of questionRows) {
      correctMap[r.id] = String(r.correct_answer || '');
    }

    let correct = 0;
    const total  = answers.length;

    for (const answer of answers) {
      const isCorrect = answer.selected_answer !== undefined
        ? String(answer.selected_answer).trim().toLowerCase() === (correctMap[answer.question_id] || '').trim().toLowerCase()
        : answer.selected_option_id
        ? String(answer.selected_option_id) === correctMap[answer.question_id]
        : false;
      if (isCorrect) correct++;

      // Record practice attempt
      sequelize.query(
        `INSERT INTO practice_attempts (student_id, question_id, is_correct, time_taken_seconds, attempted_at)
         VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW())`,
        {
          replacements: {
            studentId:  req.user.id,
            questionId: answer.question_id,
            isCorrect:  isCorrect,
            timeTaken:  Math.round((answer.time_taken_ms || 0) / 1000),
          },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});
    }

    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Mark test assignment as completed
    sequelize.query(
      `UPDATE test_assignments SET completed_at = NOW(), score = :score
       WHERE test_id = :testId AND student_id = :studentId`,
      { replacements: { score: correct, testId, studentId: req.user.id }, type: QueryTypes.UPDATE }
    ).catch(() => {});

    return res.status(200).json({
      success:      true,
      correct,
      total,
      accuracy_pct: accuracyPct,
    });
  } catch (err) {
    console.error(`[POST /students/test/${testId}/submit]`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
