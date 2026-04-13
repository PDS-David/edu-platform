'use strict';
// server/services/aiService.js
// ─────────────────────────────────────────────────────────────────────────────
// LEGACY ADAPTER — do not add new features here.
//
// generateAIResponse    → delegates to services/ai.js generate() hub
// generateAIQuestion    → delegates to services/aiQuestionGenerator.js
// generateHint          → routes through ai.js hub ('hint' task)
// generateExplanation   → routes through ai.js hub ('explain' task)
// generateRevisionNotes → routes through ai.js hub ('notes' task)
// markImage             → direct Gemini multimodal call (architecture rule)
//
// This file is retained because aiWorker.js and tool files import from it.
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 }         = require('uuid');
const { QueryTypes }         = require('sequelize');
const sequelize              = require('../config/database');
const { generate }           = require('./ai');                      // ← central hub
const { generateAIQuestion: _generateAIQuestion } =
  require('./aiQuestionGenerator');                                   // ← canonical impl

// ── GEMINI_API_KEY is checked lazily inside ai.js — no top-level throw here ──

if (process.env.NODE_ENV !== 'production') {
  console.log('[aiService] Loaded — routing through ai.js hub (gemini-2.5-flash)');
}

const FALLBACK_REPLY =
  'AISchoolonair AI is temporarily unavailable. Please try again later. ';

// ─────────────────────────────────────────────────────────────────────────────
// Quota / availability error detector
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// safeGenerate — wraps generate() with quota-aware error handling
// ─────────────────────────────────────────────────────────────────────────────
async function safeGenerate(prompt, task = 'chat') {
  try {
    const text = await generate(prompt, task);
    if (!text) throw new Error('Empty response');
    return text.trim();
  } catch (err) {
    console.error('[aiService Error]', err.message);
    if (isQuotaOrAvailabilityError(err)) return null;
    throw new Error('AI provider request failed');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateAIResponse
// ─────────────────────────────────────────────────────────────────────────────
async function generateAIResponse({ message, user, context = {} }) {
  const { subject_name = '', subtopic_name = '', weak_topics = [] } = context;

  const contextLines = [
    subject_name  && `Subject: ${subject_name}`,
    subtopic_name && `Subtopic: ${subtopic_name}`,
    weak_topics?.length && `Student weak areas: ${weak_topics.join(', ')}`,
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

  const reply = await safeGenerate(prompt, 'chat');
  return reply ?? FALLBACK_REPLY;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateAIQuestion — delegates to the canonical implementation
// ─────────────────────────────────────────────────────────────────────────────
async function generateAIQuestion(conceptId, studentId) {
  return _generateAIQuestion(conceptId, studentId);
}

// ─────────────────────────────────────────────────────────────────────────────
// generateHint
// Socratic hint for a multiple-choice question without revealing the answer.
//
// @param {object} params
//   questionText {string}   — the question
//   options      {array}    — array of { option_text, is_correct }
//   topic        {string}   — topic/subtopic context
//   examBoard    {string}   — e.g. 'WAEC'
//   hintLevel    {number}   — 1 (subtle) | 2 (moderate) | 3 (strong)
// @returns {Promise<string>}
// ─────────────────────────────────────────────────────────────────────────────
async function generateHint({ questionText, options = [], topic, examBoard, hintLevel = 1 }) {
  const hintDescriptions = {
    1: 'Give a very subtle conceptual nudge — do not mention the answer at all. Just point the student toward the relevant principle.',
    2: 'Give a moderate hint. Narrow down the approach without revealing the answer. Mention what to consider.',
    3: 'Give a strong hint. Eliminate obviously wrong options and guide the student to the correct reasoning path without stating the answer outright.',
  };

  const optionList = options
    .map((o, i) => `${String.fromCharCode(65 + i)}. ${o.option_text}`)
    .join('\n');

  const prompt = `
You are a Socratic tutor helping a Nigerian secondary school student with an exam question.

Question: ${questionText}
Options:
${optionList}
Topic: ${topic || 'General'}
Exam Board: ${examBoard || 'WAEC'}

Hint level ${hintLevel}/3: ${hintDescriptions[hintLevel] || hintDescriptions[1]}

Rules:
- Do NOT reveal or imply the correct answer directly.
- Keep the hint to 2–3 sentences maximum.
- Use plain English suitable for a Nigerian SS2/SS3 student.
- Do not use markdown formatting.
`.trim();

  const hint = await safeGenerate(prompt, 'hint');
  return hint ?? 'Think carefully about the key concept this question is testing.';
}

// ─────────────────────────────────────────────────────────────────────────────
// generateExplanation
// Post-answer explanation for a multiple-choice question.
//
// @param {object} params
//   questionText        {string}  — the question text
//   options             {array}   — all options { option_text, is_correct }
//   correctOptionText   {string}  — text of the correct option
//   selectedOptionText  {string}  — text the student selected
//   wasCorrect          {boolean}
//   existingExplanation {string}  — stored explanation to enhance (optional)
//   topic               {string}
//   examBoard           {string}
// @returns {Promise<string>}
// ─────────────────────────────────────────────────────────────────────────────
async function generateExplanation({
  questionText,
  options = [],
  correctOptionText,
  selectedOptionText,
  wasCorrect,
  existingExplanation,
  topic,
  examBoard,
}) {
  const optionList = options
    .map((o, i) => `${String.fromCharCode(65 + i)}. ${o.option_text}${o.is_correct ? ' ✓' : ''}`)
    .join('\n');

  const outcomeContext = wasCorrect
    ? `The student answered correctly (selected: "${selectedOptionText}").`
    : `The student answered incorrectly. They selected "${selectedOptionText}" but the correct answer is "${correctOptionText}".`;

  const existingBlock = existingExplanation
    ? `\nStored explanation for context:\n${existingExplanation}\n`
    : '';

  const prompt = `
You are an expert Nigerian secondary school examiner explaining a multiple-choice question.

Question: ${questionText}
Options:
${optionList}
Topic: ${topic || 'General'}
Exam Board: ${examBoard || 'WAEC'}

${outcomeContext}
${existingBlock}

Your task:
- Explain clearly WHY the correct answer is right.
- If the student was wrong, gently explain why their choice was incorrect.
- Connect to the underlying concept they need to understand.
- Keep the explanation to 3–5 sentences.
- Use plain English suitable for a Nigerian SS2/SS3 student.
- Do not use markdown formatting.
`.trim();

  const explanation = await safeGenerate(prompt, 'explain');
  return explanation ?? (existingExplanation || 'Please review your notes on this topic.');
}

// ─────────────────────────────────────────────────────────────────────────────
// generateRevisionNotes
// Generates concise revision notes on a topic.
//
// @param {object} params
//   subjectName {string}
//   topicName   {string}
//   examBoard   {string}
// @returns {Promise<string>}
// ─────────────────────────────────────────────────────────────────────────────
async function generateRevisionNotes({ subjectName, topicName, examBoard }) {
  const prompt = `
You are an expert Nigerian secondary school tutor writing revision notes.

Subject: ${subjectName || 'General'}
Topic: ${topicName}
Exam Board: ${examBoard || 'WAEC/NECO/JAMB'}

Write clear, concise revision notes on this topic suitable for Nigerian SS2/SS3 students.
Structure your notes as:

KEY CONCEPTS:
(3–5 bullet points of the most important ideas)

DEFINITIONS:
(Any key terms the student must know)

EXAM TIPS:
(What WAEC/JAMB specifically tests on this topic)

Keep each section brief. Use plain English. Do not use markdown.
`.trim();

  const notes = await safeGenerate(prompt, 'notes');
  return notes ?? 'Revision notes are temporarily unavailable. Please try again shortly.';
}

// ─────────────────────────────────────────────────────────────────────────────
// markImage
// Multimodal: marks a photo of handwritten student work.
// Direct Gemini call — kept here per architecture rule (multimodal stays direct).
//
// @param {object} params
//   imageBase64  {string}  — base64-encoded image data
//   mimeType     {string}  — e.g. 'image/jpeg'
//   questionText {string}  — the question being answered
//   markScheme   {string|null}
//   subject      {string}
//   examBoard    {string}
//   totalMarks   {number}
// @returns {Promise<object>} { marks_awarded, total_marks, feedback, strengths, improvements }
// ─────────────────────────────────────────────────────────────────────────────
async function markImage({
  imageBase64,
  mimeType = 'image/jpeg',
  questionText,
  markScheme = null,
  subject = 'General',
  examBoard = 'WAEC',
  totalMarks = 10,
}) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[markImage] GEMINI_API_KEY not configured');
    return { success: false, error: 'AI service not configured' };
  }
  if (!imageBase64) {
    throw new Error('imageBase64 is required for markImage');
  }

  // Multimodal stays as a direct Gemini call per architecture rules
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const markSchemeBlock = markScheme
    ? `\nMark Scheme:\n${markScheme}`
    : '\n(No mark scheme provided — use your expert judgment.)';

  const prompt = `
You are an experienced ${examBoard} examiner marking a student's handwritten answer.

Subject: ${subject}
Question: ${questionText}
Total marks available: ${totalMarks}
${markSchemeBlock}

Look at the student's handwritten answer in the image and:
1. Award marks out of ${totalMarks}
2. Identify strengths in the answer
3. Identify what is missing or incorrect
4. Give constructive feedback

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "marks_awarded": <number>,
  "total_marks": ${totalMarks},
  "percentage": <number>,
  "feedback": "<2-3 sentence overall feedback>",
  "strengths": ["<point>", "<point>"],
  "improvements": ["<point>", "<point>"]
}
`.trim();

  try {
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: imageBase64 } },
    ]);
    const raw     = result.response.text().trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[aiService markImage]', err.message);
    throw new Error('Image marking failed: ' + err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  generateAIResponse,
  generateAIQuestion,
  generateHint,
  generateExplanation,
  generateRevisionNotes,
  markImage,
};
