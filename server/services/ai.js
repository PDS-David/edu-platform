'use strict';
// server/services/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL AI CALL HUB
//
// v4  — Centralisation: all non-streaming AI calls route through generate()
// v5  — Cost routing:   complex_reasoning → Claude (fallback Gemini)
//                       everything else   → Gemini
// v6  — Token tracking: console.log estimate for every call (no DB)
// v7  — Rate limiting:  max 20 AI requests/min per user via Redis (fail-open)
// v8  — Added essay-mark task to GEMINI_MODEL_MAP
// v9  — Downgraded primary; added 503 retry with fallback chain
// v10 — Switched to gemini-2.0-flash as primary; removed deprecated models
// v11 — Primary changed to gemini-1.5-flash (universally available).
// v12 — gemini-1.5-x series deprecated (404). Primary: gemini-2.0-flash-001.
// v13 — Removed Claude entirely. Gemini-only.
// v14 — Fixed model name strings to versioned format.
// v15 — Migrated from deprecated @google/generative-ai to new @google/genai
//        SDK (v1.48.0+). Old SDK hit EOL August 2025 and uses v1beta endpoint
//        which no longer supports current model names.
//        New SDK uses GoogleGenAI client with ai.models.generateContent().
//        Model names simplified back to canonical short names (gemini-2.0-flash
//        etc.) which are correctly resolved by the new SDK on the v1 endpoint.
//        Removed @anthropic-ai/sdk dependency entirely.
// v16 — Fixed fallback chain pointing at retired/stale models (see below).
//
// Public API (signature unchanged):
//   generate(prompt, task, options?) → Promise<string>
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenAI } = require('@google/genai');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// v16 — FIX (2026-06): gemini-2.0-flash was retired by Google (shut down
//        June 1, 2026) and gemini-2.5-flash-preview-05-20 is a stale dated
//        preview snapshot that no longer resolves. Both fallback steps were
//        404ing, so any transient failure on the primary model fell through
//        to two dead models and surfaced as "AI is temporarily busy" even
//        though the real cause was unreachable fallbacks, not exhausted quota.
//        Primary gemini-2.5-flash remains correct — Google's June 17, 2026
//        deprecation date for the 2.5 generation was postponed; current
//        official guidance (checked 2026-06-19) gives "no earlier than
//        October 16, 2026" for gemini-2.5-flash/-pro shutdown.
//        Fallback is gemini-2.5-flash-lite only — same generation, separate
//        quota pool, and itself GA-stable (not due to shut down until at
//        least July 2026). gemini-flash-latest was considered as a second
//        fallback step but rejected: per Google's own docs, the "-latest"
//        alias resolves to an EXPERIMENTAL model with tighter rate limits,
//        not a stable one — using it as a fallback could itself become the
//        thing that's exhausted/unavailable, recreating this exact bug.
const GEMINI_MODEL_MAP = {
  'generate-questions': 'gemini-2.5-flash',
  'chat':               'gemini-2.5-flash',
  'explain':            'gemini-2.5-flash',
  'hint':               'gemini-2.5-flash',
  'notes':              'gemini-2.5-flash',
  'remediation':        'gemini-2.5-flash',
  'essay-mark':         'gemini-2.5-flash',
  'complex_reasoning':  'gemini-2.5-flash',
  'default':            'gemini-2.5-flash',
};

// Fallback chain — tried in order if primary fails (503, 429, 404, etc.)
//   1. gemini-2.5-flash       — primary (current GA model, see note above)
//   2. gemini-2.5-flash-lite  — same generation, lighter/cheaper, separate
//                                 quota pool so primary-quota exhaustion
//                                 doesn't take this down too; itself GA-stable
//
// NOTE: keep this chain free of "-latest"/"-preview" aliases. Both alias
// types can silently start pointing at an experimental or rate-limited
// model without any code change here — defeating the purpose of a fallback.
// Pin to dated/named stable releases only, and revisit this comment block
// before October 2026 when gemini-2.5-flash's own shutdown window opens.
const FALLBACK_CHAIN = ['gemini-2.5-flash-lite'];

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ── GoogleGenAI singleton ──────────────────────────────────────────────────
let _ai = null;
function _getAI() {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

// ── Helper: detect ANY retryable/unavailability error from Google ──────────
function _isRetryableError(err) {
  const msg    = (err?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 503 ||
    status === 429 ||
    status === 404 ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('404') ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('no longer available') ||
    msg.includes('not available to new users') ||
    msg.includes('not found') ||
    msg.includes('deprecated')
  );
}

// ── Gemini call with automatic retry + fallback chain ─────────────────────
async function _callGemini(prompt, task) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const primaryModel = GEMINI_MODEL_MAP[task] || GEMINI_MODEL_MAP.default;
  const modelsToTry  = [primaryModel, ...FALLBACK_CHAIN];
  const ai           = _getAI();

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    const isLast    = i === modelsToTry.length - 1;

    try {
      const response = await ai.models.generateContent({
        model:    modelName,
        contents: prompt,
      });

      const text = response.text;

      if (!text?.trim()) {
        throw new Error('Empty response from model');
      }

      if (i > 0) {
        console.log(`[ai.js] Fallback model served request: ${modelName}`);
      }

      return text.trim();

    } catch (err) {
      const isRetryable = _isRetryableError(err);

      if (isRetryable && !isLast) {
        console.warn(
          `[ai.js] ${modelName} failed (${err?.status || err?.message?.slice(0, 60)}) ` +
          `— trying ${modelsToTry[i + 1]}`
        );
        continue;
      }

      // All models exhausted OR non-retryable error.
      // Never expose raw Google URLs or technical details to the frontend,
      // but log enough detail server-side to tell "all models genuinely
      // rate-limited" apart from "a model name in the chain no longer exists".
      console.error(
        `[ai.js] All models exhausted or fatal error. ` +
        `Chain tried: ${modelsToTry.join(' -> ')}. Last error: ${err.message}`
      );

      throw Object.assign(
        new Error(isRetryable
          ? 'AI is temporarily busy. Please try again in a moment.'
          : 'AI request failed. Please try again.'),
        { statusCode: isRetryable ? 503 : 500 }
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v7 — REDIS RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

const RATE_LIMIT_MAX    = 20;  // requests per window
const RATE_LIMIT_WINDOW = 60;  // seconds

let _redis      = null;
let _redisTried = false;
function _getRedis() {
  if (_redisTried) return _redis;
  _redisTried = true;
  try {
    _redis = require('../config/redis');
  } catch {
    try {
      const Redis = require('ioredis');
      _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      _redis.on('error', () => {});
    } catch {
      _redis = null;
    }
  }
  return _redis;
}

async function _checkRateLimit(userId, role) {
  if (!userId)          return { allowed: true };
  if (role === 'admin') return { allowed: true };

  const redis = _getRedis();
  if (!redis) return { allowed: true };

  try {
    const key   = `ai_rate:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
    if (count > RATE_LIMIT_MAX) {
      return { allowed: false, error: 'Rate limit exceeded. Try again shortly.' };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v6 — TOKEN USAGE LOGGING
// ═══════════════════════════════════════════════════════════════════════════

function _logUsage({ task, provider, prompt, response, userId }) {
  const inputTokens  = Math.round(prompt.length   / 4);
  const outputTokens = Math.round(response.length / 4);
  const log = {
    feature:      task,
    provider,
    inputTokens,
    outputTokens,
    timestamp:    new Date().toISOString(),
  };
  if (userId) log.userId = userId;
  console.log('[AI Usage]', JSON.stringify(log));
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * generate(prompt, task, options?) → Promise<string>
 *
 * @param {string} prompt           Full prompt text
 * @param {string} task             Routing key (see GEMINI_MODEL_MAP)
 * @param {object} [options={}]
 * @param {string} [options.userId] For rate limiting + usage logging
 * @param {string} [options.role]   'admin' bypasses rate limit
 * @returns {Promise<string>}       Trimmed text from Gemini
 */
async function generate(prompt, task = 'default', options = {}) {
  const { userId, role } = options;

  const rateCheck = await _checkRateLimit(userId, role);
  if (!rateCheck.allowed) {
    const err = new Error(rateCheck.error);
    err.statusCode = 429;
    throw err;
  }

  const text = await _callGemini(prompt, task);

  _logUsage({ task, provider: 'gemini', prompt, response: text, userId });

  return text;
}

// ═══════════════════════════════════════════════════════════════════════════
// buildEssayFeedbackPrompt — shared prompt for AI marking of free-text
// answers (essay/structured questions, and short-answer test questions).
//
// BUG FIX: the essay-marking prompt used in questionsRoutes.js (practice
// mode) asked only for `{"marks_awarded": N, "feedback": "...", "is_correct":
// true/false}` with no instruction about tone, length, or structure — no
// personalization (never addressed the student, never used their name),
// and no paragraph guidance, so the model's `feedback` string could come
// back as a single generic sentence or a run-on list depending on how it
// felt like formatting that turn. This mirrors the (already correct)
// register used by the personalized-feedback prompt in routes/aiRoutes.js's
// POST /ai/explain: addressed to the student by name, "you" voice, plain
// flowing prose in short paragraphs, no markdown/bullets.
//
// Centralized here so every essay-marking call site (practice mode,
// teacher-assigned test submission, and image marking) asks for the same
// personalized, paragraph-style feedback instead of each having its own
// slightly different, unstructured prompt.
function buildEssayFeedbackPrompt({ studentName, questionText, maxMarks, modelAnswer, studentAnswer }) {
  return `You are a warm, encouraging Nigerian exam marker (WAEC/JAMB/NECO standard), marking a student's answer${studentName ? ` — their name is ${studentName}` : ''}.

Question: ${questionText}
Maximum marks: ${maxMarks}
Model answer: ${modelAnswer || 'Not specified'}
Student's answer: "${studentAnswer}"

Award marks out of ${maxMarks} using your expert judgment. Then write feedback as natural, flowing prose addressed directly to the student — use "you"${studentName ? ` and open with their name (${studentName})` : ''}, never "the student". Write it as two short paragraphs, separated by a blank line: first, say plainly what they got right and acknowledge the marks earned; second, explain what was missing or could be improved (skip this second paragraph only if the answer is already complete and correct). Do not use markdown, asterisks, bullet points, or numbered lists anywhere in the feedback — plain complete sentences only. Keep the whole feedback under 100 words and keep a warm, encouraging tutor tone.

Respond ONLY with valid JSON in this exact format (no markdown fencing, no extra text outside the JSON):
{"marks_awarded": <number 0-${maxMarks}>, "is_correct": <true or false>, "feedback": "<the two-paragraph feedback described above, as a single string with a blank line between paragraphs>"}`;
}

module.exports = { generate, buildEssayFeedbackPrompt };
