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
// v11 — Primary changed to gemini-1.5-flash (universally available to all
//        accounts including new Tier 1 users).
//        gemini-2.0-flash and gemini-2.5-flash restricted on new accounts.
//        Added 404 "no longer available" to fallback trigger conditions.
// v12 — gemini-1.5-flash and gemini-1.5-pro are DEPRECATED (returning 404).
//        Primary is now gemini-2.0-flash (stable, widely available).
//        Fallback chain: gemini-2.0-flash-lite → gemini-2.5-flash.
//        All 1.5-series models removed from routing config.
// v13 — Removed Claude entirely. Gemini-only.
//        complex_reasoning now also handled by gemini-2.0-flash.
//        No ANTHROPIC_API_KEY required.
//
// Public API (signature unchanged):
//   generate(prompt, task, options?) → Promise<string>
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// v12: gemini-2.0-flash is the current stable primary.
// gemini-1.5-flash and gemini-1.5-pro are deprecated and return 404.
const GEMINI_MODEL_MAP = {
  'generate-questions': 'gemini-2.0-flash',
  'chat':               'gemini-2.0-flash',
  'explain':            'gemini-2.0-flash',
  'hint':               'gemini-2.0-flash',
  'notes':              'gemini-2.0-flash',
  'remediation':        'gemini-2.0-flash',
  'essay-mark':         'gemini-2.0-flash',
  'complex_reasoning':  'gemini-2.0-flash',  // v13: was Claude, now Gemini
  'default':            'gemini-2.0-flash',
};

// Fallback chain — tried in order if primary fails (503, 429, 404, etc.)
//   1. gemini-2.0-flash      — primary (stable, widely available)
//   2. gemini-2.0-flash-lite — lighter/faster, separate quota pool
//   3. gemini-2.5-flash      — newest, try last (may be under high demand)
const FALLBACK_CHAIN = ['gemini-2.0-flash-lite', 'gemini-2.5-flash'];

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Gemini singleton cache ─────────────────────────────────────────────────
const _geminiModels = {};
function _getGeminiModel(modelName) {
  if (!_geminiModels[modelName]) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    _geminiModels[modelName] = genAI.getGenerativeModel({ model: modelName });
  }
  return _geminiModels[modelName];
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
      // Never expose raw Google URLs or technical details to the frontend.
      console.error(`[ai.js] All models exhausted or fatal error:`, err.message);

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

module.exports = { generate };
