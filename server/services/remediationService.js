'use strict';
// server/services/remediationService.js
// Adaptive remediation engine: detects weak concepts and generates
// targeted AI practice questions for each student automatically.
//
// Exported:
//   generateRemediationSet(studentId) → { studentId, conceptSets: [...] }
//
// v4 AI COST CONTROL:
//   Removed GoogleGenerativeAI import and _model singleton / getModel().
//   generateAIQuestion() now calls generate() from services/ai.js.
//   withTimeout() wrapper preserved — it now wraps generate() directly.

const { QueryTypes }      = require('sequelize');
const sequelize           = require('../config/database');
const { getWeakConcepts } = require('./weakConceptService');
// v4: central AI hub replaces inline GoogleGenerativeAI + getModel() singleton
const { generate }        = require('./ai');

const QUESTIONS_PER_CONCEPT = 5;
const AI_TIMEOUT_MS         = 12000;

function withTimeout(promise, ms = AI_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`AI generation timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ---------------------------------------------------------------------------
// generateAIQuestion
// ---------------------------------------------------------------------------
async function generateAIQuestion(concept, studentId) {
  const prompt = `
You are an expert Nigerian secondary school exam question setter (WAEC/JAMB/NECO).
Generate ONE multiple-choice question to help a student practise and master this concept:

CONCEPT: ${concept.name}
${concept.description ? `DESCRIPTION: ${concept.description}` : ''}
DIFFICULTY LEVEL: ${concept.difficulty_level || 1} out of 5

STUDENT CONTEXT:
- This student has low mastery (score: ${parseFloat(concept.mastery_score).toFixed(2)}) on this concept.
- Tailor the question to reinforce the foundational understanding they are missing.

RULES:
- Question must be clear and unambiguous.
- Provide exactly 4 answer options labelled A, B, C, D.
- Exactly one option must be correct.
- Write a brief explanation (2-3 sentences) of why the correct answer is right.
- Use plain English suitable for Nigerian SS2/SS3 students.
- Do NOT use markdown formatting.

Respond ONLY with a JSON object in this exact format (no other text, no code fences):
{
  "question_text": "...",
  "options": [
    { "option_text": "...", "is_correct": false },
    { "option_text": "...", "is_correct": true  },
    { "option_text": "...", "is_correct": false },
    { "option_text": "...", "is_correct": false }
  ],
  "explanation": "..."
}
`.trim();

  try {
    // v4: withTimeout wraps generate() directly — same timeout behaviour as before
    const text   = await withTimeout(generate(prompt, 'remediation'));
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (
      !parsed.question_text ||
      !Array.isArray(parsed.options) ||
      parsed.options.length !== 4 ||
      parsed.options.filter(o => o.is_correct).length !== 1
    ) {
      console.warn('[remediationService] generateAIQuestion: invalid response shape, skipping.');
      return null;
    }

    return {
      question_text: parsed.question_text,
      options:       parsed.options,
      explanation:   parsed.explanation || null,
    };
  } catch (err) {
    console.error(`[remediationService] generateAIQuestion failed for concept ${concept.id}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// persistQuestion
// ---------------------------------------------------------------------------
async function persistQuestion(question, concept, studentId) {
  try {
    // POLICY: AI-generated questions (including these auto-remediation
    // questions for a student's weak topic) must be reviewed by an admin
    // before reaching any student. status = 'pending', not 'approved' —
    // it will not be served by /api/questions/random or the quiz generator
    // until approved in the Question Review Queue.
    const qRows = await sequelize.query(
      `INSERT INTO questions
         (id, question_text, question_type, question_sub_type,
          difficulty, status, source, is_ai_generated, ai_generation_source,
          concept_hint, marks, created_at)
       VALUES
         (gen_random_uuid(), :questionText, 'multiple_choice', 'mcq',
          :difficulty, 'pending', 'community', true,
          :generationSource, :conceptHint, 1, NOW())
       RETURNING id`,
      {
        replacements: {
          questionText:     question.question_text,
          difficulty:       concept.difficulty_level <= 1 ? 'easy'
                            : concept.difficulty_level <= 3 ? 'medium'
                            : 'hard',
          generationSource: `remediation_engine:concept:${concept.id}`,
          conceptHint:      concept.name,
        },
        type: QueryTypes.SELECT,
      }
    );

    const questionId = qRows[0].id;

    for (const opt of question.options) {
      await sequelize.query(
        `INSERT INTO answer_options (id, question_id, option_text, is_correct)
         VALUES (gen_random_uuid(), :questionId, :optionText, :isCorrect)`,
        {
          replacements: {
            questionId,
            optionText: opt.option_text,
            isCorrect:  opt.is_correct,
          },
          type: QueryTypes.INSERT,
        }
      );
    }

    await sequelize.query(
      `INSERT INTO question_concepts (id, question_id, concept_id, weight, created_at)
       VALUES (gen_random_uuid(), :questionId, :conceptId, 1, NOW())
       ON CONFLICT (question_id, concept_id) DO NOTHING`,
      {
        replacements: { questionId, conceptId: concept.id },
        type: QueryTypes.INSERT,
      }
    );

    if (question.explanation) {
      await sequelize.query(
        `UPDATE questions SET explanation = :explanation WHERE id = :questionId`,
        { replacements: { explanation: question.explanation, questionId }, type: QueryTypes.UPDATE }
      );
    }

    return questionId;
  } catch (err) {
    console.error(`[remediationService] persistQuestion failed for concept ${concept.id}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// generateRemediationSet  (main export)
// ---------------------------------------------------------------------------
async function generateRemediationSet(studentId) {
  if (!studentId) throw new Error('studentId is required');

  const weakConcepts = await getWeakConcepts(studentId);

  if (weakConcepts.length === 0) {
    return {
      studentId,
      message: 'No weak concepts found. Great job keeping your mastery up!',
      conceptSets: [],
    };
  }

  const conceptSets = [];

  for (const concept of weakConcepts) {
    const generatedQuestions = [];

    const questionPromises = Array.from({ length: QUESTIONS_PER_CONCEPT }, () =>
      generateAIQuestion(concept, studentId)
    );

    const settled = await Promise.allSettled(questionPromises);

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        const questionId = await persistQuestion(result.value, concept, studentId);
        if (questionId) {
          generatedQuestions.push({
            question_id:   questionId,
            question_text: result.value.question_text,
            options:       result.value.options,
            explanation:   result.value.explanation,
          });
        }
      }
    }

    conceptSets.push({
      concept_id:      concept.id,
      concept_name:    concept.name,
      mastery_score:   concept.mastery_score,
      difficulty:      concept.difficulty_level,
      questions:       generatedQuestions,
      questions_count: generatedQuestions.length,
    });

    console.log(
      `[remediationService] Generated ${generatedQuestions.length}/${QUESTIONS_PER_CONCEPT} ` +
      `questions for concept "${concept.name}" (student ${studentId})`
    );
  }

  return {
    studentId,
    weak_concept_count: weakConcepts.length,
    conceptSets,
  };
}

module.exports = {
  generateRemediationSet,
  generateAIQuestion,
};
