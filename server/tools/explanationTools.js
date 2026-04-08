// server/tools/explanationTools.js
// ---------------------------------------------------------------------------
// AI-callable tool: concept explanation and question explanation.
//
// Wraps:
//   server/services/explanationEnhancer.js  (enhanceExplanation — cached, rich)
//   server/services/aiService.js            (generateExplanation — per-question)
//   server/services/aiService.js            (generateHint)
//   server/services/aiService.js            (generateRevisionNotes)
//
// Does NOT modify those files.
// ---------------------------------------------------------------------------

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

function getExplanationEnhancer() {
  return require('../services/explanationEnhancer');
}

function getAiService() {
  return require('../services/aiService');
}

// ---------------------------------------------------------------------------
// explainConcept(question)
//
// The primary "explain" tool. Accepts a free-text question or a topic/subtopic
// UUID and returns a structured, exam-focused explanation.
//
// @param {object} question  One of:
//   { topic_id: UUID }       — preferred: cached, rich, Gemini-enhanced
//   { subtopic_id: UUID }    — preferred: cached, rich, Gemini-enhanced
//   { text: string }         — fallback: generate fresh from the DB + Gemini
//   { question_id: UUID }    — explain a specific question's answer
//
// Output shape (topic/subtopic path):
// {
//   topic_name, subtopic_name, subject_name, exam_board,
//   simplified_explanation, key_points, from_cache,
//   source_question_count
// }
//
// Output shape (question_id path):
// {
//   question_text, correct_answer, explanation
// }
//
// Output shape (text path):
// {
//   topic: string, explanation: string (raw Gemini text)
// }
// ---------------------------------------------------------------------------
async function explainConcept(question = {}) {
  const { topic_id, subtopic_id, question_id, text, force_refresh = false } = question;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Path A: topic_id or subtopic_id — use the full enhanceExplanation pipeline
  if ((topic_id && UUID_RE.test(String(topic_id))) ||
      (subtopic_id && UUID_RE.test(String(subtopic_id)))) {
    try {
      const { enhanceExplanation } = getExplanationEnhancer();
      const result = await enhanceExplanation({ topic_id, subtopic_id, force_refresh });
      return toolSuccess('explainConcept', result);
    } catch (err) {
      return toolError('explainConcept', err.message, err, err.statusCode || 500);
    }
  }

  // Path B: question_id — explain the correct answer for a specific question
  if (question_id && UUID_RE.test(String(question_id))) {
    try {
      const rows = await sequelize.query(
        `SELECT
           q.question_text,
           q.topic,
           q.explanation,
           s.name  AS subject_name,
           eb.name AS exam_board,
           ao.option_text AS correct_answer_text
         FROM questions q
         LEFT JOIN subjects      s  ON s.id  = q.subject_id_uuid
         LEFT JOIN exam_boards   eb ON eb.id = s.exam_board_id
         LEFT JOIN answer_options ao
           ON ao.question_id = q.id AND ao.is_correct = true
         WHERE q.id = :questionId
         LIMIT 1`,
        { replacements: { questionId: question_id }, type: QueryTypes.SELECT }
      );

      if (!rows.length) {
        return toolError('explainConcept', `Question not found: ${question_id}`, null, 404);
      }

      const q = rows[0];

      // Use stored explanation if it exists; otherwise generate with Gemini
      if (q.explanation) {
        return toolSuccess('explainConcept', {
          question_text:   q.question_text,
          topic:           q.topic,
          correct_answer:  q.correct_answer_text,
          explanation:     q.explanation,
          from_cache:      true,
        });
      }

      const { generateExplanation } = getAiService();
      const generated = await generateExplanation({
        questionText:       q.question_text,
        correctOptionText:  q.correct_answer_text,
        selectedOptionText: q.correct_answer_text,
        wasCorrect:         true,
        topic:              q.topic,
        examBoard:          q.exam_board,
      });

      return toolSuccess('explainConcept', {
        question_text:  q.question_text,
        topic:          q.topic,
        correct_answer: q.correct_answer_text,
        explanation:    generated,
        from_cache:     false,
      });

    } catch (err) {
      return toolError('explainConcept', err.message, err);
    }
  }

  // Path C: free text — use the orchestrator's explain flow via Gemini
  if (text && String(text).trim()) {
    try {
      const { fetchExplanations } = require('../services/aiOrchestrator');
      const dbRows = await fetchExplanations({ topicName: String(text).trim(), limit: 3 });

      const { generateRevisionNotes } = getAiService();
      const explanation = await generateRevisionNotes({
        subjectName: null,
        topicName:   String(text).trim(),
        examBoard:   null,
      });

      return toolSuccess('explainConcept', {
        topic:              String(text).trim(),
        explanation,
        db_context_found:   dbRows.length > 0,
        source_questions:   dbRows.length,
      });

    } catch (err) {
      return toolError('explainConcept', err.message, err);
    }
  }

  return toolError(
    'explainConcept',
    'Provide one of: topic_id, subtopic_id, question_id, or text.',
    null,
    400
  );
}

// ---------------------------------------------------------------------------
// getHint(questionId, hintLevel)
//
// Returns a Socratic hint for a specific question without revealing the answer.
// Wraps aiService.generateHint with DB question lookup.
//
// @param {string} questionId  UUID
// @param {number} hintLevel   1 (subtle) | 2 (moderate) | 3 (strong)
// ---------------------------------------------------------------------------
async function getHint(questionId, hintLevel = 1) {
  if (!questionId) {
    return toolError('getHint', 'questionId is required');
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         q.question_text,
         q.topic,
         s.name  AS subject_name,
         eb.name AS exam_board,
         json_agg(json_build_object('option_text', ao.option_text, 'is_correct', ao.is_correct)
           ORDER BY ao.order_index) AS options
       FROM questions q
       LEFT JOIN subjects       s  ON s.id  = q.subject_id_uuid
       LEFT JOIN exam_boards    eb ON eb.id = s.exam_board_id
       LEFT JOIN answer_options ao ON ao.question_id = q.id
       WHERE q.id = :questionId
       GROUP BY q.id, q.question_text, q.topic, s.name, eb.name`,
      { replacements: { questionId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return toolError('getHint', `Question not found: ${questionId}`, null, 404);
    }

    const q = rows[0];
    const { generateHint } = getAiService();

    const hint = await generateHint({
      questionText: q.question_text,
      options:      q.options || [],
      topic:        q.topic,
      examBoard:    q.exam_board,
      hintLevel:    Math.min(Math.max(parseInt(hintLevel) || 1, 1), 3),
    });

    return toolSuccess('getHint', {
      question_text: q.question_text,
      topic:         q.topic,
      hint_level:    hintLevel,
      hint,
    });

  } catch (err) {
    return toolError('getHint', err.message, err);
  }
}

module.exports = { explainConcept, getHint };
