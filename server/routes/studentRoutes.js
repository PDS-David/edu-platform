// server/routes/studentRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// FIXES in this version:
//   1. GET /student/tests — now reads from test_assignments JOIN custom_tests
//      (the correct schema) instead of a test_assignments table that has a
//      different shape.
//   2. GET /student/test/:testId — reads questions via test_questions JOIN
//      questions (correct schema).
//   3. POST /student/test/:testId/submit — correctly resolves testId through
//      test_assignments → custom_tests.
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

// ── POST /api/student/join-class ──────────────────────────────────────────────
router.post('/join-class', protect, async (req, res) => {
  const { join_code } = req.body;
  const student_id    = req.user.id;
  if (!join_code) return res.status(400).json({ success: false, error: 'join_code is required' });

  try {
    const classes = await sequelize.query(
      `SELECT id, name FROM classes WHERE UPPER(join_code) = UPPER(:join_code)`,
      { replacements: { join_code: join_code.trim() }, type: QueryTypes.SELECT }
    );
    if (!classes.length) return res.status(404).json({ success: false, error: 'Invalid join code' });
    const cls = classes[0];

    await sequelize.query(
      `INSERT INTO class_memberships (id, class_id, student_id, joined_at)
       VALUES (gen_random_uuid(), :class_id, :student_id, NOW())
       ON CONFLICT (class_id, student_id) DO NOTHING`,
      { replacements: { class_id: cls.id, student_id }, type: QueryTypes.INSERT }
    );
    return res.json({ success: true, data: { class_id: cls.id, class_name: cls.name } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/student/tests ────────────────────────────────────────────────────
// FIX: now reads from test_assignments JOIN custom_tests (correct schema).
router.get('/tests', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         ct.id,
         ct.title,
         ct.duration_minutes       AS time_limit_minutes,
         ta.due_date,
         ta.submitted_at,
         ta.percentage             AS accuracy_pct,
         u.first_name || ' ' || u.last_name AS teacher_name
       FROM test_assignments ta
       JOIN custom_tests ct ON ct.id = ta.test_id
       JOIN users u         ON u.id  = ct.teacher_id
       WHERE ta.student_id = :student_id
       ORDER BY ta.assigned_at DESC`,
      { replacements: { student_id: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/student/test/:testId ─────────────────────────────────────────────
// FIX: reads via test_questions JOIN questions (correct schema).
router.get('/test/:testId', protect, async (req, res) => {
  const { testId } = req.params;
  try {
    const tests = await sequelize.query(
      `SELECT ct.id, ct.title, ct.duration_minutes AS time_limit_minutes,
              u.first_name || ' ' || u.last_name AS teacher_name
       FROM custom_tests ct
       JOIN users u ON u.id = ct.teacher_id
       WHERE ct.id = :testId`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );
    if (!tests.length) return res.status(404).json({ success: false, error: 'Test not found' });
    const test = tests[0];

    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.difficulty, q.question_sub_type,
              tq.question_order,
              json_agg(
                json_build_object(
                  'id',          ao.id,
                  'option_text', ao.option_text,
                  'order_index', ao.order_index
                ) ORDER BY ao.order_index
              ) AS options
       FROM test_questions tq
       JOIN questions q      ON q.id  = tq.question_id
       JOIN answer_options ao ON ao.question_id = q.id
       WHERE tq.test_id = :testId
       GROUP BY q.id, tq.question_order
       ORDER BY tq.question_order`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    test.questions = questions;
    return res.json({ success: true, data: test });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/student/test/:testId/submit ─────────────────────────────────────
// testId here is the custom_tests.id (same as what we pass to the student).
router.post('/test/:testId/submit', protect, async (req, res) => {
  const { testId }                  = req.params;
  const { answers = [], total_time_ms } = req.body;
  const student_id                  = req.user.id;

  try {
    let correct = 0;
    for (const ans of answers) {
      if (!ans.selected_option_id) continue;
      const rows = await sequelize.query(
        `SELECT is_correct FROM answer_options
         WHERE id = :optId AND question_id = :qId`,
        {
          replacements: { optId: ans.selected_option_id, qId: ans.question_id },
          type: QueryTypes.SELECT,
        }
      );
      if (rows[0]?.is_correct) correct++;
    }

    const total       = answers.length;
    const accuracy_pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const percentage   = accuracy_pct;

    // Find the test_assignment row for this student
    const assignment = await sequelize.query(
      `SELECT id FROM test_assignments WHERE test_id = :testId AND student_id = :student_id`,
      { replacements: { testId, student_id }, type: QueryTypes.SELECT }
    );

    if (assignment.length) {
      // Update existing assignment
      await sequelize.query(
        `UPDATE test_assignments
         SET is_submitted = true, submitted_at = NOW(),
             score_obtained = :score, percentage = :pct, auto_graded = true
         WHERE id = :id`,
        {
          replacements: { id: assignment[0].id, score: correct, pct: percentage },
          type: QueryTypes.UPDATE,
        }
      );
    }

    // Also persist into test_submissions for the teacher view
    await sequelize.query(
      `INSERT INTO test_submissions
         (id, assignment_id, student_id, answers, score, total, accuracy_pct, total_time_ms)
       SELECT gen_random_uuid(), ta.id, :student_id, :answers::jsonb,
              :score, :total, :accuracy_pct, :total_time_ms
       FROM test_assignments ta
       WHERE ta.test_id = :testId AND ta.student_id = :student_id
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET answers = :answers::jsonb, score = :score, total = :total,
                     accuracy_pct = :accuracy_pct, total_time_ms = :total_time_ms,
                     submitted_at = NOW()`,
      {
        replacements: {
          student_id,
          answers:      JSON.stringify(answers),
          score:        correct,
          total,
          accuracy_pct,
          total_time_ms: total_time_ms || null,
          testId,
        },
        type: QueryTypes.INSERT,
      }
    );

    return res.json({ success: true, data: { correct, total, accuracy_pct } });
  } catch (err) {
    console.error('[POST /student/test/submit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/students/remediation
// Generates targeted AI practice questions for the student's weak concepts.
// Returns { conceptSets: [{ concept_name, mastery_score, questions: [...] }] }
// No body required — uses req.user.id from JWT.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/remediation', protect, async (req, res) => {
  try {
    const { generateRemediationSet } = require('../services/remediationService');
    const result = await generateRemediationSet(req.user.id);

    return res.status(200).json({
      success: true,
      data:    result,
    });
  } catch (err) {
    console.error('[POST /students/remediation]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to generate remediation set: ' + err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/students/remediation/status
// Returns whether the student has any weak concepts without generating questions.
// Useful for the dashboard to decide whether to show the remediation prompt.
// ─────────────────────────────────────────────────────────────────────────────
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

module.exports = router;
