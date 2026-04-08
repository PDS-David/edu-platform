'use strict';

// server/controllers/quizController.js

const { QueryTypes }                         = require('sequelize');
const sequelize                              = require('../config/database');
const { generateQuizByTopic, processQuizResults } = require('../services/quizService');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// generateQuiz
// GET /api/quiz/generate
// ---------------------------------------------------------------------------
async function generateQuiz(req, res) {
  const {
    topic_id,
    limit      = '10',
    difficulty = null,
    randomise  = 'true',
  } = req.query;

  if (!topic_id) {
    return res.status(400).json({
      success: false,
      error:   'topic_id query parameter is required',
    });
  }

  if (!UUID_REGEX.test(topic_id)) {
    return res.status(400).json({
      success: false,
      error:   'topic_id must be a valid UUID',
    });
  }

  const parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
    return res.status(400).json({
      success: false,
      error:   'limit must be a number between 1 and 20',
    });
  }

  if (difficulty && !['easy', 'medium', 'hard'].includes(difficulty)) {
    return res.status(400).json({
      success: false,
      error:   "difficulty must be 'easy', 'medium', or 'hard'",
    });
  }

  try {
    const quiz = await generateQuizByTopic({
      topic_id,
      limit:      parsedLimit,
      difficulty: difficulty || null,
      randomise:  randomise !== 'false',
    });

    if (quiz.total_questions === 0) {
      return res.status(404).json({
        success: false,
        error:   'No approved questions found for this topic. Try a different topic or remove the difficulty filter.',
        topic_id,
      });
    }

    return res.status(200).json({ success: true, data: quiz });

  } catch (err) {
    const status = err.statusCode || 500;

    if (status < 500) {
      return res.status(status).json({ success: false, error: err.message });
    }

    console.error('[GET /api/quiz/generate]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to generate quiz. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
    });
  }
}

// ---------------------------------------------------------------------------
// submitQuiz
// POST /api/quiz/submit
//
// Body: {
//   quizId?:  string  (UUID of the quiz, optional)
//   answers:  Array<{ questionId: string, selectedOptionId: string | null }>
// }
//
// Flow:
//   1. Validate input
//   2. Create a quiz_attempts row (status = 'completed')
//   3. For each answer, look up whether the chosen option is correct,
//      then insert into student_answers
//   4. Update the attempt with final score / percentage
//   5. Trigger processQuizResults() to recompute weakness profile
// ---------------------------------------------------------------------------
async function submitQuiz(req, res) {
  const studentId = req.user.id;
  const { quizId = null, answers } = req.body;

  // -- Basic input validation ------------------------------------------------
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({
      success: false,
      error:   'answers must be a non-empty array',
    });
  }

  if (quizId && !UUID_REGEX.test(quizId)) {
    return res.status(400).json({
      success: false,
      error:   'quizId must be a valid UUID',
    });
  }

  const t = await sequelize.transaction();
  try {
    // -- 1. Create attempt row -----------------------------------------------
    const attemptRows = await sequelize.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, start_time, end_time, status)
       VALUES (:quizId, :studentId, NOW(), NOW(), 'completed')
       RETURNING id`,
      {
        replacements: { quizId: quizId || null, studentId },
        type:         QueryTypes.INSERT,
        transaction:  t,
      }
    );

    const attemptId = attemptRows[0][0].id;

    // -- 2. Resolve correct options in one query (avoid N+1) -----------------
    const questionIds = answers.map(a => a.questionId).filter(Boolean);

    let correctOptionMap = {};  // { questionId -> Set of correct option ids }
    if (questionIds.length > 0) {
      const correctRows = await sequelize.query(
        `SELECT question_id, id AS option_id
         FROM answer_options
         WHERE question_id = ANY(:questionIds) AND is_correct = true`,
        { replacements: { questionIds }, type: QueryTypes.SELECT, transaction: t }
      );
      for (const row of correctRows) {
        if (!correctOptionMap[row.question_id]) {
          correctOptionMap[row.question_id] = new Set();
        }
        correctOptionMap[row.question_id].add(String(row.option_id));
      }
    }

    // -- 3. Insert student_answers -------------------------------------------
    let correctCount = 0;
    for (const answer of answers) {
      const { questionId, selectedOptionId = null } = answer;
      if (!questionId) continue;

      const isCorrect = selectedOptionId
        ? (correctOptionMap[questionId]?.has(String(selectedOptionId)) ?? false)
        : false;

      if (isCorrect) correctCount++;

      await sequelize.query(
        `INSERT INTO student_answers
           (attempt_id, question_id, selected_option_id, is_correct)
         VALUES
           (:attemptId, :questionId, :selectedOptionId, :isCorrect)`,
        {
          replacements: {
            attemptId,
            questionId,
            selectedOptionId: selectedOptionId || null,
            isCorrect,
          },
          type:        QueryTypes.INSERT,
          transaction: t,
        }
      );
    }

    // -- 4. Update attempt with score ----------------------------------------
    const totalAnswered = answers.filter(a => a.questionId).length;
    const percentage    = totalAnswered > 0
      ? parseFloat(((correctCount / totalAnswered) * 100).toFixed(2))
      : 0;

    await sequelize.query(
      `UPDATE quiz_attempts
       SET score        = :correctCount,
           total_marks  = :totalAnswered,
           percentage   = :percentage
       WHERE id = :attemptId`,
      {
        replacements: { correctCount, totalAnswered, percentage, attemptId },
        type:         QueryTypes.UPDATE,
        transaction:  t,
      }
    );

    await t.commit();

    console.log(
      `[submitQuiz] Saved ${totalAnswered} answer(s) for student ${studentId}` +
      ` | attempt: ${attemptId} | score: ${correctCount}/${totalAnswered} (${percentage}%)`
    );

    // -- 5. Post-submission weakness analysis (non-blocking) -----------------
    //
    // Fire-and-forget so the HTTP response is immediate.
    // Errors are caught and logged inside processQuizResults().
    processQuizResults(studentId).catch(err =>
      console.error('[submitQuiz] processQuizResults failed:', err.message)
    );

    return res.status(200).json({
      success: true,
      message: 'Quiz submitted successfully',
      data: {
        attempt_id:  attemptId,
        score:       correctCount,
        total:       totalAnswered,
        percentage,
      },
    });

  } catch (err) {
    await t.rollback();
    console.error('[POST /api/quiz/submit]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to submit quiz. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
    });
  }
}

module.exports = { generateQuiz, submitQuiz };
