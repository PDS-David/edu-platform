const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

// POST /api/student/join-class
router.post('/join-class', protect, async (req, res) => {
  try {
    const { join_code } = req.body;
    const student_id = req.user.id;
    if (!join_code) return res.status(400).json({ error: 'join_code required' });

    const classes = await sequelize.query(
      'SELECT id, name FROM classes WHERE join_code = :join_code',
      { replacements: { join_code }, type: QueryTypes.SELECT }
    );
    if (!classes.length) return res.status(404).json({ error: 'Class not found' });
    const cls = classes[0];

    await sequelize.query(
      'INSERT INTO class_memberships (class_id, student_id) VALUES (:class_id, :student_id) ON CONFLICT DO NOTHING',
      { replacements: { class_id: cls.id, student_id }, type: QueryTypes.INSERT }
    );
    res.json({ success: true, data: { class_id: cls.id, class_name: cls.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/student/tests
router.get('/tests', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ta.id, ta.title, ta.time_limit_minutes, ta.due_date,
              ts.submitted_at, ts.accuracy_pct,
              u.first_name || ' ' || u.last_name AS teacher_name
       FROM test_assignments ta
       JOIN classes c ON c.id = ta.class_id
       JOIN class_memberships cm ON cm.class_id = c.id AND cm.student_id = :student_id
       JOIN users u ON u.id = ta.teacher_id
       LEFT JOIN test_submissions ts ON ts.assignment_id = ta.id AND ts.student_id = :student_id
       ORDER BY ta.created_at DESC`,
      { replacements: { student_id: req.user.id }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/student/test/:testId
router.get('/test/:testId', protect, async (req, res) => {
  try {
    const { testId } = req.params;
    const tests = await sequelize.query(
      `SELECT ta.id, ta.title, ta.time_limit_minutes,
              u.first_name || ' ' || u.last_name AS teacher_name
       FROM test_assignments ta
       JOIN users u ON u.id = ta.teacher_id
       WHERE ta.id = :testId`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );
    if (!tests.length) return res.status(404).json({ error: 'Test not found' });
    const test = tests[0];

    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.difficulty, q.question_sub_type,
              json_agg(json_build_object(
                'id', ao.id, 'option_text', ao.option_text, 'order_index', ao.order_index
              ) ORDER BY ao.order_index) AS options
       FROM questions q
       JOIN answer_options ao ON ao.question_id = q.id
       WHERE q.id = ANY(
         SELECT jsonb_array_elements_text(question_ids)::uuid FROM test_assignments WHERE id = :testId
       )
       GROUP BY q.id`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );
    test.questions = questions;
    res.json({ success: true, data: test });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/student/test/:testId/submit
router.post('/test/:testId/submit', protect, async (req, res) => {
  try {
    const { testId } = req.params;
    const { answers, total_time_ms } = req.body;
    const student_id = req.user.id;

    let correct = 0;
    for (const ans of answers) {
      if (!ans.selected_option_id) continue;
      const rows = await sequelize.query(
        'SELECT is_correct FROM answer_options WHERE id = :optId AND question_id = :qId',
        { replacements: { optId: ans.selected_option_id, qId: ans.question_id }, type: QueryTypes.SELECT }
      );
      if (rows[0]?.is_correct) correct++;
    }
    const total = answers.length;
    const accuracy_pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    await sequelize.query(
      `INSERT INTO test_submissions (assignment_id, student_id, answers, score, total, accuracy_pct, total_time_ms)
       VALUES (:testId, :student_id, :answers::jsonb, :score, :total, :accuracy_pct, :total_time_ms)
       ON CONFLICT (assignment_id, student_id) DO UPDATE
       SET answers=:answers::jsonb, score=:score, total=:total,
           accuracy_pct=:accuracy_pct, total_time_ms=:total_time_ms, submitted_at=NOW()`,
      {
        replacements: {
          testId, student_id,
          answers: JSON.stringify(answers),
          score: correct, total, accuracy_pct, total_time_ms,
        },
        type: QueryTypes.INSERT,
      }
    );
    res.json({ success: true, data: { correct, total, accuracy_pct } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
