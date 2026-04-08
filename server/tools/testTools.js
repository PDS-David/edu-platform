// server/tools/testTools.js
// ---------------------------------------------------------------------------
// AI-callable tool: custom test generation and retrieval.
//
// Wraps:
//   server/routes/teacherRoutes.js  (POST /teacher/tests — test creation logic)
//   server/routes/studentRoutes.js  (GET  /student/tests — student test list)
//
// The actual DB schema is:
//   custom_tests      — test metadata (title, duration, teacher_id)
//   test_questions    — join table (test_id, question_id, order)
//   test_assignments  — maps a test to a student (student_id, test_id, due_date)
//
// Does NOT modify any existing route or file.
// ---------------------------------------------------------------------------

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// ---------------------------------------------------------------------------
// generateTest(userId, options)
//
// Creates a new custom test in the DB and returns the full test payload.
// Mirrors the logic in POST /api/teacher/tests but is callable from the AI
// layer without going through HTTP.
//
// @param {string} userId     UUID of the teacher creating the test
// @param {object} options
//   title           {string}  Required
//   subject_id      {string}  UUID — scope questions to one subject
//   difficulty      {string}  'easy' | 'medium' | 'hard' | 'mixed'
//   question_count  {number}  5-40 (default 10)
//   time_limit_minutes {number} (default 30)
//   due_date        {string}  ISO date string (optional)
//   class_id        {string}  UUID — assign to a class (optional)
//
// Output shape:
// {
//   id, title, question_count, time_limit_minutes, subject_id,
//   questions: [ { id, question_text, difficulty, options: [...] } ]
// }
// ---------------------------------------------------------------------------
async function generateTest(userId, options = {}) {
  if (!userId) {
    return toolError('generateTest', 'userId is required');
  }

  const {
    title,
    subject_id         = null,
    difficulty         = 'mixed',
    question_count     = 10,
    time_limit_minutes = 30,
    due_date           = null,
    class_id           = null,
  } = options;

  if (!title || !String(title).trim()) {
    return toolError('generateTest', 'title is required');
  }

  const qCount = Math.min(Math.max(parseInt(question_count) || 10, 5), 40);

  try {
    // 1. Select random approved questions matching criteria
    const diffFilter = difficulty !== 'mixed' ? 'AND q.difficulty = :difficulty' : '';
    const subjFilter = subject_id ? 'AND q.subject_id_uuid = :subject_id' : '';

    const replacements = { qCount };
    if (difficulty !== 'mixed') replacements.difficulty = difficulty;
    if (subject_id)              replacements.subject_id = subject_id;

    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.difficulty, q.topic, q.explanation
       FROM questions q
       WHERE q.status = 'approved'
         ${diffFilter}
         ${subjFilter}
       ORDER BY RANDOM()
       LIMIT :qCount`,
      { replacements, type: QueryTypes.SELECT }
    );

    if (!questions.length) {
      return toolError(
        'generateTest',
        'No approved questions found matching the given criteria.',
        null,
        404
      );
    }

    // 2. Create the custom_tests row
    const testRows = await sequelize.query(
      `INSERT INTO custom_tests
         (id, teacher_id, title, duration_minutes, total_marks, is_published, created_at)
       VALUES
         (gen_random_uuid(), :teacherId, :title, :duration, :totalMarks, false, NOW())
       RETURNING id`,
      {
        replacements: {
          teacherId:  userId,
          title:      String(title).trim(),
          duration:   Math.max(parseInt(time_limit_minutes) || 30, 5),
          totalMarks: questions.length,
        },
        type: QueryTypes.SELECT,
      }
    );

    const testId = testRows[0].id;

    // 3. Insert test_questions rows
    for (let i = 0; i < questions.length; i++) {
      await sequelize.query(
        `INSERT INTO test_questions (id, test_id, question_id, question_order)
         VALUES (gen_random_uuid(), :testId, :questionId, :order)`,
        {
          replacements: { testId, questionId: questions[i].id, order: i + 1 },
          type: QueryTypes.INSERT,
        }
      );
    }

    // 4. Optionally assign to a class
    if (class_id) {
      const students = await sequelize.query(
        `SELECT student_id FROM class_memberships WHERE class_id = :class_id`,
        { replacements: { class_id }, type: QueryTypes.SELECT }
      );

      for (const { student_id } of students) {
        await sequelize.query(
          `INSERT INTO test_assignments
             (id, test_id, student_id, assigned_at, due_date)
           VALUES
             (gen_random_uuid(), :testId, :studentId, NOW(), :dueDate)
           ON CONFLICT DO NOTHING`,
          {
            replacements: { testId, studentId: student_id, dueDate: due_date || null },
            type: QueryTypes.INSERT,
          }
        );
      }
    }

    // 5. Fetch options for the response payload
    const questionIds = questions.map((q) => q.id);
    const options_rows = await sequelize.query(
      `SELECT ao.question_id, ao.id AS option_id, ao.option_text,
              ao.is_correct, ao.order_index
       FROM answer_options ao
       WHERE ao.question_id = ANY(:questionIds)
       ORDER BY ao.question_id, ao.order_index ASC`,
      { replacements: { questionIds }, type: QueryTypes.SELECT }
    );

    const optsByQid = {};
    for (const o of options_rows) {
      if (!optsByQid[o.question_id]) optsByQid[o.question_id] = [];
      optsByQid[o.question_id].push({
        id:         o.option_id,
        text:       o.option_text,
        is_correct: o.is_correct,
      });
    }

    const questionsWithOptions = questions.map((q) => ({
      id:            q.id,
      question_text: q.question_text,
      difficulty:    q.difficulty,
      topic:         q.topic,
      options:       optsByQid[q.id] || [],
    }));

    return toolSuccess('generateTest', {
      id:                testId,
      title:             String(title).trim(),
      question_count:    questions.length,
      time_limit_minutes: Math.max(parseInt(time_limit_minutes) || 30, 5),
      subject_id,
      class_id,
      due_date,
      questions: questionsWithOptions,
    });

  } catch (err) {
    return toolError('generateTest', err.message, err);
  }
}

// ---------------------------------------------------------------------------
// getStudentTests(userId)
//
// Returns all tests assigned to a student with submission status.
// Mirrors GET /api/student/tests.
// ---------------------------------------------------------------------------
async function getStudentTests(userId) {
  if (!userId) {
    return toolError('getStudentTests', 'userId is required');
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         ct.id,
         ct.title,
         ct.duration_minutes         AS time_limit_minutes,
         ta.due_date,
         ta.submitted_at,
         ta.percentage               AS accuracy_pct,
         u.first_name || ' ' || u.last_name AS teacher_name
       FROM test_assignments ta
       JOIN custom_tests ct ON ct.id = ta.test_id
       JOIN users u         ON u.id  = ct.teacher_id
       WHERE ta.student_id = :userId
       ORDER BY ta.assigned_at DESC`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    return toolSuccess('getStudentTests', { tests: rows });

  } catch (err) {
    return toolError('getStudentTests', err.message, err);
  }
}

// ---------------------------------------------------------------------------
// getTestDetails(testId, userId)
//
// Returns a single test with its questions and options.
// Used before the student begins a test.
// ---------------------------------------------------------------------------
async function getTestDetails(testId, userId) {
  if (!testId || !userId) {
    return toolError('getTestDetails', 'testId and userId are required');
  }

  try {
    const tests = await sequelize.query(
      `SELECT ct.id, ct.title, ct.duration_minutes AS time_limit_minutes,
              u.first_name || ' ' || u.last_name AS teacher_name
       FROM custom_tests ct
       JOIN users u ON u.id = ct.teacher_id
       WHERE ct.id = :testId`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    if (!tests.length) {
      return toolError('getTestDetails', `Test not found: ${testId}`, null, 404);
    }

    const questions = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.difficulty, tq.question_order,
         json_agg(
           json_build_object(
             'id',         ao.id,
             'text',       ao.option_text,
             'order_index', ao.order_index
           ) ORDER BY ao.order_index
         ) AS options
       FROM test_questions tq
       JOIN questions      q  ON q.id  = tq.question_id
       LEFT JOIN answer_options ao ON ao.question_id = q.id
       WHERE tq.test_id = :testId
       GROUP BY q.id, q.question_text, q.difficulty, tq.question_order
       ORDER BY tq.question_order`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    return toolSuccess('getTestDetails', { ...tests[0], questions });

  } catch (err) {
    return toolError('getTestDetails', err.message, err);
  }
}

module.exports = { generateTest, getStudentTests, getTestDetails };
