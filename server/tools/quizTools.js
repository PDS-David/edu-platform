// server/tools/quizTools.js
// ---------------------------------------------------------------------------
// AI-callable tool: quiz generation and session management.
//
// Wraps:
//   - server/services/quizService.js  (generateQuizByTopic — Redis-cached)
//   - server/services/quizGenerator.js (generateQuizByTopic — raw)
//   - routes/quizzes.js  DB logic  (attempt history)
//
// Does NOT modify any of those files.
// ---------------------------------------------------------------------------

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// Lazy-load quizService so the tool still imports cleanly even if Redis
// is not yet initialised at module-load time.
function getQuizService() {
  return require('../services/quizService');
}

// ---------------------------------------------------------------------------
// startQuiz(userId, options)
//
// Generates a ready-to-serve quiz for the student.
// Delegates to quizService (Redis-cached) when topic_id is a valid UUID.
// Falls back to the orchestrator's DB fallback path when it is not.
//
// @param {string} userId
// @param {object} options
//   topic_id    {string}  UUID — preferred; returns authoritative DB questions
//   subject_id  {string}  UUID — used as fallback scope when no topic_id
//   topic_name  {string}  Text — used as fallback when no topic_id
//   difficulty  {string}  'easy' | 'medium' | 'hard' | null (all)
//   limit       {number}  Max questions (1-20, default 10)
//
// Output shape:
// {
//   quiz_title, topic_id, topic_name, subject_name, exam_board,
//   total_questions, generated_at,
//   questions: [ { number, question_id, question, options, correct_answer, ... } ]
// }
// ---------------------------------------------------------------------------
async function startQuiz(userId, options = {}) {
  if (!userId) {
    return toolError('startQuiz', 'userId is required');
  }

  const {
    topic_id   = null,
    subject_id = null,
    topic_name = null,
    difficulty = null,
    limit      = 10,
  } = options;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  try {
    // Path A — topic_id provided: use quizService (cached, authoritative)
    if (topic_id && UUID_RE.test(String(topic_id))) {
      const { generateQuizByTopic } = getQuizService();
      const quiz = await generateQuizByTopic({
        topic_id,
        limit:     Math.min(parseInt(limit) || 10, 20),
        difficulty: difficulty || null,
        randomise:  true,
      });
      return toolSuccess('startQuiz', quiz);
    }

    // Path B — no topic_id: fallback to raw DB query scoped by subject/name
    const { fetchQuizQuestionsFallback } = require('../services/aiOrchestrator');
    const questions = await fetchQuizQuestionsFallback({
      subjectId:  subject_id,
      topicName:  topic_name,
      limit:      Math.min(parseInt(limit) || 10, 20),
      difficulty: difficulty || null,
    });

    if (!questions.length) {
      return toolError('startQuiz', 'No questions found for the specified topic or subject.', null, 404);
    }

    return toolSuccess('startQuiz', {
      quiz_title:      `Quiz on ${topic_name || 'Selected Topic'}`,
      topic_id:        null,
      topic_name:      topic_name || 'General',
      subject_name:    null,
      total_questions: questions.length,
      generated_at:    new Date().toISOString(),
      questions,
    });

  } catch (err) {
    // Surface structured errors (400, 404) from quizGenerator
    const statusCode = err.statusCode || 500;
    return toolError('startQuiz', err.message, err, statusCode);
  }
}

// ---------------------------------------------------------------------------
// getQuizHistory(userId, subtopicId)
//
// Returns a student's past quiz attempts for a given subtopic.
// Mirrors the logic in GET /api/quizzes/history/:studentId/:subtopicId.
// ---------------------------------------------------------------------------
async function getQuizHistory(userId, subtopicId) {
  if (!userId || !subtopicId) {
    return toolError('getQuizHistory', 'userId and subtopicId are required');
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         qa.id             AS attempt_id,
         qa.score          AS score_pct,
         qa.total_questions,
         qa.correct_count,
         qa.time_taken_ms,
         qa.completed_at
       FROM subtopic_quiz_attempts qa
       WHERE qa.student_id  = :userId
         AND qa.subtopic_id = :subtopicId
       ORDER BY qa.completed_at DESC
       LIMIT 10`,
      { replacements: { userId, subtopicId }, type: QueryTypes.SELECT }
    );

    return toolSuccess('getQuizHistory', { subtopic_id: subtopicId, attempts: rows });

  } catch (err) {
    return toolError('getQuizHistory', err.message, err);
  }
}

module.exports = { startQuiz, getQuizHistory };
