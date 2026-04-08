'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY in environment variables');
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
console.log(`🤖 Gemini model loaded: ${GEMINI_MODEL}`);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
});

const FALLBACK_REPLY =
  'AISchoolonair AI is temporarily unavailable. Please try again later. 📚';

function isQuotaOrAvailabilityError(err) {
  const msg = err?.message || '';
  return (
    err?.status === 429 ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Too Many Requests') ||
    msg.includes('limit: 0')
  );
}

async function safeGenerate(prompt) {
  try {
    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.();
    if (!text) throw new Error('Empty response from Gemini');
    return text.trim();
  } catch (err) {
    console.error('[Gemini Error]', err.message || err);
    if (isQuotaOrAvailabilityError(err)) return null;
    throw new Error('AI provider request failed');
  }
}

async function generateAIResponse({ message, user, context = {} }) {
  const { subject_name = '', subtopic_name = '', weak_topics = [] } = context;

  const contextLines = [
    subject_name && `Subject: ${subject_name}`,
    subtopic_name && `Subtopic: ${subtopic_name}`,
    weak_topics?.length && `Student weak areas: ${weak_topics.join(', ')}`
  ].filter(Boolean);

  const systemContext = contextLines.length
    ? `\nCurrent study context:\n${contextLines.join('\n')}\n`
    : '';

  const prompt = `
You are AISchoolonair AI, a friendly and expert study assistant for Nigerian secondary school students preparing for WAEC, NECO, and JAMB exams.

${systemContext}

Your role:
- Answer academic questions clearly and concisely.
- Use Nigerian curriculum examples where relevant.
- Encourage the student when appropriate.
- Keep responses under 200 words unless necessary.
- Never invent facts.

Student message:
${message}
`.trim();

  const reply = await safeGenerate(prompt);
  return reply ?? FALLBACK_REPLY;
}

async function generateAIQuestion(conceptId, studentId) {
  const conceptRows = await sequelize.query(
    `SELECT c.id, c.name, c.difficulty_level, s.name AS subtopic_name
     FROM concepts c
     LEFT JOIN subtopics s ON s.id = c.subtopic_id
     WHERE c.id = :conceptId`,
    { replacements: { conceptId }, type: QueryTypes.SELECT }
  );

  if (!conceptRows.length) throw new Error('Concept not found');
  const concept = conceptRows[0];

  const prompt = `
You are an AI question generator for Nigerian secondary school students.

Generate ONE multiple choice question.

Return JSON ONLY.

CONCEPT: ${concept.name}
SUBTOPIC: ${concept.subtopic_name}
DIFFICULTY: ${concept.difficulty_level}

FORMAT:
{
  "question": "...",
  "options": [
    {"text": "...", "is_correct": true},
    {"text": "...", "is_correct": false},
    {"text": "...", "is_correct": false},
    {"text": "...", "is_correct": false}
  ],
  "explanation": "..."
}
`.trim();

  const rawText = await safeGenerate(prompt);
  if (!rawText) throw new Error('AI unavailable — cannot generate question now');

  const cleaned = rawText.replace(/```json|```/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error('Invalid AI JSON response'); }

  if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length !== 4)
    throw new Error('Malformed AI output');

  const questionId = uuidv4();
  await sequelize.query(
    `INSERT INTO questions (id, question_text, explanation, source, status)
     VALUES (:id, :question, :explanation, 'ai_generated', 'pending')`,
    { replacements: { id: questionId, question: parsed.question, explanation: parsed.explanation || null }, type: QueryTypes.INSERT }
  );

  for (const opt of parsed.options) {
    await sequelize.query(
      `INSERT INTO answer_options (id, question_id, option_text, is_correct)
       VALUES (:id, :questionId, :text, :correct)`,
      { replacements: { id: uuidv4(), questionId, text: opt.text, correct: opt.is_correct }, type: QueryTypes.INSERT }
    );
  }

  await sequelize.query(
    `INSERT INTO question_concepts (question_id, concept_id)
     VALUES (:questionId, :conceptId)`,
    { replacements: { questionId, conceptId }, type: QueryTypes.INSERT }
  );

  return questionId;
}

module.exports = { generateAIResponse, generateAIQuestion };