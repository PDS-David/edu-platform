'use strict';
// server/services/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL AI CALL HUB — v4 AI Cost Control
// All non-streaming Gemini generateContent calls route through here.
//
// Exposes:
//   generate(prompt, task) → Promise<string>
//
// Rules (v4):
//   - Streaming (generateContentStream) is NOT handled here — use it directly.
//   - No new npm dependencies — reuses @google/generative-ai already installed.
//   - No business logic — prompt construction stays in each calling file.
//   - Model selection is task-based to preserve existing per-file choices.
// ─────────────────────────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Task → model mapping ──────────────────────────────────────────────────────
// Preserves the exact model each file was using before centralisation.
// adminRoutes.js:        gemini-2.0-flash  → task: 'generate-questions'
// aiRoutes.js:           gemini-2.0-flash  → tasks: 'chat', 'explain', 'hint', 'notes'
// remediationService.js: gemini-1.5-flash  → task: 'remediation'
const MODEL_MAP = {
  'generate-questions': 'gemini-2.0-flash',
  'chat':               'gemini-2.0-flash',
  'explain':            'gemini-2.0-flash',
  'hint':               'gemini-2.0-flash',
  'notes':              'gemini-2.0-flash',
  'remediation':        'gemini-1.5-flash',
  'default':            'gemini-2.0-flash',
};

// ── Model singleton cache (one instance per model name) ───────────────────────
const _models = {};
function _getModel(modelName) {
  if (!_models[modelName]) {
    const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    _models[modelName] = genAI.getGenerativeModel({ model: modelName });
  }
  return _models[modelName];
}

// ── generate ──────────────────────────────────────────────────────────────────
/**
 * generate(prompt, task) → Promise<string>
 *
 * @param {string} prompt  Complete prompt text (built by the caller — unchanged)
 * @param {string} task    Logical task name used for model routing (see MODEL_MAP)
 * @returns {Promise<string>} Trimmed text response from the AI provider
 *
 * Throws if GEMINI_API_KEY is missing or the provider call fails.
 * Callers should keep their own try/catch — this function does NOT swallow errors.
 */
async function generate(prompt, task = 'default') {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const modelName = MODEL_MAP[task] || MODEL_MAP.default;
  const model     = _getModel(modelName);
  const result    = await model.generateContent(prompt);
  return result.response.text().trim();
}

module.exports = { generate };
