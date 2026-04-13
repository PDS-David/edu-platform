'use strict';

// server/workers/aiWorker.js
//
// BullMQ worker that processes jobs from the "ai-tasks" queue.
// Handles three job types:
//   generateHint        — Socratic hint for a question
//   generateExplanation — post-answer explanation
//   markImage           — mark a photo of handwritten work
//
// Start this worker alongside the Express server:
//   node server/workers/aiWorker.js
//
// Or add to server.js startup (see note at the bottom of this file).

const { Worker }         = require('bullmq');
const { QueryTypes }     = require('sequelize');
const sequelize          = require('../config/database');
const { getRedisClient } = require('../config/redisClient');
const {
  generateHint,
  generateExplanation,
  markImage,
} = require('../services/aiService');

const DEBUG = process.env.LOG_LEVEL === 'debug';

// ── Job handlers ──────────────────────────────────────────────────────────────

async function handleGenerateHint(data) {
  const { question_id, hint_level = 1 } = data;

  const questions = await sequelize.query(
    `SELECT q.question_text, q.topic, eb.code AS exam_board_code
     FROM questions q
     LEFT JOIN exam_boards eb ON q.exam_board_id = eb.id
     WHERE q.id = :id AND q.status = 'approved'`,
    { replacements: { id: question_id }, type: QueryTypes.SELECT }
  );
  if (!questions.length) {
    throw Object.assign(new Error('Question not found'), { statusCode: 404 });
  }

  const options = await sequelize.query(
    `SELECT option_text FROM answer_options WHERE question_id = :id ORDER BY order_index ASC`,
    { replacements: { id: question_id }, type: QueryTypes.SELECT }
  );

  return generateHint({
    questionText: questions[0].question_text,
    options,
    topic:        questions[0].topic,
    examBoard:    questions[0].exam_board_code,
    hintLevel:    Math.min(Math.max(parseInt(hint_level) || 1, 1), 3),
  });
}

async function handleGenerateExplanation(data) {
  const { question_id, selected_option_id } = data;

  const questions = await sequelize.query(
    `SELECT q.question_text, q.topic, q.explanation, eb.code AS exam_board_code
     FROM questions q
     LEFT JOIN exam_boards eb ON q.exam_board_id = eb.id
     WHERE q.id = :id AND q.status = 'approved'`,
    { replacements: { id: question_id }, type: QueryTypes.SELECT }
  );
  if (!questions.length) {
    throw Object.assign(new Error('Question not found'), { statusCode: 404 });
  }

  const allOptions = await sequelize.query(
    `SELECT id, option_text, is_correct
     FROM answer_options WHERE question_id = :id ORDER BY order_index ASC`,
    { replacements: { id: question_id }, type: QueryTypes.SELECT }
  );

  const selectedOption = allOptions.find(o => String(o.id) === String(selected_option_id));
  const correctOption  = allOptions.find(o => o.is_correct);

  if (!selectedOption) {
    throw Object.assign(new Error('Invalid selected_option_id'), { statusCode: 400 });
  }

  return generateExplanation({
    questionText:        questions[0].question_text,
    options:             allOptions,
    correctOptionText:   correctOption?.option_text || '',
    selectedOptionText:  selectedOption.option_text,
    wasCorrect:          selectedOption.is_correct,
    existingExplanation: questions[0].explanation,
    topic:               questions[0].topic,
    examBoard:           questions[0].exam_board_code,
  });
}

async function handleMarkImage(data) {
  const {
    imageBase64,
    mimeType     = 'image/jpeg',
    question_text,
    mark_scheme  = null,
    subject      = 'General',
    exam_board   = 'WAEC',
    total_marks  = 10,
  } = data;

  return markImage({
    imageBase64,
    mimeType,
    questionText: question_text,
    markScheme:   mark_scheme || null,
    subject,
    examBoard:    exam_board,
    totalMarks:   Math.min(Math.max(parseInt(total_marks) || 10, 1), 100),
  });
}

// ── Dispatch table ────────────────────────────────────────────────────────────

const handlerFns = {
  generateHint:        handleGenerateHint,
  generateExplanation: handleGenerateExplanation,
  markImage:           handleMarkImage,
};

// ── Cache key builders ────────────────────────────────────────────────────────

function getCacheKey(jobName, data) {
  if (jobName === 'generateHint') {
    return `hint:${data.question_id}:${data.hint_level ?? 1}`;
  }
  if (jobName === 'generateExplanation') {
    return `explanation:${data.question_id}:${data.selected_option_id}`;
  }
  return null; // markImage is not cached (binary payload, unique per submission)
}

// ── Worker ────────────────────────────────────────────────────────────────────

const redis = getRedisClient();

const worker = new Worker(
  'ai-tasks',
  async (job) => {
    const handler = handlerFns[job.name];
    if (!handler) {
      throw new Error(`Unknown job type: "${job.name}"`);
    }

    // ── Cache check ───────────────────────────────────────────────────────────
    const cacheKey = getCacheKey(job.name, job.data);
    if (cacheKey) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        if (DEBUG) console.log(`[AiWorker] Cache hit for job ${job.id} (${job.name}) key=${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // ── Generate ──────────────────────────────────────────────────────────────
    if (DEBUG) console.log(`[AiWorker] Processing job ${job.id} (${job.name})`);
    const result = await handler(job.data);
    if (DEBUG) console.log(`[AiWorker] Completed job ${job.id} (${job.name})`);

    // ── Cache store (TTL: 24 h) ───────────────────────────────────────────────
    if (cacheKey) {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400);
    }

    return result;
  },
  {
    connection:  getRedisClient(),
    concurrency: 5,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[AiWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[AiWorker] Worker error:', err.message);
});

console.log('[AiWorker] Worker started — listening on queue "ai-tasks"');

module.exports = worker;
