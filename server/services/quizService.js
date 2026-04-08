'use strict';

const db = require('../config/database');
const { getRedisClient } = require('../config/redisClient');
const { generateQuestions } = require('./questionService');

const { analyzeWeakness, updateLearningGaps } = require('./weaknessService');

const CACHE_TTL_SECONDS = 600;

function buildCacheKey({ subtopic_id, count }) {
  return `quiz:${subtopic_id}:${count}`;
}

async function getExistingQuestions(subtopic_id, limit) {
  const res = await db.query(
    `SELECT * FROM questions WHERE subtopic_id = $1 LIMIT $2`,
    [subtopic_id, limit]
  );
  return res.rows;
}

async function generateQuiz(options) {
  const { subtopic_id, count, student_id } = options;

  const redis = getRedisClient();
  const cacheKey = buildCacheKey(options);

  // 1. CACHE CHECK
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[QuizService] Cache hit — ${cacheKey}`);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('[QuizService] Redis read failed:', err.message);
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    let questions = await getExistingQuestions(subtopic_id, count);

    // 2. AI FALLBACK
    if (questions.length < count) {
      const needed = count - questions.length;

      await generateQuestions({
        subtopic_id,
        student_id,
        count: needed
      });

      questions = await getExistingQuestions(subtopic_id, count);
    }

    await client.query('COMMIT');

    // 3. CACHE STORE
    try {
      await redis.set(cacheKey, JSON.stringify(questions), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      console.warn('[QuizService] Redis write failed:', err.message);
    }

    return questions;

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[QuizService] Error:', err);
    throw err;

  } finally {
    client.release();
  }
}

// Weakness processing stays unchanged
async function processQuizResults(studentId) {
  try {
    const weaknesses = await analyzeWeakness(studentId);
    await updateLearningGaps(studentId, weaknesses);
  } catch (err) {
    console.error('[QuizService] Weakness processing failed:', err.message);
  }
}

module.exports = {
  generateQuiz,
  processQuizResults
};