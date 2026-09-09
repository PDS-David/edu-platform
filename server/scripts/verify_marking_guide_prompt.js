#!/usr/bin/env node
// server/scripts/verify_marking_guide_prompt.js
//
// Closes a real verification gap from the Examination feature's Phase 4:
// buildEssayFeedbackPrompt's markingGuide param (added in 882a359) was
// only ever verified by reading the diff, never by actually calling the
// function and inspecting its output — and the live AI grading call
// itself has never been tested against a real model at all (no
// GEMINI_API_KEY available in any session so far).
//
// This script cannot verify the AI's grading BEHAVIOR (whether Gemini
// actually follows a marking_guide's rubric) — that needs a real API key
// and a real call, which is a manual check for whoever has one. What this
// DOES verify, deterministically and without any network call: the prompt
// construction itself is correct. Specifically:
//   1. Without markingGuide (the exact call shape used by the 3
//      pre-existing callers — questionsRoutes.js practice mode,
//      quizzes.js, studentRoutes.js test submission), the generated
//      prompt is BYTE-IDENTICAL to the original pre-Phase-4 template —
//      not just "looks similar", actually identical — proving zero
//      regression for every caller that doesn't pass the new param.
//   2. With markingGuide (the new examination submission call site), the
//      generated prompt actually contains the guide's exact text and the
//      instruction to follow it, and does NOT fall back to the
//      model-answer-comparison branch.
//
// Run: node server/scripts/verify_marking_guide_prompt.js
// Safe to re-run any time this file or ai.js's prompt template changes —
// exits non-zero on any mismatch, so it can be wired into CI later.

'use strict';
const { buildEssayFeedbackPrompt } = require('../services/ai.js');

let failures = 0;
function check(label, condition) {
  console.log(`  ${condition ? '✅' : '❌'}  ${label}`);
  if (!condition) failures++;
}

const baseArgs = {
  studentName: 'Chidi',
  questionText: 'Explain the water cycle.',
  maxMarks: 10,
  modelAnswer: 'Evaporation, condensation, precipitation, collection.',
  studentAnswer: 'Water evaporates, forms clouds, falls as rain.',
};

console.log('\n🔍 buildEssayFeedbackPrompt — markingGuide wiring verification\n');

// ── Case 1: no markingGuide — must exactly match the original pre-Phase-4
// template, reconstructed here from the actual diff in commit 882a359
// (not re-derived from the current function, which would make this
// check meaningless — a real independent expected value). ─────────────────
const EXPECTED_NO_GUIDE = `You are a warm, encouraging Nigerian exam marker (WAEC/JAMB/NECO standard), marking a student's answer — their name is Chidi.

Question: Explain the water cycle.
Maximum marks: 10
Model answer: Evaporation, condensation, precipitation, collection.
Student's answer: "Water evaporates, forms clouds, falls as rain."

Award marks out of 10 using your expert judgment. Then write feedback as natural, flowing prose addressed directly to the student — use "you" and open with their name (Chidi), never "the student". Write it as two short paragraphs, separated by a blank line: first, say plainly what they got right and acknowledge the marks earned; second, explain what was missing or could be improved (skip this second paragraph only if the answer is already complete and correct). Do not use markdown, asterisks, bullet points, or numbered lists anywhere in the feedback — plain complete sentences only. Keep the whole feedback under 100 words and keep a warm, encouraging tutor tone.

Respond ONLY with valid JSON in this exact format (no markdown fencing, no extra text outside the JSON):
{"marks_awarded": <number 0-10>, "is_correct": <true or false>, "feedback": "<the two-paragraph feedback described above, as a single string with a blank line between paragraphs>"}`;

const actualNoGuide = buildEssayFeedbackPrompt(baseArgs); // no markingGuide key at all — exact shape the 3 existing callers use
check('no-markingGuide prompt is byte-identical to the original pre-Phase-4 template', actualNoGuide === EXPECTED_NO_GUIDE);
check('no-markingGuide prompt contains "Model answer:"', actualNoGuide.includes('Model answer: Evaporation, condensation, precipitation, collection.'));
check('no-markingGuide prompt does NOT mention a marking guide at all', !actualNoGuide.includes('Marking guide'));

// ── Case 2: with markingGuide — the new examination call site's shape ────────
const GUIDE_TEXT = 'Award full marks if the answer mentions sunlight, chlorophyll, and glucose/oxygen production.';
const actualWithGuide = buildEssayFeedbackPrompt({ ...baseArgs, markingGuide: GUIDE_TEXT });

check('with-markingGuide prompt contains the exact guide text verbatim', actualWithGuide.includes(GUIDE_TEXT));
check('with-markingGuide prompt instructs the grader to follow it as the rubric',
  actualWithGuide.includes('following the marking guide above as the specific rubric for this question'));
check('with-markingGuide prompt does NOT fall back to "Model answer:" comparison',
  !actualWithGuide.includes('Model answer: Evaporation'));
check('with-markingGuide prompt still asks for the same JSON response shape',
  actualWithGuide.includes('"marks_awarded": <number 0-10>'));
check('the two prompt variants are actually different strings (branch genuinely taken)',
  actualNoGuide !== actualWithGuide);

console.log(failures === 0
  ? '\n✅ All checks passed — prompt wiring is correct.\n   NOTE: this does not verify Gemini\'s actual grading behavior with a real\n   marking guide — that still needs one live call with a real GEMINI_API_KEY.\n'
  : `\n❌ ${failures} check(s) failed.\n`);

process.exit(failures === 0 ? 0 : 1);
