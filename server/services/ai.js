'use strict';
// server/services/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL AI CALL HUB
//
// v4 — Centralisation: all non-streaming AI calls route through generate()
// v5 — Cost routing:   complex_reasoning → Claude (fallback Gemini)
//                      everything else   → Gemini
// v6 — Token tracking: console.log estimate for every call (no DB)
// v7 — Rate limiting:  max 20 AI requests/min per user via Redis (fail-open)
// v8 — Added essay-mark task to GEMINI_MODEL_MAP
// v9 — Downgraded primary; added 503 retry with fallback chain
// v10 — Switched to gemini-2.0-flash as primary (stable, widely available)
//       Removed deprecated gemini-1.0-pro from fallback chain
//       Widened error detection to catch 429, UNAVAILABLE, overloaded, etc.
//       All three models in chain are current and supported as of 2025
//
// Public API (signature unchanged):
//   generate(prompt, task, options?) → Promise<string>
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// Tasks that warrant Claude (complex multi-step reasoning).
const CLAUDE_TASKS = new Set(['complex_reasoning']);

// v10: gemini-2.0-flash — stable, supported, handles production load well.
// Switch to gemini-2.5-flash once Google stabilises its capacity.
const GEMINI_MODEL_MAP = {
  'generate-questions': 'gemini-2.0-flash',
  'chat':               'gemini-2.0-flash',
  'explain':            'gemini-2.0-flash',
  'hint':               'gemini-2.0-flash',
  'notes':              'gemini-2.0-flash',
  'remediation':        'gemini-2.0-flash',
  'essay-mark':         'gemini-2.0-flash',
  'default':            'gemini-2.0-flash',
};

// v10: All three are current, non-deprecated models (2025).
// Tried in order if the primary returns any capacity/availability error.
//   1. gemini-2.0-flash       — primary (fast, capable, production-ready)
//   2. gemini-2.0-flash-lite  — lighter variant, separate capacity quota
//   3. gemini-1.5-flash       — proven fallback, over a year in production
const FALLBACK_CHAIN = ['gemini-2.0-flash-lite', 'gemini-1.5-flash'];

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Gemini singleton cache ────────────────────────────────────────────────────
const _geminiModels = {};
function _getGeminiModel(modelName) {
  if (!_geminiModels[modelName]) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    _geminiModels[modelName] = genAI.getGenerativeModel({ model: modelName });
  }
  return _geminiModels[modelName];
}

// ── Helper: detect any capacity / availability error from Google ──────────────
function _isCapacityError(err) {
  const msg    = (err?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 503 ||
    status === 429 ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit')
  );
}

// ── v10: Gemini call with automatic retry + fallback chain ────────────────────
async function _callGemini(prompt, task) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const primaryModel = GEMINI_MODEL_MAP[task] || GEMINI_MODEL_MAP.default;
  const modelsToTry  = [primaryModel, ...FALLBACK_CHAIN];

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    const isLast    = i === modelsToTry.length - 1;

    try {
      const model  = _getGeminiModel(modelName);
      const result = await model.generateContent(prompt);
      const text   = result.response.text();

      if (!text?.trim()) {
        throw new Error('Empty response from model');
      }

      // Log which model actually served the request (helpful for debugging)
      if (i > 0) {
        console.log(`[ai.js] Request served by fallback model: ${modelName}`);
      }

      return text.trim();

    } catch (err) {
      const isCapacity = _isCapacityError(err);

      if (isCapacity && !isLast) {
        // Retry silently with next model in chain
        console.warn(
          `[ai.js] ${modelName} unavailable (${err?.status || 'capacity'}) ` +
          `— trying ${modelsToTry[i + 1]}`
        );
        continue;
      }

      // All models exhausted OR non-capacity error.
      // Raw Google URLs and technical details are NEVER exposed to the frontend.
      if (isCapacity) {
        throw Object.assign(
          new Error('AI is temporarily busy. Please try again in a moment.'),
          { statusCode: 503 }
        );
      }

      // Non-capacity error (bad prompt format, auth error, etc.)
      console.error(`[ai.js] Non-capacity error from ${modelName}:`, err.message);
      throw Object.assign(
        new Error('AI request failed. Please try again.'),
        { statusCode: 500 }
      );
    }
  }
}

// ── Claude call (uses SDK if already present, fails gracefully if not) ────────
async function _callClaude(prompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message   = await client.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  });
  return message.content[0].text.trim();
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
 * @param {string} task             Routing key (see GEMINI_MODEL_MAP + CLAUDE_TASKS)
 * @param {object} [options={}]
 * @param {string} [options.userId] For rate limiting + usage logging
 * @param {string} [options.role]   'admin' bypasses rate limit
 * @returns {Promise<string>}       Trimmed text from AI provider
 */
async function generate(prompt, task = 'default', options = {}) {
  const { userId, role } = options;

  // Rate limit check before touching any AI provider
  const rateCheck = await _checkRateLimit(userId, role);
  if (!rateCheck.allowed) {
    const err = new Error(rateCheck.error);
    err.statusCode = 429;
    throw err;
  }

  let text;
  let provider;

  if (CLAUDE_TASKS.has(task) && process.env.ANTHROPIC_API_KEY) {
    try {
      text     = await _callClaude(prompt);
      provider = 'claude';
    } catch (claudeErr) {
      console.warn(
        `[ai.js] Claude failed for task "${task}", falling back to Gemini:`,
        claudeErr.message
      );
      text     = await _callGemini(prompt, task);
      provider = 'gemini-fallback';
    }
  } else {
    text     = await _callGemini(prompt, task);
    provider = 'gemini';
  }

  _logUsage({ task, provider, prompt, response: text, userId });

  return text;
}

module.exports = { generate };
