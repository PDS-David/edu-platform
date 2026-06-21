'use strict';

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { /* not installed — intent detection falls back to keyword matching */ }
const { QueryTypes }                            = require('sequelize');
const sequelize                                 = require('../config/database');
const { generateQuizByTopic }                   = require('./quizGenerator');
const { formatMemoryBlock }                     = require('./userMemory');
const tools                                     = require('../tools');
// v2: central AI hub — all Gemini calls routed through generate()
const { generate }                              = require('./ai');

//  FIXED: removed duplicate prompt builders
const {
  shouldCallTool,
  detectConfusion,
  appendFollowUp,
} = require('./eacbuddyPersonality');

// =========================================================================
// LLM CLIENTS
// =========================================================================

const anthropic = Anthropic ? new Anthropic() : null;
const CLAUDE_INTENT_MODEL = 'claude-haiku-4-5-20251001';

// v2: callLLM now routes through services/ai.js central hub.
// Model selection, rate limiting, and token logging are all handled there.
async function callLLM(prompt, maxTokens) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  return generate(prompt, 'chat');
}

// =========================================================================
// INTENT DETECTION
// =========================================================================

const SUPPORTED_INTENTS = [
  { name: 'explain_topic', description: 'Explain concepts' },
  { name: 'generate_quiz', description: 'Generate quiz questions' },
  { name: 'create_study_plan', description: 'Create study plans' },
  { name: 'general_chat', description: 'General chat' },
];

function detectIntentFallback(message) {
  const text = (message || '').toLowerCase();

  if (/\b(quiz|test me|mcq)\b/i.test(text)) return 'generate_quiz';
  if (/\b(study plan|schedule)\b/i.test(text)) return 'create_study_plan';
  if (/\b(explain|what is|define)\b/i.test(text)) return 'explain_topic';

  return 'general_chat';
}

async function detectIntent(message, context = {}) {
  if (!anthropic) return detectIntentFallback(message);
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_INTENT_MODEL,
      max_tokens: 20,
      system: 'Return only the intent name.',
      messages: [{ role: 'user', content: message }],
    });

    const raw = response.content[0].text.trim().toLowerCase();
    const valid = SUPPORTED_INTENTS.map(i => i.name);

    return valid.includes(raw) ? raw : detectIntentFallback(message);
  } catch {
    return detectIntentFallback(message);
  }
}

// =========================================================================
// PROMPT BUILDERS (LOCAL — authoritative)
// =========================================================================

function buildExplainPrompt({ message, subjectName, subtopicName, dbRows, examBoard, memoryBlock }) {
  return `
Explain clearly for WAEC/JAMB student.

Question: ${message}
Subject: ${subjectName}
Topic: ${subtopicName}

${memoryBlock || ''}

Provide:
- Explanation
- Key points
- Exam tip
`.trim();
}

function buildQuizPromptFromRows({ message, subjectName, subtopicName }) {
  return `
Generate 5 WAEC-style MCQs.

Topic: ${subtopicName}
Request: ${message}

Return JSON only.
`.trim();
}

function buildStudyPlanPrompt({ message, subjectName }) {
  return `
Create a study plan.

Subject: ${subjectName}
Request: ${message}
`.trim();
}

function buildGeneralChatPrompt({ message }) {
  return `
Respond like a friendly tutor.

Student: ${message}
`.trim();
}

// =========================================================================
// MAIN ORCHESTRATOR
// =========================================================================

async function orchestrate({ message, context = {}, conversationHistory = [], userMemory = null }) {

  const intent = await detectIntent(message, context);

  let weaknessProfile = null;
  try {
    const result = await tools.getWeaknessProfile(context.user_id);
    if (result && result.ok) weaknessProfile = result.data;
  } catch {}

  const memoryBlock = userMemory ? formatMemoryBlock(userMemory) : '';

  let structured = null;
  let reply = '';
  let dbResultsFound = false;

  try {

    // FAST PATH QUIZ
    if (intent === 'generate_quiz' && context.topic_id) {
      const quiz = await generateQuizByTopic({
        topic_id: context.topic_id,
        limit: 5,
      });

      return {
        intent,
        reply: JSON.stringify(quiz),
        structured: quiz,
        db_results_found: quiz.total_questions > 0
      };
    }

    let prompt = '';

    if (intent === 'explain_topic') {
      prompt = buildExplainPrompt({
        message,
        subjectName: context.subject_name,
        subtopicName: context.subtopic_name,
        examBoard: context.exam_board,
        memoryBlock,
        dbRows: []
      });

    } else if (intent === 'generate_quiz') {
      prompt = buildQuizPromptFromRows({
        message,
        subjectName: context.subject_name,
        subtopicName: context.subtopic_name
      });

    } else if (intent === 'create_study_plan') {
      prompt = buildStudyPlanPrompt({
        message,
        subjectName: context.subject_name
      });

    } else {
      prompt = buildGeneralChatPrompt({ message });
    }

    const rawText = await callLLM(prompt);

    if (intent === 'generate_quiz') {
      try {
        structured = JSON.parse(rawText);
      } catch {}
    }

    reply = rawText;

    if (intent !== 'generate_quiz') {
      reply = appendFollowUp(reply, intent, []);
    }

  } catch (err) {
    console.error(err.message);
    reply = 'AI temporarily unavailable.';
  }

  return {
    intent,
    reply,
    structured,
    db_results_found: dbResultsFound
  };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
  detectIntent,
  orchestrate,
};

