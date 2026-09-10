'use strict';

/**
 * server/utils/syllabusTextExtraction.js
 * ─────────────────────────────────────────────────────────────────────────
 * Syllabus-driven topic mapping — Prompt 2, PART 1 ONLY (per explicit
 * instruction to split this prompt's work in two and build only the
 * first half now). This module's job stops at "get reliable raw text out
 * of an uploaded docx/pdf, or fail clearly" — it does NOT call any AI
 * service and does NOT write to topics/subtopics. That's Part 2's job
 * (the AI prompt, JSON-response parsing, and extracted_structure
 * storage), deliberately not built here.
 *
 * New dependencies added (documented per this prompt's own instruction
 * to justify any new dependency): pdf-parse and mammoth. Checked first —
 * neither existed anywhere in server/package.json before this. Both are
 * the standard, minimal, widely-used Node libraries for exactly this
 * (pdf-parse: PDF text extraction; mammoth: .docx -> plain text) — no
 * heavier alternative considered necessary for "extract raw text," which
 * is all this step needs.
 */

const pdfParse = require('pdf-parse');
const mammoth   = require('mammoth');

/**
 * Extract raw text from a syllabus document buffer.
 *
 * @param {Buffer} buffer     - the file's raw bytes (already validated/
 *                              scanned by uploadSecurity.js before this
 *                              is ever called — this function does not
 *                              re-validate file type/size).
 * @param {string} fileType   - 'pdf' | 'docx' (matches
 *                              syllabus_documents.file_type's CHECK
 *                              constraint values exactly).
 * @returns {Promise<{ text: string, pageOrParagraphCount: number|null }>}
 * @throws {Error} with a short, human-readable message suitable for
 *                 storing directly in syllabus_documents.failure_reason —
 *                 callers should not need to wrap/reword these.
 */
async function extractSyllabusText(buffer, fileType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('File is empty or unreadable');
  }

  let text = '';
  let pageOrParagraphCount = null;

  if (fileType === 'pdf') {
    let parsed;
    try {
      parsed = await pdfParse(buffer);
    } catch (err) {
      // pdf-parse throws on genuinely corrupted/non-PDF-structured files —
      // surface a short, storable reason rather than the raw library
      // error (which can be a long stack-trace-flavoured string).
      throw new Error('Could not read this PDF — it may be corrupted or password-protected');
    }
    text = parsed.text || '';
    pageOrParagraphCount = parsed.numpages ?? null;
  } else if (fileType === 'docx') {
    let result;
    try {
      result = await mammoth.extractRawText({ buffer });
    } catch (err) {
      throw new Error('Could not read this DOCX file — it may be corrupted');
    }
    text = result.value || '';
    // mammoth doesn't report a paragraph/page count directly; a rough
    // proxy (non-empty lines) is more useful than null for a quick
    // "did this look like a real document" sanity signal downstream,
    // without pretending it's an exact page count.
    pageOrParagraphCount = text.split('\n').filter(l => l.trim().length > 0).length;
  } else {
    // Defensive — syllabus_documents.file_type has a DB-level CHECK
    // constraint limiting it to 'pdf'/'docx' already, so this should be
    // unreachable in practice. Not treated as a silent no-op regardless.
    throw new Error(`Unsupported file_type for text extraction: ${fileType}`);
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    // The single most likely real-world failure mode this step needs to
    // catch explicitly, per this prompt's own required failure trace: a
    // scanned-image PDF with no OCR text layer parses "successfully"
    // (no thrown error) but yields zero extractable characters. Treat
    // that the same as a hard failure, with a reason that tells the
    // uploader specifically what went wrong (not a generic error),
    // since the fix (re-scan with OCR, or a text-based source file) is
    // different from a corrupted-file fix.
    throw new Error('No extractable text found — this may be a scanned image with no text layer (OCR would be needed, which this step does not perform)');
  }

  return { text: trimmed, pageOrParagraphCount };
}

module.exports = { extractSyllabusText };
