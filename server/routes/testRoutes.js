// server/routes/testRoutes.js
// POST /api/teacher/tests              — create a test assignment
// GET  /api/student/tests              — student's assigned tests
// GET  /api/student/test/:testId       — test detail + questions
// POST /api/student/test/:testId/submit

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

const teacherOnly = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  next();
};

// ── POST /api/teacher/tests ───────────────────────────────────────────────────
router.post('/teacher/tests', protect, teacherOnly, async (req, res) => {
  const {
    title, subject_id, exam_board_id, description, instructions,
    duration_minutes = 60, total_marks = 100, passing_marks = 40,
    difficulty, question_count = 10, topic_ids = [],
    student_ids = [], due_date,
  } = req.body;

  if (!title || !subject_id)
    return res.status(400).json({ success: false, error: 'title and subject_id are required' });

  try {
    // 1. SELECT random approved questions matching criteria
    const conditions = ['subject_id_uuid = :subject_id', "status = 'approved'"];
    const replacements = { subject_id, count: question_count };

    if (topic_ids.length > 0) {
      conditions.push('topic = ANY(:topics)');
      replacements.topics = topic_ids;
    }
    if (difficulty) {
      conditions.push('difficulty = :difficulty');
      replacements.difficulty = difficulty;
    }

    const questions = await sequelize.query(
      `SELECT id FROM questions WHERE ${conditions.join(' AND ')}
       ORDER BY RANDOM() LIMIT :count`,
      { replacements, type: QueryTypes.SELECT }
    );

    if (questions.length === 0)
      return res.status(404).json({ success: false, error: 'No questions match the selected criteria' });

    // 2. INSERT into custom_tests
    const testResult = await sequelize.query(
      `INSERT INTO custom_tests
         (id, teacher_id, subject_id, exam_board_id, title, description, instructions,
          duration_minutes, total_marks, passing_marks, is_published, created_at, updated_at)
       VALUES
         (gen_random_uuid(), :teacherId, :subjectId, :examBoardId, :title, :description,
          :instructions, :durationMinutes, :totalMarks, :passingMarks, false, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          teacherId:       req.user.id,
          subjectId:       subject_id,
          examBoardId:     exam_board_id || null,
          title,
          description:     description   || null,
          instructions:    instructions  || null,
          durationMinutes: duration_minutes,
          totalMarks:      total_marks,
          passingMarks:    passing_marks,
        },
        type: QueryTypes.INSERT,
      }
    );

    const testId = testResult[0][0].id;

    // 3. INSERT each question into test_questions
    for (let i = 0; i < questions.length; i++) {
      await sequelize.query(
        `INSERT INTO test_questions (id, test_id, question_id, question_order, created_at)
         VALUES (gen_random_uuid(), :testId, :questionId, :questionOrder, NOW())
         ON CONFLICT (test_id, question_id) DO NOTHING`,
        {
          replacements: { testId, questionId: questions[i].id, questionOrder: i + 1 },
          type: QueryTypes.INSERT,
        }
      );
    }

    // 4. INSERT into test_assignments for each student
    let studentsAssigned = 0;
    for (const studentId of student_ids) {
      await sequelize.query(
        `INSERT INTO test_assignments
           (id, test_id, student_id, due_date, assigned_at)
         VALUES
           (gen_random_uuid(), :testId, :studentId, :dueDate, NOW())
         ON CONFLICT (test_id, student_id) DO NOTHING`,
        {
          replacements: { testId, studentId, dueDate: due_date || null },
          type: QueryTypes.INSERT,
        }
      );
      studentsAssigned++;
    }

    // 5. Return result
    return res.status(201).json({
      success: true,
      data: {
        test_id:           testId,
        question_count:    questions.length,
        students_assigned: studentsAssigned,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/student/tests ────────────────────────────────────────────────────
router.get('/student/tests', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         ta.id, ct.title, ct.duration_minutes, ta.due_date, ta.is_submitted,
         ta.assigned_at,
         ts.submitted_at, ts.accuracy_pct,
         u.first_name || ' ' || u.last_name AS teacher_name,
         (SELECT COUNT(*)::INTEGER FROM test_questions tq WHERE tq.test_id = ct.id)
           AS question_count
       FROM test_assignments ta
       JOIN custom_tests ct ON ct.id = ta.test_id
       JOIN users        u  ON u.id  = ct.teacher_id
       LEFT JOIN test_submissions ts
         ON ts.assignment_id = ta.id AND ts.student_id = :studentId
       WHERE ta.student_id = :studentId
       ORDER BY ta.assigned_at DESC`,
      { replacements: { studentId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/student/test/:testId ─────────────────────────────────────────────
// testId is the test_assignments.id
router.get('/student/test/:testId', protect, async (req, res) => {
  try {
    // 1. Fetch assignment + custom_test, enforce ownership
    const assignments = await sequelize.query(
      `SELECT
         ta.id AS assignment_id, ta.due_date, ta.is_submitted, ta.assigned_at,
         ct.id AS test_id, ct.title, ct.duration_minutes, ct.instructions,
         ct.total_marks, ct.passing_marks, ct.shuffle_questions,
         ct.show_answers_after_submission,
         u.first_name || ' ' || u.last_name AS teacher_name
       FROM test_assignments ta
       JOIN custom_tests ct ON ct.id = ta.test_id
       JOIN users        u  ON u.id  = ct.teacher_id
       WHERE ta.id = :testId AND ta.student_id = :studentId`,
      { replacements: { testId: req.params.testId, studentId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!assignments.length)
      return res.status(404).json({ success: false, error: 'Test not found' });

    const assignment = assignments[0];

    // 2. Fetch questions via test_questions join; omit is_correct from options
    const questions = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.difficulty, q.marks, q.question_type,
         tq.question_order,
         json_agg(
           json_build_object('id', ao.id, 'option_text', ao.option_text)
           ORDER BY ao.id
         ) AS options
       FROM test_questions tq
       JOIN questions      q  ON q.id  = tq.question_id
       JOIN answer_options ao ON ao.question_id = q.id
       WHERE tq.test_id = :testId
       GROUP BY q.id, q.question_text, q.difficulty, q.marks, q.question_type, tq.question_order
       ORDER BY tq.question_order ASC`,
      { replacements: { testId: assignment.test_id }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: { ...assignment, questions },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/student/test/:testId/submit ─────────────────────────────────────
// testId is the test_assignments.id
router.post('/student/test/:testId/submit', protect, async (req, res) => {
  const { answers = [], total_time_ms } = req.body;
  const assignmentId = req.params.testId;
  const studentId    = req.user.id;

  try {
    // Verify this assignment belongs to the student
    const ownership = await sequelize.query(
      `SELECT ta.id, ct.total_marks
       FROM test_assignments ta
       JOIN custom_tests ct ON ct.id = ta.test_id
       WHERE ta.id = :assignmentId AND ta.student_id = :studentId`,
      { replacements: { assignmentId, studentId }, type: QueryTypes.SELECT }
    );
    if (!ownership.length)
      return res.status(404).json({ success: false, error: 'Test assignment not found' });

    // 1. Validate each answer against answer_options.is_correct
    let correct = 0;
    for (const a of answers) {
      if (!a.selected_option_id) continue;
      const opt = await sequelize.query(
        `SELECT is_correct FROM answer_options WHERE id = :optId AND question_id = :qId`,
        { replacements: { optId: a.selected_option_id, qId: a.question_id }, type: QueryTypes.SELECT }
      );
      if (opt[0]?.is_correct) correct++;
    }

    const total       = answers.length;
    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // 2. INSERT into test_submissions (with score, total, accuracy_pct)
    await sequelize.query(
      `INSERT INTO test_submissions
         (id, assignment_id, student_id, answers, score, total, accuracy_pct, total_time_ms, submitted_at)
       VALUES
         (gen_random_uuid(), :assignmentId, :studentId, :answers::jsonb,
          :score, :total, :accuracyPct, :timeMs, NOW())
       ON CONFLICT (assignment_id, student_id) DO UPDATE
         SET answers      = EXCLUDED.answers,
             score        = EXCLUDED.score,
             total        = EXCLUDED.total,
             accuracy_pct = EXCLUDED.accuracy_pct,
             total_time_ms = EXCLUDED.total_time_ms,
             submitted_at = NOW()`,
      {
        replacements: {
          assignmentId,
          studentId,
          answers:     JSON.stringify(answers),
          score:       correct,
          total,
          accuracyPct,
          timeMs:      total_time_ms || null,
        },
        type: QueryTypes.INSERT,
      }
    );

    // 3. UPDATE test_assignments to mark submitted
    await sequelize.query(
      `UPDATE test_assignments
       SET is_submitted   = true,
           submitted_at   = NOW(),
           score_obtained = :score,
           percentage     = :accuracyPct
       WHERE id = :assignmentId AND student_id = :studentId`,
      { replacements: { assignmentId, studentId, score: correct, accuracyPct }, type: QueryTypes.UPDATE }
    );

    // 4. Return result
    return res.json({
      success: true,
      data: { correct, total, accuracy_pct: accuracyPct },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
