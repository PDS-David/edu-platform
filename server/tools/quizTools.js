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
//
// BUG FIX: this previously queried subtopic_quiz_attempts for columns that
// don't exist on it at all (qa.score, qa.total_questions, qa.correct_count —
// the real columns are total_score, max_score, accuracy_pct), so every call
// threw a genuine "column does not exist" error. But fixing just the column
// names would still have been wrong: a repo-wide search found ZERO production
// INSERT statements writing to subtopic_quiz_attempts (the only writer is a
// test file exercising a separate, not-yet-wired-in pipeline) — actual quiz
// completions are recorded in practice_attempts by POST /quizzes/attempt (see
// routes/quizzes.js's own top-of-file comment: "Quiz history stored in
// practice_attempts (no separate quiz_attempts table needed)"). Querying
// subtopic_quiz_attempts, even with correct column names, would have kept
// returning an empty history for every real student regardless of how many
// quizzes they've actually taken. Rewritten to query practice_attempts,
// matching what the live route this function claims to mirror actually does.
// ---------------------------------------------------------------------------
async function getQuizHistory(userId, subtopicId) {
  if (!userId || !subtopicId) {
    return toolError('getQuizHistory', 'userId and subtopicId are required');
  }

  try {
    const rows = await sequelize.query(
      `SELECT DATE(pa.attempted_at) AS date,
              COUNT(*)::INTEGER AS attempts,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.student_id = :userId AND q.subtopic_id = :subtopicId
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date DESC
       LIMIT 10`,
      { replacements: { userId, subtopicId }, type: QueryTypes.SELECT }
    );

    return toolSuccess('getQuizHistory', { subtopic_id: subtopicId, attempts: rows });

  } catch (err) {
    return toolError('getQuizHistory', err.message, err);
  }
}

module.exports = { startQuiz, getQuizHistory };
