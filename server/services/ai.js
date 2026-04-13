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
// v9 — Downgraded primary to gemini-1.5-flash (stable, handles load)
//      Added automatic 503 retry with fallback chain
//      Clean user-facing errors — raw Google errors never reach the frontend
//
// Public API (signature unchanged from v4):
//   generate(prompt, task, options?) → Promise<string>
//
// options = { userId?, role? }
//   - userId: enables per-user rate limiting (v7) and usage logging (v6)
//   - role:   'admin' bypasses rate limit (v7)
//   - both are optional — omitting them keeps behaviour identical to v4
//
// Streaming (generateContentStream) is NOT handled here.
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ═══════════════════════════════════════════════════════════════════════════
// v5 — ROUTING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// Tasks that warrant Claude (complex multi-step reasoning).
// All other tasks use Gemini.
const CLAUDE_TASKS = new Set(['complex_reasoning']);

// v9: Primary model downgraded to gemini-1.5-flash — production-stable,
// handles high load reliably. Switch back to gemini-2.5-flash once Google
// stabilises capacity (usually within a few weeks of a new model launch).
const GEMINI_MODEL_MAP = {
  'generate-questions': 'gemini-1.5-flash',
  'chat':               'gemini-1.5-flash',
  'explain':            'gemini-1.5-flash',
  'hint':               'gemini-1.5-flash',
  'notes':              'gemini-1.5-flash',
  'remediation':        'gemini-1.5-flash',
  'essay-mark':         'gemini-1.5-flash',
  'default':            'gemini-1.5-flash',
};

// v9: Fallback chain — tried in order if primary returns 503 (overloaded).
// gemini-1.5-pro is more capable and has separate capacity quota.
const FALLBACK_CHAIN = ['gemini-1.5-pro', 'gemini-1.0-pro'];

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

// ── v9: Gemini call with automatic retry + fallback chain ─────────────────────
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
      return result.response.text().trim();
    } catch (err) {
      const msg   = err?.message || '';
      const is503 = msg.includes('503') ||
                    msg.includes('Service Unavailable') ||
                    msg.includes('high demand') ||
                    msg.includes('UNAVAILABLE');

      if (is503 && !isLast) {
        // Auto-retry with next model in chain — transparent to caller
        console.warn(`[ai.js] ${modelName} overloaded (503) — trying ${modelsToTry[i + 1]}`);
        continue;
      }

      // All models exhausted or non-503 error — throw clean user-facing error.
      // Raw Google error messages (with googleapis.com URLs) never reach frontend.
      throw Object.assign(
        new Error(is503
          ? 'AI is temporarily busy. Please try again in a moment.'
          : 'AI request failed. Please try again.'),
        { statusCode: is503 ? 503 : 500 }
      );
    }
  }
}

// ── v5: Claude call (no new npm install — uses SDK if already present) ────────
async function _callClaude(prompt) {
  // Dynamically required so the server still starts if SDK is absent.
  // If ANTHROPIC_API_KEY is missing or SDK throws, generate() catches it
  // and falls back to Gemini automatically.
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

// Redis client — tries project config first, then ioredis, then fails open.
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
      _redis.on('error', () => {}); // suppress — we fail-open anyway
    } catch {
      _redis = null;
    }
  }
  return _redis;
}

/**
 * Returns { allowed: true } or { allowed: false, error: string }.
 * Always returns { allowed: true } if Redis is unavailable (fail-open).
 */
async function _checkRateLimit(userId, role) {
  if (!userId)          return { allowed: true }; // no user context — pass through
  if (role === 'admin') return { allowed: true }; // admins never throttled

  const redis = _getRedis();
  if (!redis) return { allowed: true }; // Redis unavailable — fail-open

  try {
    const key   = `ai_rate:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW); // set TTL on first increment only
    }
    if (count > RATE_LIMIT_MAX) {
      return { allowed: false, error: 'Rate limit exceeded. Try again shortly.' };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // Redis error — fail-open, never block the user
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v6 — TOKEN USAGE LOGGING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Logs approximate token usage to console after every successful AI call.
 * Estimation: 1 token ≈ 4 characters (standard industry approximation).
 * No external calls, no DB writes — logging only.
 */
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
  if (userId) log.userId = userId; // include only when available
  console.log('[AI Usage]', JSON.stringify(log));
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * generate(prompt, task, options?) → Promise<string>
 *
 * @param {string} prompt           Full prompt text — built by the caller, never modified here
 * @param {string} task             Routing key (see GEMINI_MODEL_MAP + CLAUDE_TASKS)
 * @param {object} [options={}]     Optional context
 * @param {string} [options.userId] Used for rate limiting (v7) and usage logging (v6)
 * @param {string} [options.role]   'admin' bypasses rate limit (v7)
 * @returns {Promise<string>}       Trimmed text from the AI provider
 *
 * Throws on rate limit (err.statusCode === 429) or provider failure.
 * Callers keep their own try/catch — this function does not swallow errors.
 */
async function generate(prompt, task = 'default', options = {}) {
  const { userId, role } = options;

  // ── v7: rate limit check (before touching any AI provider) ─────────────────
  const rateCheck = await _checkRateLimit(userId, role);
  if (!rateCheck.allowed) {
    const err = new Error(rateCheck.error);
    err.statusCode = 429;
    throw err;
  }

  let text;
  let provider;

  // ── v5: route to Claude for complex_reasoning; Gemini for everything else ───
  if (CLAUDE_TASKS.has(task) && process.env.ANTHROPIC_API_KEY) {
    try {
      text     = await _callClaude(prompt);
      provider = 'claude';
    } catch (claudeErr) {
      // v5: Claude failed → fall back to Gemini, never surface the error upward
      console.warn(`[ai.js] Claude failed for task "${task}", falling back to Gemini:`, claudeErr.message);
      text     = await _callGemini(prompt, task);
      provider = 'gemini-fallback';
    }
  } else {
    // Default path — all current tasks (chat, explain, hint, notes, remediation,
    // generate-questions) hit this branch since none are in CLAUDE_TASKS
    text     = await _callGemini(prompt, task);
    provider = 'gemini';
  }

  // ── v6: log token estimate (after successful call, non-blocking) ────────────
  _logUsage({ task, provider, prompt, response: text, userId });

  return text;
}

module.exports = { generate };
