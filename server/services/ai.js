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
//
// Public API (signature unchanged):
//   generate(prompt, task, options?) → Promise<string>
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenAI } = require('@google/genai');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// v15: New SDK resolves canonical model names correctly via v1 endpoint.
const GEMINI_MODEL_MAP = {
  'generate-questions': 'gemini-2.0-flash',
  'chat':               'gemini-2.0-flash',
  'explain':            'gemini-2.0-flash',
  'hint':               'gemini-2.0-flash',
  'notes':              'gemini-2.0-flash',
  'remediation':        'gemini-2.0-flash',
  'essay-mark':         'gemini-2.0-flash',
  'complex_reasoning':  'gemini-2.0-flash',
  'default':            'gemini-2.0-flash',
};

// Fallback chain — tried in order if primary fails (503, 429, 404, etc.)
//   1. gemini-2.0-flash       — primary (stable, widely available)
//   2. gemini-2.0-flash-lite  — lighter/faster, separate quota pool
//   3. gemini-2.5-flash       — newest, try last (may be under high demand)
const FALLBACK_CHAIN = ['gemini-2.0-flash-lite', 'gemini-2.5-flash'];

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
