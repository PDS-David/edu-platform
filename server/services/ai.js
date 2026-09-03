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
// v17 — Added OpenAI as a second provider. Not a genuinely "free" API (no
//        ongoing free tier from OpenAI — a new account gets a small one-time
//        trial credit, then it's pay-per-token like any other API), but
//        wired the same way regardless: an OPENAI_API_KEY env var, same
//        generate() signature, opt-in via a new `provider` option so every
//        existing call site (which never passes `provider`) keeps routing
//        to Gemini unchanged. Uses gpt-4o-mini, OpenAI's cheapest current
//        chat model, called via native fetch (Node 22 has it built in) —
//        no new npm dependency for a single REST call.
//
// v18 — HOTFIX (2026-09-03): gemini-2.5-flash/-flash-lite started 404ing with
//        "This model ... is no longer available to new users" for the newly
//        rotated GEMINI_API_KEY (previous key was publicly exposed in git
//        history and had to be replaced) — Google has cut off the entire 2.5
//        generation from new keys/projects ahead of its confirmed Oct 16,
//        2026 full shutdown, not just this one model. Migrated primary +
//        fallback to the 3.5 generation, one tier up from what was already
//        running (flash primary / flash-lite fallback), matching Google's
//        own error-message guidance and current model docs
//        (ai.google.dev/gemini-api/docs/models, checked 2026-09-03):
//        gemini-3.5-flash is the stable previous-generation Flash model
//        (not a "-latest"/"-preview" alias — same stability bar this file's
//        v16 note already established), gemini-3.5-flash-lite is its
//        cost/latency-optimized sibling. This does not touch the
//        complex_reasoning/OpenAI routing added in v17.
//
// Public API (signature EXTENDED, backward compatible):
//   generate(prompt, task, options?) → Promise<string>
//   options.provider: 'gemini' (default, unchanged) | 'openai'
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenAI } = require('@google/genai');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// See v18 note above — migrated off the 2.5 generation, which Google has
// already cut off for new API keys/projects (confirmed via direct
// generateContent call against the current production key, 2026-09-03:
// 404 "This model models/gemini-2.5-flash-lite is no longer available to
// new users"), ahead of its full shutdown on/after Oct 16, 2026 for
// everyone else too.
const GEMINI_MODEL_MAP = {
  'generate-questions': 'gemini-3.5-flash',
  'chat':               'gemini-3.5-flash',
  'explain':            'gemini-3.5-flash',
  'hint':               'gemini-3.5-flash',
  'notes':              'gemini-3.5-flash',
  'remediation':        'gemini-3.5-flash',
  'essay-mark':         'gemini-3.5-flash',
  'complex_reasoning':  'gemini-3.5-flash',
  'default':            'gemini-3.5-flash',
};

// Fallback chain — tried in order if primary fails (503, 429, 404, etc.)
//   1. gemini-3.5-flash       — primary (current stable GA model, see v18 note)
//   2. gemini-3.5-flash-lite  — same generation, lighter/cheaper, separate
//                                 quota pool so primary-quota exhaustion
//                                 doesn't take this down too
//
// NOTE: keep this chain free of "-latest"/"-preview" aliases. Both alias
// types can silently start pointing at an experimental or rate-limited
// model without any code change here — defeating the purpose of a fallback.
// Pin to dated/named stable releases only. Given the 2.5 generation's cutoff
// happened with no advance code-visible warning (Google's own shutdown-date
// guidance said "no earlier than October 16, 2026" — the actual new-key
// cutoff came weeks before that), revisit this comment block periodically
// rather than trusting a single published shutdown date.
const FALLBACK_CHAIN = ['gemini-3.5-flash-lite'];

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
// OPENAI PROVIDER (v17)
// ═══════════════════════════════════════════════════════════════════════════

// Same routing-key shape as GEMINI_MODEL_MAP, one model for every task —
// gpt-4o-mini is OpenAI's cheapest current chat-completions model and is
// more than capable for this app's tasks (explanations, feedback, question
// generation). Kept as its own map (not reusing GEMINI_MODEL_MAP) since the
// two providers' model catalogs are unrelated — a future task-specific
// upgrade on one provider shouldn't have to touch the other's routing.
const OPENAI_MODEL_MAP = {
  'generate-questions': 'gpt-4o-mini',
  'chat':               'gpt-4o-mini',
  'explain':            'gpt-4o-mini',
  'hint':               'gpt-4o-mini',
  'notes':              'gpt-4o-mini',
  'remediation':        'gpt-4o-mini',
  'essay-mark':         'gpt-4o-mini',
  'complex_reasoning':  'gpt-4o-mini',
  'default':            'gpt-4o-mini',
};

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ── OpenAI call — single model, no fallback chain ──────────────────────────
// Deliberately simpler than _callGemini: OpenAI doesn't need a same-provider
// fallback chain the way Gemini does here (that chain exists specifically
// because Gemini model names get deprecated/retired under this app, per the
// v9-v16 history above) — a single stable model id is enough for a second
// provider whose main job is being an alternative to Gemini itself, not
// needing its own internal fallback too. If gpt-4o-mini itself becomes
// unavailable, generate() callers can retry with provider: 'gemini' instead
// of this function retrying within OpenAI.
async function _callOpenAI(prompt, task) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const model = OPENAI_MODEL_MAP[task] || OPENAI_MODEL_MAP.default;

  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    // Network-level failure (DNS, timeout, connection refused) — no HTTP
    // status to inspect at all.
    throw Object.assign(
      new Error('AI is temporarily busy. Please try again in a moment.'),
      { statusCode: 503 }
    );
  }

  if (!response.ok) {
    const status = response.status;
    let bodyText = '';
    try { bodyText = (await response.text()).slice(0, 200); } catch {}
    console.error(`[ai.js] OpenAI request failed. Status: ${status}. Body: ${bodyText}`);

    const isRetryable = status === 429 || status === 503 || status >= 500;
    throw Object.assign(
      new Error(isRetryable
        ? 'AI is temporarily busy. Please try again in a moment.'
        : 'AI request failed. Please try again.'),
      { statusCode: isRetryable ? 503 : 500 }
    );
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text?.trim()) {
    throw new Error('Empty response from model');
  }

  return text.trim();
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
 * @param {string} task             Routing key (see GEMINI_MODEL_MAP / OPENAI_MODEL_MAP)
 * @param {object} [options={}]
 * @param {string} [options.userId]   For rate limiting + usage logging
 * @param {string} [options.role]     'admin' bypasses rate limit
 * @param {string} [options.provider] 'gemini' (default) | 'openai'. Every
 *   existing call site omits this and is completely unaffected — added in
 *   v17 as an opt-in second provider, not a replacement for the default.
 * @returns {Promise<string>}       Trimmed text from the selected provider
 */
async function generate(prompt, task = 'default', options = {}) {
  const { userId, role, provider = 'gemini' } = options;

  const rateCheck = await _checkRateLimit(userId, role);
  if (!rateCheck.allowed) {
    const err = new Error(rateCheck.error);
    err.statusCode = 429;
    throw err;
  }

  const useOpenAI = provider === 'openai' || provider === 'chatgpt';
  const text = useOpenAI ? await _callOpenAI(prompt, task) : await _callGemini(prompt, task);

  _logUsage({ task, provider: useOpenAI ? 'openai' : 'gemini', prompt, response: text, userId });

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
