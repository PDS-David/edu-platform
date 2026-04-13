'use strict';
// server/services/aiService.js
// ─────────────────────────────────────────────────────────────────────────────
// LEGACY ADAPTER — do not add new features here.
//
// generateAIResponse → delegates to services/ai.js generate() hub
// generateAIQuestion → delegates to services/aiQuestionGenerator.js
//
// This file is retained only because aiWorker.js and other callers import it.
// ─────────────────────────────────────────────────────────────────────────────

const { v4: uuidv4 }    = require('uuid');
const { QueryTypes }    = require('sequelize');
const sequelize         = require('../config/database');
const { generate }      = require('./ai');                          // ← central hub
const { generateAIQuestion: _generateAIQuestion } =
  require('./aiQuestionGenerator');                                  // ← Step 10 delegation

// ── GEMINI_API_KEY is checked lazily inside ai.js — no top-level throw here ──

if (process.env.NODE_ENV !== 'production') {
  console.log('[aiService] Loaded — routing through ai.js hub (gemini-2.5-flash)');
}

const FALLBACK_REPLY =
  'AISchoolonair AI is temporarily unavailable. Please try again later. ';

// ─────────────────────────────────────────────────────────────────────────────
// Quota / availability error detector (kept for callers that catch it)
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
async function safeGenerate(prompt) {
  try {
    const text = await generate(prompt, 'chat');
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

  const reply = await safeGenerate(prompt);
  return reply ?? FALLBACK_REPLY;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateAIQuestion — delegates to the canonical implementation
// ─────────────────────────────────────────────────────────────────────────────
async function generateAIQuestion(conceptId, studentId) {
  return _generateAIQuestion(conceptId, studentId);
}

module.exports = { generateAIResponse, generateAIQuestion };
