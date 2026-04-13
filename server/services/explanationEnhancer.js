// server/services/explanationEnhancer.js
// -------------------------------------------------------------------------
// Explanation Enhancer Service — AISchoolonair
//
// Given a topic_id OR subtopic_id this service:
//   1. Resolves metadata (topic/subtopic name, subject, exam board)
//   2. Checks ai_explanation_cache — returns cached result if found
//   3. Aggregates raw explanation text from questions.explanation
//   4. Sends the aggregated text to Gemini for enhancement
//   5. Persists the result to ai_explanation_cache (UPSERT)
//   6. Returns the structured response
//
// Return shape:
// {
//   topic_id:               uuid | null,
//   subtopic_id:            uuid | null,
//   topic_name:             string | null,
//   subtopic_name:          string | null,
//   subject_name:           string | null,
//   exam_board:             string | null,
//   source_question_count:  number,
//   from_cache:             boolean,
//   cached_at:              ISO string | null,
//   original_explanation:   string,
//   simplified_explanation: string,
//   key_points:             string[],
// }
//
// Exported:
//   enhanceExplanation(options)  — primary entry point
// -------------------------------------------------------------------------

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
// v2: route all AI calls through central hub (services/ai.js)
const { generate }   = require('./ai');

// ── callGemini wrapper — now routes through ai.js central hub ────────────────
async function callGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(
    new Error('GEMINI_API_KEY is not configured. Set it in server/.env'),
    { statusCode: 503 }
  );
  return generate(prompt, 'remediation');
}

// ── UUID validator ────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(v) { return UUID_RE.test(String(v || '')); }

// =============================================================================
// PRIMARY ENTRY POINT
// =============================================================================

/**
 * enhanceExplanation({ topic_id, subtopic_id, force_refresh })
 *
 * @param {string}  [options.topic_id]      UUID of the topic row.
 * @param {string}  [options.subtopic_id]   UUID of the subtopic row.
 *   Exactly one of topic_id / subtopic_id must be supplied.
 * @param {boolean} [options.force_refresh] If true, bypass cache and regenerate.
 *
 * @returns {Promise<object>}  Structured explanation response.
 * @throws  {Error}            400 if input invalid, 404 if not found, 503 if AI down.
 */
async function enhanceExplanation({ topic_id, subtopic_id, force_refresh = false }) {

  // ── 1. Input validation ─────────────────────────────────────────────────────
  const hasTopic    = topic_id    && isUUID(topic_id);
  const hasSubtopic = subtopic_id && isUUID(subtopic_id);

  if (!hasTopic && !hasSubtopic) {
    throw Object.assign(
      new Error('Provide a valid topic_id OR subtopic_id (UUID)'),
      { statusCode: 400 }
    );
  }
  if (hasTopic && hasSubtopic) {
    throw Object.assign(
      new Error('Provide topic_id OR subtopic_id, not both'),
      { statusCode: 400 }
    );
  }

  const scope = hasTopic ? 'topic' : 'subtopic';
  const scopeId = scope === 'topic' ? topic_id : subtopic_id;

  // ── 2. Resolve metadata ─────────────────────────────────────────────────────
  const meta = await resolveMeta(scope, scopeId);

  // ── 3. Cache check ──────────────────────────────────────────────────────────
  if (!force_refresh) {
    const cached = await loadCache(scope, scopeId);
    if (cached) {
      return formatResponse({ meta, cached, from_cache: true });
    }
  }

  // ── 4. Fetch raw explanations from questions table ──────────────────────────
  const { original, questionCount } = await aggregateExplanations(scope, scopeId, meta);

  // ── 5. Call Gemini ──────────────────────────────────────────────────────────
  const aiResult = await runAI({ meta, original });

  // ── 6. Persist to cache (UPSERT) ────────────────────────────────────────────
  const now = new Date().toISOString();
  await sequelize.query(
    `INSERT INTO ai_explanation_cache
       (topic_id, subtopic_id, original_explanation, simplified_explanation,
        key_points, source_question_count, model_used, created_at, updated_at)
     VALUES
       (:topicId, :subtopicId, :original, :simplified, :keyPoints::jsonb,
        :qCount, 'gemini-2.5-flash', NOW(), NOW())
     ON CONFLICT (${scope === 'topic' ? 'topic_id' : 'subtopic_id'})
     DO UPDATE SET
       original_explanation    = EXCLUDED.original_explanation,
       simplified_explanation  = EXCLUDED.simplified_explanation,
       key_points              = EXCLUDED.key_points,
       source_question_count   = EXCLUDED.source_question_count,
       model_used              = EXCLUDED.model_used,
       updated_at              = NOW()`,
    {
      replacements: {
        topicId:    scope === 'topic'    ? scopeId : null,
        subtopicId: scope === 'subtopic' ? scopeId : null,
        original:   original,
        simplified: aiResult.simplified_explanation,
        keyPoints:  JSON.stringify(aiResult.key_points),
        qCount:     questionCount,
      },
      type: QueryTypes.INSERT,
    }
  );

  // ── 7. Return ───────────────────────────────────────────────────────────────
  return {
    topic_id:               scope === 'topic'    ? scopeId : null,
    subtopic_id:            scope === 'subtopic' ? scopeId : null,
    topic_name:             meta.topic_name      || null,
    subtopic_name:          meta.subtopic_name   || null,
    subject_name:           meta.subject_name    || null,
    exam_board:             meta.exam_board      || null,
    exam_board_code:        meta.exam_board_code || null,
    source_question_count:  questionCount,
    from_cache:             false,
    cached_at:              now,
    original_explanation:   original,
    simplified_explanation: aiResult.simplified_explanation,
    key_points:             aiResult.key_points,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * resolveMeta — fetch topic/subtopic name + subject + exam board.
 */
async function resolveMeta(scope, scopeId) {
  let rows;

  if (scope === 'topic') {
    rows = await sequelize.query(
      `SELECT
         t.id                                          AS topic_id,
         COALESCE(t.name, t.title, 'Untitled Topic')  AS topic_name,
         NULL::text                                    AS subtopic_name,
         s.name                                        AS subject_name,
         s.id                                          AS subject_id,
         eb.name                                       AS exam_board,
         eb.code                                       AS exam_board_code
       FROM   topics      t
       LEFT JOIN subjects    s  ON s.id  = t.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE  t.id = :id`,
      { replacements: { id: scopeId }, type: QueryTypes.SELECT }
    );
  } else {
    rows = await sequelize.query(
      `SELECT
         t.id                                          AS topic_id,
         COALESCE(t.name, t.title, 'Untitled Topic')  AS topic_name,
         st.name                                       AS subtopic_name,
         s.name                                        AS subject_name,
         s.id                                          AS subject_id,
         eb.name                                       AS exam_board,
         eb.code                                       AS exam_board_code
       FROM   subtopics   st
       LEFT JOIN topics      t  ON t.id  = st.topic_id
       LEFT JOIN subjects    s  ON s.id  = st.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE  st.id = :id`,
      { replacements: { id: scopeId }, type: QueryTypes.SELECT }
    );
  }

  if (!rows.length) {
    throw Object.assign(
      new Error(`${scope === 'topic' ? 'Topic' : 'Subtopic'} not found: ${scopeId}`),
      { statusCode: 404 }
    );
  }

  return rows[0];
}

/**
 * loadCache — return cached row or null.
 */
async function loadCache(scope, scopeId) {
  const col  = scope === 'topic' ? 'topic_id' : 'subtopic_id';
  const rows = await sequelize.query(
    `SELECT
       original_explanation,
       simplified_explanation,
       key_points,
       source_question_count,
       updated_at
     FROM ai_explanation_cache
     WHERE ${col} = :id`,
    { replacements: { id: scopeId }, type: QueryTypes.SELECT }
  );
  return rows.length ? rows[0] : null;
}

/**
 * aggregateExplanations — pull explanation text from questions, concatenate.
 *
 * Strategy:
 *  - For topic scope:    match via q.topic name (same as quizGenerator does)
 *  - For subtopic scope: match via q.subtopic_id FK
 *
 * Up to 10 question explanations are used as source material.
 * They're concatenated into one coherent block for the AI prompt.
 */
async function aggregateExplanations(scope, scopeId, meta) {
  let rows;

  if (scope === 'topic') {
    // Topics link to questions via the q.topic VARCHAR field
    rows = await sequelize.query(
      `SELECT q.question_text, q.explanation, q.topic, q.difficulty
       FROM   questions q
       WHERE  q.status       = 'approved'
         AND  q.explanation  IS NOT NULL
         AND  q.explanation  <> ''
         AND  LOWER(q.topic) = LOWER(:topicName)
       ORDER  BY q.difficulty ASC, q.created_at ASC
       LIMIT  10`,
      {
        replacements: { topicName: meta.topic_name },
        type: QueryTypes.SELECT,
      }
    );
  } else {
    // Subtopics link to questions via the subtopic_id FK
    rows = await sequelize.query(
      `SELECT q.question_text, q.explanation, q.topic, q.difficulty
       FROM   questions q
       WHERE  q.status      = 'approved'
         AND  q.explanation IS NOT NULL
         AND  q.explanation <> ''
         AND  q.subtopic_id = :subtopicId
       ORDER  BY q.difficulty ASC, q.created_at ASC
       LIMIT  10`,
      {
        replacements: { subtopicId: scopeId },
        type: QueryTypes.SELECT,
      }
    );
  }

  if (!rows.length) {
    // No questions with explanations — use topic/subtopic description as fallback
    const fallback = meta.subtopic_name
      ? `This covers the subtopic "${meta.subtopic_name}" within "${meta.topic_name}" for ${meta.exam_board || 'Nigerian exams'}.`
      : `This covers the topic "${meta.topic_name}" in ${meta.subject_name || 'the subject'} for ${meta.exam_board || 'Nigerian exams'}.`;
    return { original: fallback, questionCount: 0 };
  }

  // Build a readable block from all retrieved explanations
  const original = rows
    .map((r, i) =>
      `[${i + 1}] ${r.question_text}\n` +
      `Explanation: ${r.explanation}`
    )
    .join('\n\n');

  return { original, questionCount: rows.length };
}

/**
 * runAI — send the aggregated explanation text to Gemini.
 * Returns { simplified_explanation: string, key_points: string[] }
 */
async function runAI({ meta, original }) {
  const scope   = meta.subtopic_name || meta.topic_name || 'this topic';
  const subject = meta.subject_name  || 'the subject';
  const board   = meta.exam_board    || 'WAEC/JAMB';

  const prompt = `
You are AISchoolonair, an expert AI tutor for Nigerian secondary school students preparing for ${board} exams.
Subject: ${subject}
Topic: ${meta.topic_name || 'Not specified'}
${meta.subtopic_name ? `Subtopic: ${meta.subtopic_name}` : ''}

Below are explanations taken from past exam questions on "${scope}":

---
${original}
---

Your task is to enhance these explanations for a student who is revising for the ${board} exam.

Respond with ONLY a valid JSON object — no preamble, no markdown, no backticks.
The JSON must have exactly these two keys:

{
  "simplified_explanation": "A single, clear, flowing explanation of the topic written in plain English suitable for an SS2/SS3 Nigerian student. 3 to 5 paragraphs. No bullet points inside this field.",
  "key_points": [
    "First key point (one sentence, exam-focused)",
    "Second key point",
    "Third key point",
    "Fourth key point (optional)",
    "Fifth key point (optional)"
  ]
}

Rules:
- simplified_explanation must be plain text only — no markdown, no symbols like ** or ##
- key_points must be a JSON array of 3 to 5 strings
- Every point must be directly relevant to the ${board} syllabus
- Keep language simple — imagine explaining to a 16-year-old student
- Do NOT copy the original explanations verbatim; rewrite and simplify them
`.trim();

  const raw = await callGemini(prompt);

  // Strip any accidental markdown fences
  const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // AI returned non-JSON — wrap the raw text gracefully
    return {
      simplified_explanation: raw,
      key_points: ['Review the original explanations above for key exam points.'],
    };
  }

  const simplified = typeof parsed.simplified_explanation === 'string'
    ? parsed.simplified_explanation.trim()
    : raw;

  const key_points = Array.isArray(parsed.key_points)
    ? parsed.key_points.filter((p) => typeof p === 'string').slice(0, 5)
    : ['Review the original explanations above for key exam points.'];

  return { simplified_explanation: simplified, key_points };
}

/**
 * formatResponse — shape a cached DB row into the public response format.
 */
function formatResponse({ meta, cached, from_cache }) {
  return {
    topic_id:               meta.topic_id      || null,
    subtopic_id:            meta.subtopic_id   || null,    // null for topic scope
    topic_name:             meta.topic_name    || null,
    subtopic_name:          meta.subtopic_name || null,
    subject_name:           meta.subject_name  || null,
    exam_board:             meta.exam_board    || null,
    exam_board_code:        meta.exam_board_code || null,
    source_question_count:  cached.source_question_count,
    from_cache,
    cached_at:              cached.updated_at  || null,
    original_explanation:   cached.original_explanation,
    simplified_explanation: cached.simplified_explanation,
    key_points:             Array.isArray(cached.key_points)
                              ? cached.key_points
                              : JSON.parse(cached.key_points || '[]'),
  };
}

// =============================================================================
// EXPORTS
// =============================================================================
module.exports = { enhanceExplanation };


