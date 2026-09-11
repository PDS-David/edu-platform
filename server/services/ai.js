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
// v19 — Automatic cross-provider fallback: if the caller didn't explicitly
//        request a provider and Gemini's own retry+fallback chain (see
//        _callGemini above) is fully exhausted, generate() now tries OpenAI
//        once before giving up, instead of surfacing the Gemini failure
//        straight to the user. This is what actually makes v17's OpenAI
//        wiring useful in practice — until this change, OPENAI_API_KEY and
//        _callOpenAI existed but nothing in the app ever called them; every
//        feature still failed outright the moment Gemini's own chain was
//        exhausted (this is what the "Failed to generate notes" / "No
//        explanation available" reports were — Gemini genuinely failing,
//        with nothing to catch it).
//
//        Deliberately safe to ship before OPENAI_API_KEY exists on the
//        server: if the key isn't configured, _callOpenAI's own
//        "OPENAI_API_KEY is not configured" error is caught here and the
//        ORIGINAL Gemini error is re-thrown instead — meaning behavior is
//        byte-for-byte unchanged from today until someone actually adds the
//        key, at which point this starts working with no further code
//        changes or deploy needed beyond that.
//
//        Explicit provider: 'openai' calls are unaffected — no fallback
//        loops back to Gemini for those; this is one-directional
//        (Gemini → OpenAI) since Gemini remains the default/primary
//        provider for cost and existing-behavior reasons, not because a
//        reverse fallback wouldn't also be reasonable — just not what was
//        asked for here.
//
// v20 — TIMEOUT FIX (PRIORITY 0, 2026-09-11): neither outbound provider
//        call had ANY timeout — a network stall never threw, so nothing
//        caught it, logged it, or moved a stuck syllabus_documents row off
//        'processing'. Added a native AbortSignal-based 30s-per-attempt
//        timeout to both _callGemini and _callOpenAI (a distinct
//        AITimeoutError, recognized by _isRetryableError() so a stalled
//        primary model now correctly falls through the existing chain
//        instead of hanging). Full reasoning — why AbortSignal over
//        Promise.race, why not the SDK's other native ClientOptions.timeout,
//        why 30s — documented inline just above AITimeoutError's definition.
//
// Public API (signature UNCHANGED from v17):
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
  'extract-syllabus':   'gemini-3.5-flash',
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
  if (err?.code === 'AI_TIMEOUT') return true; // see AITimeoutError below
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

// ═══════════════════════════════════════════════════════════════════════════
// v20 — TIMEOUT FIX (2026-09-11): PRIORITY 0 incident — syllabus extraction
// hanging in status='processing' forever with a 502 on the unrelated polling
// GET. Root cause confirmed by reading this file, not speculation: neither
// outbound provider call below had ANY timeout — a network-level stall
// doesn't throw, so nothing here ever caught it, nothing ever logged it, and
// syllabus_documents never left 'processing'.
//
// Mechanism chosen — native AbortController/AbortSignal on BOTH providers,
// not a Promise.race() wrapper. Confirmed from @google/genai v1.48.0's own
// type definitions (node_modules/@google/genai/dist/genai.d.ts) that
// GenerateContentConfig accepts a per-call `abortSignal`, so this is a
// genuinely native mechanism, not a workaround. Deliberately NOT using the
// SDK's other native option, the GoogleGenAI CLIENT-constructor-level
// `timeout` (ClientOptions.timeout, set once in _getAI()) — its own doc
// comment warns "request timeouts are retried by default, so in a
// worst-case scenario you may wait much longer than this timeout before the
// promise succeeds or fails", which would stack unpredictably on top of
// this file's OWN fallback-chain retries. A real AbortSignal was also
// specifically preferred over Promise.race() because it actually cancels
// the underlying in-flight HTTP request (real resource cleanup) rather
// than merely abandoning the await while the real request keeps running
// unseen — directly relevant given the open, unconfirmed hypothesis that a
// stalled connection may be what eventually exhausted a resource/pool limit
// and took the API process down with it (see this fix's own commit message
// for what that investigation did and didn't establish).
//
// Timeout value — 30s per individual provider attempt. Reasoning: the
// tightest real constraint in this app is SYNCHRONOUS callers (teacherRoutes
// .js's /generate-questions, questionsRoutes.js's essay-mark, etc.) awaited
// within a single HTTP request/response cycle. generate() can make up to 3
// sequential outbound attempts before giving up (primary Gemini model,
// Gemini's own one-model FALLBACK_CHAIN, then the automatic OpenAI
// fallback) — worst case, 3 x 30s = 90s. client/src/services/apiClient.js's
// TIMEOUT_AI_GENERATE (110s) is that file's own documented "kept just under
// Caddy's 120s read_timeout" ceiling for exactly this kind of call — so 90s
// worst-case leaves real headroom under both the 110s frontend wait and the
// 120s proxy ceiling, rather than eating that whole budget with nothing
// left for actual response processing. 30s is also comfortably above
// realistic legitimate latency: even this app's largest prompt (syllabus
// extraction, tens of thousands of characters) normally resolves well
// under 20s in practice, so a legitimate-but-slow response is not at real
// risk of being cut off prematurely. For the syllabus-extraction caller
// specifically — NOT synchronous (confirmed by PR #87's own finding:
// beginExtraction is fire-and-forget, the HTTP response already returned
// after the initial DB insert) — a 90s worst-case-before-'failed' is a
// perfectly reasonable background-job ceiling with no request/proxy
// deadline to race against at all.
//
// AITimeoutError is recognized by _isRetryableError() above (first check),
// so a stalled PRIMARY Gemini model now correctly engages the existing
// fallback chain instead of hanging forever — verified by tracing the
// control flow, not by producing a real network stall against Google's
// live API (not practically reproducible from here; see this fix's commit
// message for the full honesty note on what was and wasn't executed).
class AITimeoutError extends Error {
  constructor(providerLabel, ms) {
    super(`${providerLabel} request timed out after ${ms}ms with no response.`);
    this.name = 'AITimeoutError';
    this.code = 'AI_TIMEOUT';
  }
}

const AI_CALL_TIMEOUT_MS = 30_000;

// Runs `requestFn(signal)` under a hard AbortController deadline. On abort,
// re-throws as AITimeoutError (a distinct, identifiable shape this file
// controls) rather than letting whatever the SDK/fetch happens to throw on
// abort leak through — that raw shape isn't documented/guaranteed to stay
// consistent across SDK versions, and a fetch AbortError and a
// @google/genai abort rejection don't necessarily look the same, so this
// normalizes both providers to one shape _isRetryableError() only has to
// know about once.
async function _withTimeout(requestFn, providerLabel, ms = AI_CALL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await requestFn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new AITimeoutError(providerLabel, ms);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
      const response = await _withTimeout(
        (signal) => ai.models.generateContent({
          model:    modelName,
          contents: prompt,
          config:   { abortSignal: signal },
        }),
        `Gemini (${modelName})`
      );

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
  'extract-syllabus':   'gpt-4o-mini',
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
    response = await _withTimeout(
      (signal) => fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal,
      }),
      'OpenAI'
    );
  } catch (err) {
    // Network-level failure (DNS, connection refused) OR our own
    // AITimeoutError from _withTimeout above — both are "no usable
    // response came back", same friendly outcome either way. This
    // function has no further fallback of its own (see the comment above
    // _callOpenAI), so there's no need to distinguish AI_TIMEOUT from any
    // other network failure here the way _isRetryableError() does for
    // _callGemini's own retry loop.
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
 * @param {string} [options.provider] 'gemini' (default) | 'openai'. Omitted
 *   (the vast majority of call sites) means: try Gemini first, and if its
 *   own internal retry+fallback chain is fully exhausted, automatically try
 *   OpenAI once before failing (v19) — silently a no-op fallback today if
 *   OPENAI_API_KEY isn't configured yet, surfacing the original Gemini
 *   error unchanged in that case. Passing 'openai' explicitly skips Gemini
 *   entirely and calls OpenAI directly, with no fallback of its own.
 * @returns {Promise<string>}       Trimmed text from whichever provider
 *   actually served the request
 */
async function generate(prompt, task = 'default', options = {}) {
  const { userId, role, provider = 'gemini' } = options;

  const rateCheck = await _checkRateLimit(userId, role);
  if (!rateCheck.allowed) {
    const err = new Error(rateCheck.error);
    err.statusCode = 429;
    throw err;
  }

  const explicitOpenAI = provider === 'openai' || provider === 'chatgpt';

  if (explicitOpenAI) {
    const text = await _callOpenAI(prompt, task);
    _logUsage({ task, provider: 'openai', prompt, response: text, userId });
    return text;
  }

  // Default path: Gemini primary, automatic OpenAI fallback on exhaustion.
  try {
    const text = await _callGemini(prompt, task);
    _logUsage({ task, provider: 'gemini', prompt, response: text, userId });
    return text;
  } catch (geminiErr) {
    try {
      const text = await _callOpenAI(prompt, task);
      console.warn(`[ai.js] Gemini exhausted for task="${task}" — served by OpenAI fallback instead.`);
      _logUsage({ task, provider: 'openai-fallback', prompt, response: text, userId });
      return text;
    } catch (openaiErr) {
      if ((openaiErr.message || '').includes('OPENAI_API_KEY is not configured')) {
        // No fallback available at all — surface the real (Gemini) failure,
        // not a confusing "second provider isn't set up either" message.
        throw geminiErr;
      }
      console.error(
        `[ai.js] Both providers failed for task="${task}". ` +
        `Gemini: ${geminiErr.message}. OpenAI: ${openaiErr.message}.`
      );
      throw geminiErr;
    }
  }
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
// Phase 4 (Examination feature): added an optional markingGuide param
// rather than forking a sibling function, since the two prompts would
// otherwise be near-duplicates that could drift out of sync over time.
// When markingGuide is absent -- true for all three existing call sites
// (questionsRoutes.js practice mode, quizzes.js, studentRoutes.js test
// submission) -- both branches below fall through to the exact original
// text, so none of their behavior changes. Only the new examination
// submission call site (studentRoutes.js POST /examination/:id/submit)
// passes markingGuide.
function buildEssayFeedbackPrompt({ studentName, questionText, maxMarks, modelAnswer, studentAnswer, markingGuide }) {
  return `You are a warm, encouraging Nigerian exam marker (WAEC/JAMB/NECO standard), marking a student's answer${studentName ? ` — their name is ${studentName}` : ''}.

Question: ${questionText}
Maximum marks: ${maxMarks}
${markingGuide
  ? `Marking guide (follow this specific rubric when awarding marks):\n${markingGuide}`
  : `Model answer: ${modelAnswer || 'Not specified'}`}
Student's answer: "${studentAnswer}"

Award marks out of ${maxMarks} using your expert judgment${markingGuide ? ', following the marking guide above as the specific rubric for this question' : ''}. Then write feedback as natural, flowing prose addressed directly to the student — use "you"${studentName ? ` and open with their name (${studentName})` : ''}, never "the student". Write it as two short paragraphs, separated by a blank line: first, say plainly what they got right and acknowledge the marks earned; second, explain what was missing or could be improved (skip this second paragraph only if the answer is already complete and correct). Do not use markdown, asterisks, bullet points, or numbered lists anywhere in the feedback — plain complete sentences only. Keep the whole feedback under 100 words and keep a warm, encouraging tutor tone.

Respond ONLY with valid JSON in this exact format (no markdown fencing, no extra text outside the JSON):
{"marks_awarded": <number 0-${maxMarks}>, "is_correct": <true or false>, "feedback": "<the two-paragraph feedback described above, as a single string with a blank line between paragraphs>"}`;
}

module.exports = { generate, buildEssayFeedbackPrompt };
