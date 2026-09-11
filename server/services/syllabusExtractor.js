'use strict';
// server/services/syllabusExtractor.js
// Syllabus-driven topic mapping — Prompt 2, split into two parts per
// explicit instruction: (1) text extraction from the uploaded docx/pdf +
// the extraction-trigger skeleton — Part 1, merged as PR #82. (2) The AI
// prompt/JSON-parsing/storage logic — THIS part, replacing Part 1's stub
// (extractTopicStructureFromText) below with a real implementation.
//
// Triggered as a fire-and-forget background job right after upload
// completes (Part 1's own design choice, kept unchanged here — see
// syllabusRoutes.js's POST / handler).
//
// DEPENDENCY FIX (found while verifying this part, not assumed from
// reading code alone): server/utils/documentTextExtractor.js's PDF branch
// used pdf-parse@1.1.4's old calling convention. Reproduced against a
// real, independently-validated PDF (confirmed readable by a separate
// trusted parser) — it still threw "bad XRef entry" in this Node 22
// environment, meaning PDF extraction was silently broken for every real
// PDF, not just malformed ones. Switched to pdf-parse v2's actively
// maintained API and re-verified against the same PDF — see that file's
// own comment for the full story. This is a prerequisite fix for this
// part to be testable at all (rawText would otherwise never be real for
// any PDF), not unrelated scope creep.

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { readFileAsTextFromUrl } = require('../utils/documentTextExtractor');
const { generate } = require('./ai');
const logger = require('../config/logger');

// Below this, treat as "no usable text" (e.g. a scanned-image PDF with no
// OCR layer — explicitly named in this feature's own spec as a failure
// mode to handle cleanly, not silently hang or crash on) rather than
// handing a near-empty string off to Part 2's future AI step.
const MIN_EXTRACTABLE_CHARS = 50;

// ── beginExtraction ───────────────────────────────────────────────────────
// Entry point called (fire-and-forget) from POST /api/syllabus right after
// a successful upload. Owns every 'uploaded' -> 'processing' -> 'failed'
// transition THIS part is responsible for (file fetch/parse failures,
// empty/unusable text). Does NOT set status='extracted' — that requires
// real parsed topic/subtopic JSON, which is Part 2's job. On successful
// text extraction, hands off to extractTopicStructureFromText (the Part 2
// stub below) and leaves status at 'processing' until that function is
// actually implemented.
async function beginExtraction(syllabusId) {
  try {
    await setStatus(syllabusId, 'processing');

    const rows = await sequelize.query(
      `SELECT id, file_url, file_type, exam_board_id, subject_id
         FROM syllabus_documents WHERE id = :id`,
      { replacements: { id: syllabusId }, type: QueryTypes.SELECT }
    );
    const doc = rows[0];
    if (!doc) {
      logger.error('[syllabusExtractor] syllabus_documents row not found', { syllabusId });
      return;
    }

    let rawText;
    try {
      rawText = await readFileAsTextFromUrl(doc.file_url);
    } catch (err) {
      // Genuine parse failure — a corrupted/unreadable file, distinct from
      // "parsed fine but had no text" below. documentTextExtractor.js
      // re-throws specifically so this distinction is possible here (see
      // its own comment on extractTextFromBuffer).
      logger.error('[syllabusExtractor] file parse failed', { syllabusId, error: err.message });
      await setStatus(
        syllabusId, 'failed',
        `Could not read the uploaded ${doc.file_type || 'document'} file — it may be corrupted or in an unsupported format. (${err.message})`
      );
      return;
    }

    if (!rawText || rawText.trim().length < MIN_EXTRACTABLE_CHARS) {
      // Parsed without error but produced little/no text — the "scanned
      // image PDF with no OCR layer" case named explicitly in this
      // feature's own spec.
      logger.warn('[syllabusExtractor] extracted text too short/empty', {
        syllabusId, chars: rawText?.trim().length || 0,
      });
      await setStatus(
        syllabusId, 'failed',
        'No readable text could be extracted from this document. If it is a scanned or image-based PDF, it needs a text layer (OCR) before it can be processed.'
      );
      return;
    }

    logger.info('[syllabusExtractor] text extraction succeeded, handing off to Part 2', {
      syllabusId, chars: rawText.length,
    });

    await extractTopicStructureFromText(rawText, {
      syllabusId, examBoardId: doc.exam_board_id, subjectId: doc.subject_id,
    });
  } catch (err) {
    // Catch-all: anything unexpected (a DB error mid-flow, etc.) still
    // lands the row in 'failed' with a clear message, rather than leaving
    // it silently stuck in 'processing' forever with no explanation.
    logger.error('[syllabusExtractor] unexpected failure', { syllabusId, error: err.message });
    await setStatus(syllabusId, 'failed', `Unexpected error during extraction: ${err.message}`).catch(() => {});
  }
}

// ── extractTopicStructureFromText (Prompt 2, Part 2 — implemented) ─────────
// Replaces the Part 1 stub. Everything above this point (fetching the
// file, extracting raw text, failure handling for a corrupted or textless
// document) is untouched, per Part 1's own instruction not to change it.
//
// extracted_structure SHAPE (Prompt 3 needs this exact shape):
//   { "nodes": [
//       { "level": 1, "title": "Cell Biology",   "number": "1"   },
//       { "level": 2, "title": "Cell Structure", "number": "1.1" },
//       { "level": 3, "title": "Cell Membrane",  "number": "1.1.1" },
//   ] }
// A FLAT, ORDERED array, not a nested tree — an LLM asked for deeply
// nested JSON with many siblings is measurably more failure-prone
// (unbalanced braces, truncation mid-object) than a flat list; Prompt 3
// reconstructs the tree by walking the array in order and tracking the
// most recently seen node at each level as the current parent for the
// next lower level. `level` is 1, 2, or 3 — confirmed as the actual max
// depth this schema supports (topics -> subtopics ->
// subtopics.parent_subtopic_id, one further level, no more — see
// migration_031). A document whose real structure goes deeper than 3
// levels has anything past level 3 CLAMPED to level 3, not dropped or
// crashed on (see clampLevel below) — flagged in the return value's
// `truncated_depth` flag so Prompt 3's UI can surface a note about it
// rather than silently presenting a flattened result as if it were exact.
// `number` is the syllabus's own numbering label if present (e.g.
// "1.1.2"), nullable — for Prompt 3's review UI display only, NOT used
// for ordering (array order is authoritative).
async function extractTopicStructureFromText(rawText, { syllabusId, examBoardId, subjectId }) {
  try {
    const prompt = buildExtractionPrompt(rawText);
    const raw = await generate(prompt, 'extract-syllabus');

    // Mirrors adminRoutes.js's generate-questions handling exactly (code-
    // fence strip -> sanitizeAiJson -> JSON.parse), per this feature's own
    // Step 1 instruction to reuse that shape rather than invent a
    // different one. sanitizeAiJson is NOT imported from adminRoutes.js
    // (it isn't exported there, and — separately — the only other place
    // in this codebase that calls it, teacherRoutes.js's own
    // /generate-questions route, does so without ever importing it either,
    // which would throw ReferenceError if that code path executed; flagged
    // for the team, not fixed here, out of scope). This is an independent,
    // correctly wired local copy of the same algorithm.
    const cleaned = (raw || '').replace(/```json|```/g, '').trim();
    const sanitized = sanitizeAiJson(cleaned);

    let parsed;
    try {
      parsed = JSON.parse(sanitized);
    } catch (parseErr) {
      logger.warn('[syllabusExtractor] AI JSON parse failed', { syllabusId, error: parseErr.message });
      await setStatus(
        syllabusId, 'failed',
        `The AI's response could not be parsed as valid JSON: ${parseErr.message}. Try extracting again.`
      );
      return;
    }

    if (!parsed || !Array.isArray(parsed.nodes)) {
      await setStatus(
        syllabusId, 'failed',
        'The AI response was valid JSON but did not match the expected { "nodes": [...] } shape.'
      );
      return;
    }

    // Untrusted input regardless of whether it parsed — validate and clamp
    // every node defensively rather than trusting the AI's own level/title.
    let truncatedDepth = false;
    const nodes = [];
    for (const n of parsed.nodes) {
      const title = String(n?.title ?? '').trim();
      if (!title) continue; // Step 2.4-equivalent: a titleless node is unusable, drop it
      let level = Number.isInteger(n?.level) ? n.level : parseInt(n?.level, 10);
      if (!Number.isInteger(level)) continue;
      if (level > 3) truncatedDepth = true;
      level = Math.min(Math.max(level, 1), 3); // clamp to this schema's actual max depth
      const number = n?.number != null ? String(n.number).trim().slice(0, 50) || null : null;
      nodes.push({ level, title: title.slice(0, 255), number });
    }

    // Zero usable nodes after validation — even though the JSON itself was
    // well-formed, there is nothing here for Prompt 3 to review. Treated
    // as 'failed' rather than 'extracted' with an empty structure: an
    // empty "success" would look, from syllabus_documents.status alone,
    // indistinguishable from a document that genuinely has no topics,
    // silently hiding what is actually a parsing/recognition failure from
    // whoever reviews it later. A clear failure_reason is more honest and
    // actionable than a quietly empty result.
    if (nodes.length === 0) {
      await setStatus(
        syllabusId, 'failed',
        'The AI could not identify any usable topic structure in this document (empty or all-titleless result). It may not be a syllabus/scheme-of-work document, or its formatting was too unclear to parse.'
      );
      return;
    }

    const structure = { nodes };
    await sequelize.query(
      `UPDATE syllabus_documents
          SET status = 'extracted', extracted_structure = :structure::jsonb,
              extracted_at = NOW(), failure_reason = NULL, updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: syllabusId, structure: JSON.stringify(structure) }, type: QueryTypes.UPDATE }
    );

    logger.info('[syllabusExtractor] extraction complete', {
      syllabusId, nodeCount: nodes.length, truncatedDepth,
    });
  } catch (err) {
    // Covers generate() throwing outright — e.g. GEMINI_API_KEY not
    // configured (confirmed this sandbox has neither GEMINI_API_KEY nor
    // OPENAI_API_KEY set at all — see this feature's PR writeup for how
    // this path was actually exercised without a live key), a rate-limit
    // 429, or both providers exhausted — as well as any other unexpected
    // failure (e.g. the UPDATE itself failing). beginExtraction's own
    // catch-all above would also catch an exception here, but resolving it
    // to 'failed' with a SPECIFIC message at this level (mentioning the
    // actual underlying error) is more useful than beginExtraction's
    // generic "Unexpected error during extraction" wrapper text.
    logger.error('[syllabusExtractor] AI extraction failed', { syllabusId, error: err.message });
    await setStatus(syllabusId, 'failed', `AI extraction failed: ${err.message}`);
  }
}

// ── Prompt builder ───────────────────────────────────────────────────────
function buildExtractionPrompt(text) {
  return [
    `You are analysing a real exam syllabus / scheme-of-work document for a Nigerian secondary school subject (WAEC/JAMB/NECO-style).`,
    `The text below was extracted directly from the uploaded file and may have lost some formatting — headings, indentation, and numbering may appear as plain text with no visual structure.`,
    ``,
    `Document text:`,
    `"""`,
    text,
    `"""`,
    ``,
    `Identify the topic hierarchy in this document. Documents vary in depth:`,
    `- Some have only top-level topics and their subtopics (2 levels).`,
    `- Some go one level deeper into sub-subtopics (3 levels).`,
    `Do not assume a fixed depth — use whatever the document actually contains.`,
    ``,
    `Use numbering and heading patterns in the text as your signal for hierarchy depth — for example "1." or "Topic 1:" for level 1, "1.1" or "(a)" nested under it for level 2, "1.1.1" or "(i)" nested under that for level 3. Numbering styles vary between documents; infer the depth from the pattern actually used, not from any specific style listed here.`,
    ``,
    `Return STRICT JSON only — no prose, no markdown fencing — matching this exact schema:`,
    `{ "nodes": [ { "level": 1, "title": "...", "number": "1" }, { "level": 2, "title": "...", "number": "1.1" } ] }`,
    ``,
    `Rules:`,
    `- "nodes" is a FLAT array in the same top-to-bottom order the topics appear in the document — do not nest objects inside each other.`,
    `- "level" is an integer: 1 for a top-level topic, 2 for a subtopic, 3 for a sub-subtopic.`,
    `- "title" is the topic's name only — strip any leading number/letter labels (e.g. "1.1 Cell Structure" -> title "Cell Structure").`,
    `- "number" is the document's own numbering label for that item if it has one (e.g. "1.1"), or null if the document has no visible numbering for it.`,
    `- Skip front matter that isn't part of the actual topic list (cover page text, general instructions, assessment-scheme tables) — only include real syllabus topics.`,
    `- If you cannot find any clear topic structure in the text at all, return { "nodes": [] }.`,
  ].join('\n');
}

// Character-walking sanitizer mirroring adminRoutes.js's sanitizeAiJson —
// see this function's call site above for why this is an independent,
// correctly wired local copy rather than an import.
function sanitizeAiJson(raw) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escaped) { result += ch; escaped = false; continue; }
      if (ch === '\\') { result += ch; escaped = true; continue; }
      if (ch === '"') { result += ch; inString = false; continue; }
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch.charCodeAt(0) <= 0x1F) { continue; }
      result += ch;
      continue;
    }

    if (ch === '"') { inString = true; result += ch; continue; }
    result += ch;
  }

  return result;
}

async function setStatus(syllabusId, status, failureReason = null) {
  await sequelize.query(
    `UPDATE syllabus_documents
        SET status = :status, failure_reason = :failureReason, updated_at = NOW()
      WHERE id = :id`,
    { replacements: { id: syllabusId, status, failureReason }, type: QueryTypes.UPDATE }
  );
}

module.exports = { beginExtraction, extractTopicStructureFromText, buildExtractionPrompt, sanitizeAiJson };
