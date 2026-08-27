// server/services/quizGenerator.js
// ─────────────────────────────────────────────────────────────────────────────
// Quiz Generation Service for AISchoolonair
//
// PROMPT 3 CHANGES — Quiz generation never fails:
//   If the initial question SELECT returns fewer rows than requested, the
//   service now:
//     1. Identifies concepts linked to the topic (via question_concepts or
//        the topic name), sorted by frequency of existing questions.
//     2. Generates AI questions on-demand for each shortfall slot.
//     3. Retries the SELECT once after generation to pick up the new rows
//        (handles any race between insert + select).
//     4. If Gemini is unavailable or generation still falls short, returns
//        whatever was collected rather than throwing — callers always get
//        a quiz, even if it is smaller than requested.
//     5. Writes an entry to ai_question_logs for each generated question.
//
// POLICY UPDATE (2026-06): AI-generated fallback questions are written with
// status = 'pending', NOT 'approved'. They go through the admin Question
// Review Queue like every other AI-generated question. This means the
// re-fetch in step 3 above will NOT pick up freshly-generated questions
// (fetchQuestionsForTopic only selects status = 'approved') — the quiz for
// that attempt may come back shorter than requested if the topic doesn't
// already have enough pre-approved questions. This is intentional: it is
// the "never fails" guarantee degrading gracefully rather than serving an
// unreviewed AI question straight to a student.
//
// All original exports and behaviour are preserved; the fallback is entirely
// additive and transparent to callers.
//
// Wire format returned (unchanged):
// {
//   quiz_title, topic_id, topic_name, subject_name, exam_board,
//   total_questions, generated_at,
//   ai_questions_generated,   ← count of AI questions generated and queued
//                                for review during this call (NOT included
//                                in the quiz itself — see policy note above)
//   questions: [ { number, question_id, question, topic, difficulty,
//                  options, correct_answer, correct_answer_text, explanation } ]
// }
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(String(v || '')); }

// Lazy-load the AI generator — server starts even if Gemini is not configured
let _aiGen = null;
function getAIGenerator() {
  if (_aiGen) return _aiGen;
  try {
    _aiGen = require('./aiQuestionGenerator');
    return _aiGen;
  } catch {
    return null; // not available — fallback degrades gracefully
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateQuizByTopic(options)
 *
 * @param {string}  options.topic_id     Required. UUID of the topic row.
 * @param {number}  [options.limit=10]   Max questions to return (capped at 20).
 * @param {string}  [options.difficulty] 'easy' | 'medium' | 'hard' | null (all).
 * @param {boolean} [options.randomise]  Shuffle question order (default true).
 * @param {string}  [options.student_id] UUID of requesting student (for logs).
 *
 * @returns {Promise<object>}  Quiz payload; never throws for missing questions.
 * @throws  {Error}            Only if topic_id is invalid or topic not found.
 */
async function generateQuizByTopic({
  topic_id,
  limit      = 10,
  difficulty = null,
  randomise  = true,
  student_id = null,
}) {
  // ── Validate topic_id ────────────────────────────────────────────────────
  if (!topic_id || !isValidUUID(topic_id)) {
    throw Object.assign(new Error('topic_id must be a valid UUID'), { statusCode: 400 });
  }

  const safeLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 20);

  // ── 1. Fetch topic metadata ───────────────────────────────────────────────
  const topicRows = await sequelize.query(
    `SELECT
       t.id                                           AS topic_id,
       COALESCE(t.name, t.title, 'Untitled Topic')   AS topic_name,
       s.name                                         AS subject_name,
       s.id                                           AS subject_id,
       eb.name                                        AS exam_board,
       eb.code                                        AS exam_board_code
     FROM topics t
     LEFT JOIN subjects    s  ON s.id  = t.subject_id
     LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
     WHERE t.id = :topicId`,
    { replacements: { topicId: topic_id }, type: QueryTypes.SELECT }
  );

  if (!topicRows.length) {
    throw Object.assign(
      new Error(`Topic not found: ${topic_id}`),
      { statusCode: 404 }
    );
  }

  const topic = topicRows[0];

  // ── 2. Fetch questions ────────────────────────────────────────────────────
  const { questions: initialQs, options: initialOpts } =
    await fetchQuestionsForTopic(topic, safeLimit, difficulty, randomise);

  let questions   = initialQs;
  let options     = initialOpts;
  let aiGenerated = 0;

  // ── 3. AI FALLBACK — fill shortfall with dynamically-generated questions ──
  const shortfall = safeLimit - questions.length;
  if (shortfall > 0 && process.env.GEMINI_API_KEY) {
    console.log(
      `[quizGenerator] Only ${questions.length}/${safeLimit} questions found ` +
      `for topic "${topic.topic_name}". Generating ${shortfall} AI question(s)…`
    );

    const generated = await generateFallbackQuestions({
      topic,
      count:      shortfall,
      difficulty,
      student_id,
    });

    aiGenerated = generated.length;

    if (aiGenerated > 0) {
      // Re-fetch so newly inserted rows are picked up with their full DB state
      const retried = await fetchQuestionsForTopic(
        topic, safeLimit, difficulty, randomise
      );
      questions = retried.questions;
      options   = retried.options;

      console.log(
        `[quizGenerator] After AI generation: ${questions.length} question(s) available.`
      );
    }
  }

  // ── 4. Assemble payload ───────────────────────────────────────────────────
  const payload = buildQuizPayload(questions, options, topic);
  payload.ai_questions_generated = aiGenerated;
  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH QUESTIONS — reusable query (called before and after AI generation)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchQuestionsForTopic(topic, safeLimit, difficulty, randomise) {
  const qConditions   = ["q.status = 'approved'", 'q.subject_id_uuid = :subjectId'];
  const qReplacements = {
    subjectId: topic.subject_id,
    topicId:   topic.topic_id,
    limit:     safeLimit,
  };

  qConditions.push("LOWER(q.topic) = LOWER(:topicName)");
  qReplacements.topicName = topic.topic_name;

  if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
    qConditions.push('q.difficulty = :difficulty');
    qReplacements.difficulty = difficulty;
  }

  const orderClause = randomise ? 'ORDER BY RANDOM()' : 'ORDER BY q.created_at ASC';

  const questions = await sequelize.query(
    `SELECT
       q.id            AS question_id,
       q.question_text AS question,
       q.topic,
       q.difficulty,
       q.explanation
     FROM questions q
     WHERE ${qConditions.join(' AND ')}
     ${orderClause}
     LIMIT :limit`,
    { replacements: qReplacements, type: QueryTypes.SELECT }
  );

  let optionsRows = [];
  if (questions.length) {
    const questionIds = questions.map(q => q.question_id);
    optionsRows = await sequelize.query(
      `SELECT
         ao.question_id,
         ao.option_text,
         ao.is_correct,
         ao.order_index
       FROM answer_options ao
       WHERE ao.question_id IN (:questionIds)
       ORDER BY ao.question_id, ao.order_index ASC`,
      { replacements: { questionIds }, type: QueryTypes.SELECT }
    );
  }

  return { questions, options: optionsRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE FALLBACK QUESTIONS VIA AI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateFallbackQuestions
 *
 * Finds concepts for the topic (or synthesises a placeholder concept),
 * calls aiQuestionGenerator for each slot, and writes ai_question_logs.
 * Never throws — failures are logged and gracefully ignored.
 *
 * @returns {Array} Array of successfully generated question objects.
 */
async function generateFallbackQuestions({ topic, count, difficulty, student_id }) {
  const aiGen = getAIGenerator();
  if (!aiGen) {
    console.warn('[quizGenerator] aiQuestionGenerator not available — no fallback.');
    return [];
  }

  // Find concepts linked to subtopics of this topic
  const conceptRows = await sequelize.query(
    `SELECT DISTINCT
       c.id,
       c.name,
       c.difficulty_level
     FROM concepts c
     JOIN subtopics st ON c.subtopic_id = st.id
     WHERE st.topic_id = :topicId
     ORDER BY c.difficulty_level ASC
     LIMIT :limit`,
    { replacements: { topicId: topic.topic_id, limit: count }, type: QueryTypes.SELECT }
  ).catch(() => []);

  // If no concepts found, fall back to a synthetic approach:
  // use the topic's first subtopic and generate directly using aiQuestionGenerator
  // with a virtual concept derived from the topic name.
  const slotsToFill = Math.min(count, Math.max(conceptRows.length, 1));
  const generated   = [];

  for (let i = 0; i < slotsToFill; i++) {
    const concept = conceptRows[i];

    try {
      let newQuestion;

      if (concept) {
        // Standard path — generate from a real concept
        newQuestion = await aiGen.generateAIQuestion(concept.id, student_id);
      } else {
        // No concept available — inject the topic name as a concept first
        const syntheticConcept = await ensureSyntheticConcept(topic);
        newQuestion = await aiGen.generateAIQuestion(syntheticConcept, student_id);
      }

      // Write to ai_question_logs
      await logAIQuestion({
        question_id: newQuestion.id,
        concept_id:  concept?.id || null,
        student_id,
        metadata: {
          source:     'quiz_fallback',
          topic_id:   topic.topic_id,
          topic_name: topic.topic_name,
        },
      });

      generated.push(newQuestion);
    } catch (err) {
      // Log but never crash — partial results are fine
      console.warn(
        `[quizGenerator] AI fallback failed for concept "${concept?.name || 'synthetic'}":`,
        err.message
      );
    }
  }

  return generated;
}

/**
 * ensureSyntheticConcept
 *
 * Looks up or creates a concept row whose name matches the topic name
 * inside the first subtopic of this topic, so aiQuestionGenerator can run.
 *
 * @returns {string}  The concept UUID.
 */
async function ensureSyntheticConcept(topic) {
  // Find first subtopic for this topic
  const subtopics = await sequelize.query(
    `SELECT id FROM subtopics WHERE topic_id = :topicId LIMIT 1`,
    { replacements: { topicId: topic.topic_id }, type: QueryTypes.SELECT }
  );

  if (!subtopics.length) {
    throw new Error(`No subtopics found for topic "${topic.topic_name}" (id: ${topic.topic_id})`);
  }

  const subtopicId = subtopics[0].id;

  // Check if synthetic concept already exists
  const existing = await sequelize.query(
    `SELECT id FROM concepts
     WHERE subtopic_id = :subtopicId
       AND LOWER(TRIM(name)) = LOWER(TRIM(:name))
     LIMIT 1`,
    { replacements: { subtopicId, name: topic.topic_name }, type: QueryTypes.SELECT }
  );

  if (existing.length) return existing[0].id;

  // Create it
  const result = await sequelize.query(
    `INSERT INTO concepts
       (subtopic_id, name, description, difficulty_level, estimated_minutes, order_index, created_at, updated_at)
     VALUES
       (:subtopicId, :name, :description, 3, 10, 0, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        subtopicId,
        name:        topic.topic_name,
        description: `Auto-created concept for quiz fallback generation.`,
      },
      type: QueryTypes.INSERT,
    }
  );

  return result[0][0].id;
}

/**
 * logAIQuestion — writes a row to ai_question_logs (non-fatal on error).
 */
async function logAIQuestion({ question_id, concept_id, student_id, metadata }) {
  try {
    await sequelize.query(
      `INSERT INTO ai_question_logs (question_id, concept_id, student_id, metadata, created_at)
       VALUES (:question_id, :concept_id, :student_id, :metadata::jsonb, NOW())`,
      {
        replacements: {
          question_id: question_id || null,
          concept_id:  concept_id  || null,
          student_id:  student_id  || null,
          metadata:    JSON.stringify(metadata || {}),
        },
        type: QueryTypes.INSERT,
      }
    );
  } catch (err) {
    // Non-fatal — logging failure must never block quiz delivery
    console.warn('[quizGenerator] ai_question_logs insert failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOAD BUILDER (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildQuizPayload(questions, options, topicMeta)
 *
 * Converts raw DB rows into the structured wire format.
 * Exported so the AI orchestrator can reuse it without re-querying the DB.
 */
function buildQuizPayload(questions, options, topicMeta = {}) {
  const optionsByQid = {};
  for (const opt of options) {
    if (!optionsByQid[opt.question_id]) optionsByQid[opt.question_id] = [];
    optionsByQid[opt.question_id].push(opt);
  }

  const LABELS = ['A', 'B', 'C', 'D', 'E'];

  const formattedQuestions = questions
    .map((q, index) => {
      const qOptions = (optionsByQid[q.question_id] || []).slice(0, 5);
      if (!qOptions.length) return null;

      const labelledOptions = {};
      let correctLabel      = null;
      let correctText       = null;

      qOptions.forEach((opt, i) => {
        const label = LABELS[i];
        labelledOptions[label] = opt.option_text;
        if (opt.is_correct) {
          correctLabel = label;
          correctText  = opt.option_text;
        }
      });

      if (!correctLabel) return null;

      return {
        number:              index + 1,
        question_id:         q.question_id,
        question:            q.question,
        topic:               q.topic         || topicMeta.topic_name || null,
        difficulty:          q.difficulty    || 'medium',
        options:             labelledOptions,
        correct_answer:      correctLabel,
        correct_answer_text: correctText,
        explanation:         q.explanation   || null,
      };
    })
    .filter(Boolean);

  formattedQuestions.forEach((q, i) => { q.number = i + 1; });

  return {
    quiz_title:             buildTitle(topicMeta),
    topic_id:               topicMeta.topic_id        || null,
    topic_name:             topicMeta.topic_name      || null,
    subject_name:           topicMeta.subject_name    || null,
    exam_board:             topicMeta.exam_board      || null,
    exam_board_code:        topicMeta.exam_board_code || null,
    total_questions:        formattedQuestions.length,
    generated_at:           new Date().toISOString(),
    ai_questions_generated: 0, // overwritten in generateQuizByTopic
    questions:              formattedQuestions,
  };
}

function buildTitle(topicMeta) {
  const parts = [];
  if (topicMeta.subject_name)    parts.push(topicMeta.subject_name);
  if (topicMeta.topic_name)      parts.push(topicMeta.topic_name);
  if (topicMeta.exam_board_code) parts.push(topicMeta.exam_board_code);
  return parts.length ? `${parts.join(' - ')} Quiz` : 'Practice Quiz';
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { generateQuizByTopic, buildQuizPayload };
