'use strict';
// server/routes/agentServiceRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// SHARED AGENT SERVICE — server-to-server AI endpoint
//
// Exposes this app's central AI hub (services/ai.js generate()) to other
// backends over HTTP, so this app and sts-school-app (Brainee) run the exact
// same model routing, retry/fallback chain, and rate-limit design from one
// place, instead of two independently-maintained copies.
//
// Authenticated by agentServiceAuth (X-Api-Key), not `protect` (JWT) — the
// caller is another backend, not a logged-in school user. Mounted at /agent
// in server.js, deliberately outside /api so it's obviously a different
// trust boundary from every user-facing route in this file's siblings.
//
// CONTRACT (backward-compatible additions only — do not remove/rename an
// existing field without updating every consumer — currently
// sts-school-app's backend/src/utils/ai.ts):
//   POST /agent/generate
//   Headers: { "Content-Type": "application/json", "X-Api-Key": <shared key> }
//   Body:    { "prompt": string, "task": string, "provider"?: string }
//   Success: 200 { "text": string, "provider": string }
//   Failure: non-2xx status, JSON body not guaranteed — consumers should
//            treat any non-2xx as "fall back to your own direct Gemini path"
//            rather than trying to parse an error shape from this endpoint.
//
// `provider` (added alongside "two AI agents" support, not part of the
// original contract): optional, "gemini" (default, unchanged behavior for
// every existing caller that omits it) or "openai"/"chatgpt". Lets a
// consumer pick which underlying model answers a given request — e.g. to
// compare quality, or to keep working if one provider is degraded, without
// sts-school-app needing its own separate OpenAI integration.
//
// Deliberately thin: no orchestrator, no DB lookups, no per-app business
// logic (that's what aiRoutes.js/aiChatRoute.js are for, on this app's own
// user-facing side). This route's only job is "prompt + task (+ optional
// provider) in, text out," exactly mirroring generate()'s own signature —
// so it stays reusable by any future consumer, not just sts-school-app.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { generate } = require('../services/ai');

const VALID_PROVIDERS = ['gemini', 'openai', 'chatgpt'];

// ── POST /agent/generate ─────────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { prompt, task, provider } = req.body || {};

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, error: 'prompt is required' });
  }

  if (provider !== undefined && !VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      success: false,
      error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}`,
    });
  }

  try {
    // No userId available (the caller is another backend, not a logged-in
    // user) — generate()'s per-user Redis rate limit is skipped entirely in
    // this case, same as any unauthenticated internal call to generate().
    // Traffic-level protection for this endpoint is agentServiceLimiter,
    // applied in server.js ahead of this route.
    const options = provider ? { provider } : {};
    const text = await generate(prompt, typeof task === 'string' && task ? task : 'default', options);
    const usedProvider = (provider === 'openai' || provider === 'chatgpt') ? 'openai' : 'gemini';
    return res.status(200).json({ success: true, text, provider: usedProvider });
  } catch (err) {
    const statusCode = err?.statusCode ?? 500;
    console.error('[POST /agent/generate]', err?.message);
    // No `success`/error-shape guarantee documented in the contract above on
    // purpose — consumers are told to treat any non-2xx as "fall back," not
    // to parse this body. Still returned for anyone watching logs/tools.
    return res.status(statusCode).json({ success: false, error: err?.message ?? 'AI request failed.' });
  }
});

module.exports = router;
