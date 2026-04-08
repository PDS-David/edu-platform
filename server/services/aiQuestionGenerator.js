// server/services/aiQuestionGenerator.js
// -------------------------------------------------------------------------
// AI Question Generation Service for AISchoolonair
//
// Generates curriculum-appropriate multiple-choice questions for a given
// concept using Google Gemini, then persists them to the DB so they are
// immediately usable in quizzes and practice sessions.
//
// Exported functions:
//   generateAIQuestion(conceptId, studentId)
//
// DB tables written to:
//   questions        – the question row (is_ai_generated = TRUE)
//   answer_options   – four answer options linked to the question
//   question_concepts – links the question back to its concept
//
// Requires: GEMINI_API_KEY in .env
//           @google/generative-ai (already in package.json)
// -------------------------------------------------------------------------
'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { QueryTypes }         = require('sequelize');
const sequelize              = require('../config/database');

// ---------------------------------------------------------------------------
// Gemini singleton (mirrors the pattern in aiService.js)
// ---------------------------------------------------------------------------
let _model = null;
function getModel() {
  if (_model) return _model;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  _model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  return _model;
}

// ---------------------------------------------------------------------------
// Difficulty mapper
// Maps the integer difficulty_level stored in concepts (1–5) to the
// VARCHAR difficulty used in the questions table ('easy'|'medium'|'hard').
// ---------------------------------------------------------------------------
function mapDifficulty(level) {
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  return 'hard';
}

// ---------------------------------------------------------------------------
// PRIMARY ENTRY POINT
// ---------------------------------------------------------------------------
/**
 * generateAIQuestion(conceptId, studentId)
 *
 * @param {string} conceptId  UUID of the concept row.
 * @param {string} studentId  UUID of the student who triggered generation
 *                            (stored for audit / attribution).
 * @returns {Promise<object>} The newly created question row with its options.
 * @throws  {Error}           If the concept is not found or AI call fails.
 */
async function generateAIQuestion(conceptId, studentId) {
  // ---- Step 1: Fetch concept metadata ------------------------------------
  const conceptRows = await sequelize.query(
    `SELECT
       c.name            AS concept_name,
       c.difficulty_level,
       c.subtopic_id,
       s.name            AS subtopic_name,
       s.subject_id,
       s.exam_board_id
     FROM concepts   c
     JOIN subtopics  s ON s.id = c.subtopic_id
     WHERE c.id = :conceptId`,
    { replacements: { conceptId }, type: QueryTypes.SELECT }
  );

  if (!conceptRows.length) {
    throw Object.assign(
      new Error(`Concept not found: ${conceptId}`),
      { statusCode: 404 }
    );
  }

  const concept        = conceptRows[0];
  const difficultyText = mapDifficulty(concept.difficulty_level);

  // ---- Step 2: Build AI prompt -------------------------------------------
  const prompt = `
You are an expert Nigerian secondary-school examiner creating a multiple-choice question.

Concept: ${concept.concept_name}
Subtopic: ${concept.subtopic_name}
Difficulty: ${difficultyText} (raw level ${concept.difficulty_level}/5)

Requirements:
- Write 1 clear, unambiguous question directly testing the concept above.
- Provide exactly 4 answer options (A, B, C, D).
- Exactly one option must be correct; the others must be plausible distractors.
- The question and options must be appropriate for Nigerian SS2/SS3 curriculum level.
- Provide a concise explanation (2–4 sentences) of why the correct option is right.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "question_text": "The full question text here?",
  "options": [
    { "option_text": "Option A text", "is_correct": false },
    { "option_text": "Option B text", "is_correct": true },
    { "option_text": "Option C text", "is_correct": false },
    { "option_text": "Option D text", "is_correct": false }
  ],
  "correct_option": "B",
  "explanation": "Explanation of why option B is correct..."
}
`.trim();

  // ---- Step 3: Call Gemini -----------------------------------------------
  let aiResult;
  try {
    const model    = getModel();
    const response = await model.generateContent(prompt);
    const rawText  = response.response.text().trim();
    const clean    = rawText.replace(/```json|```/g, '').trim();
    aiResult       = JSON.parse(clean);
  } catch (err) {
    console.error('[aiQuestionGenerator] Gemini call / parse error:', err.message);
    throw new Error('AI question generation failed. Please try again.');
  }

  // Basic validation
  if (
    !aiResult.question_text ||
    !Array.isArray(aiResult.options) ||
    aiResult.options.length !== 4 ||
    !aiResult.options.some(o => o.is_correct)
  ) {
    throw new Error('AI returned an invalid question structure.');
  }

  // ---- Step 4: Save question to questions table --------------------------
  const questionInsert = await sequelize.query(
    `INSERT INTO questions (
       id,
       question_text,
       question_type,
       question_sub_type,
       difficulty,
       explanation,
       subtopic_id,
       subject_id_uuid,
       exam_board_id,
       is_ai_generated,
       ai_generation_source,
       concept_hint,
       status,
       source,
       submitted_by,
       created_at
     ) VALUES (
       gen_random_uuid(),
       :questionText,
       'multiple_choice',
       'mcq',
       :difficulty,
       :explanation,
       :subtopicId,
       :subjectId,
       :examBoardId,
       TRUE,
       'gemini-1.5-flash',
       :conceptHint,
       'approved',
       'admin_import',
       :submittedBy,
       NOW()
     )
     RETURNING id, question_text, difficulty, explanation, is_ai_generated, created_at`,
    {
      replacements: {
        questionText: aiResult.question_text,
        difficulty:   difficultyText,
        explanation:  aiResult.explanation || null,
        subtopicId:   concept.subtopic_id,
        subjectId:    concept.subject_id   || null,
        examBoardId:  concept.exam_board_id || null,
        conceptHint:  concept.concept_name,
        submittedBy:  studentId            || null,
      },
      type: QueryTypes.INSERT,
    }
  );

  const newQuestion = questionInsert[0][0];

  // ---- Step 5: Save answer options ---------------------------------------
  const savedOptions = [];
  for (let i = 0; i < aiResult.options.length; i++) {
    const opt = aiResult.options[i];
    const optInsert = await sequelize.query(
      `INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
       VALUES (gen_random_uuid(), :questionId, :optionText, :isCorrect, :orderIndex)
       RETURNING id, option_text, is_correct, order_index`,
      {
        replacements: {
          questionId:  newQuestion.id,
          optionText:  opt.option_text,
          isCorrect:   opt.is_correct,
          orderIndex:  i,
        },
        type: QueryTypes.INSERT,
      }
    );
    savedOptions.push(optInsert[0][0]);
  }

  // ---- Step 6: Link question to concept (question_concepts) --------------
  await sequelize.query(
    `INSERT INTO question_concepts (id, question_id, concept_id, weight, created_at)
     VALUES (gen_random_uuid(), :questionId, :conceptId, 1, NOW())
     ON CONFLICT (question_id, concept_id) DO NOTHING`,
    {
      replacements: { questionId: newQuestion.id, conceptId },
      type: QueryTypes.INSERT,
    }
  );

  console.log(
    `[aiQuestionGenerator] Created question ${newQuestion.id} ` +
    `for concept "${concept.concept_name}" (difficulty: ${difficultyText})`
  );

  // Return the full question + options so callers can use it immediately
  return {
    ...newQuestion,
    concept_id:   conceptId,
    concept_name: concept.concept_name,
    subtopic_name: concept.subtopic_name,
    options: savedOptions,
  };
}

module.exports = { generateAIQuestion };
