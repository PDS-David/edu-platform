'use strict';
// server/services/syllabusExtractor.js
// Syllabus-driven topic mapping — Prompt 2, split into two parts per
// explicit instruction: (1) text extraction from the uploaded docx/pdf +
// the extraction-trigger skeleton — built here. (2) The AI prompt/JSON-
// parsing/storage logic — deliberately NOT built here, see the stub at
// extractTopicStructureFromText below for the exact handoff point.
//
// Triggered as a fire-and-forget background job right after upload
// completes, per Prompt 1's own TODO comment in syllabusRoutes.js
// ("Recommended approach: a background job kicked off from this
// endpoint... rather than a separate 'start extraction' endpoint the
// frontend has to remember to call") — followed here rather than Prompt
// 2's own stated default preference (an explicit separate endpoint),
// since Prompt 2's own instructions say to defer to what Prompt 1 already
// expects when it clearly favors one approach, which this does.

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { readFileAsTextFromUrl } = require('../utils/documentTextExtractor');
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

// ── extractTopicStructureFromText (STUB — Prompt 2, Part 2) ────────────────
// Intentionally left unimplemented per explicit instruction to build ONLY
// the text-extraction + trigger-skeleton half of this feature in this
// pass. Part 2 replaces this function's body with the real AI call (via
// services/ai.js's generate(), NOT a direct Gemini/OpenAI call — reuse the
// existing hub's rate-limiting/retry/usage-logging) + strict-JSON parsing
// (matching aiQuestionGenerationRoutes.js's existing malformed-response
// handling) + writing the parsed result to a staged column (this table
// has no extracted_structure column yet — Part 2 needs to add one via a
// new migration, per its own Step 2.4) with status='extracted' on success
// or 'failed' on an unrecoverably malformed AI response.
//
// Everything above this point (fetching the file, extracting raw text,
// failure handling for a corrupted or textless document) is already
// correct and complete — Part 2 should not need to change any of it, only
// replace this function's body.
async function extractTopicStructureFromText(rawText, { syllabusId, examBoardId, subjectId }) {
  logger.warn(
    '[syllabusExtractor] extractTopicStructureFromText not yet implemented (Prompt 2, Part 2) — leaving status at "processing"',
    { syllabusId, examBoardId, subjectId, textLength: rawText.length }
  );
  // Deliberately no status change here. 'processing' is the correct
  // terminal state for what this part builds — Part 2 moves this row to
  // 'extracted' (success) or 'failed' (malformed AI response) once real.
}

async function setStatus(syllabusId, status, failureReason = null) {
  await sequelize.query(
    `UPDATE syllabus_documents
        SET status = :status, failure_reason = :failureReason, updated_at = NOW()
      WHERE id = :id`,
    { replacements: { id: syllabusId, status, failureReason }, type: QueryTypes.UPDATE }
  );
}

module.exports = { beginExtraction, extractTopicStructureFromText };
