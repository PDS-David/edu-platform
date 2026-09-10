'use strict';

/**
 * server/routes/syllabusRoutes.js
 * ─────────────────────────────────────────────────────────────────────────
 * Syllabus-driven topic mapping.
 *
 * Prompt 1 of 4: schema + upload plumbing (this file's POST / route, and
 * the migration files it depends on). No remapping of existing resources
 * yet — that's a later prompt.
 *
 * Prompt 2, PART 1 ONLY (of an explicit two-part split of that prompt):
 * background raw-text extraction from the uploaded docx/pdf, added here
 * as a fire-and-forget step triggered right after upload (see
 * runBackgroundTextExtraction below and syllabusTextExtraction.js for the
 * actual extraction logic). Deliberately stops at "raw text extracted,
 * or a clear failure reason recorded" — no AI call, no writing to
 * topics/subtopics. Part 2 (not built here) picks up from
 * status='processing' with raw_extracted_text populated, and is
 * responsible for the AI structuring step and finally moving status to
 * 'extracted'.
 *
 * Storage: mirrors server/routes/resourceRoutes.js exactly — Cloudflare R2
 * via utils/r2Storage.js when enabled, local disk under
 * server/uploads/syllabus/ (not publicly reachable) otherwise. Validation
 * reuses middleware/uploadSecurity.js rather than reinventing it.
 *
 * NOTE on authority scope (flagged for review, not silently decided):
 * syllabus_documents has no school_id. topics/subtopics themselves are
 * global (no school_id column), and a subject's exam syllabus is the same
 * regardless of which school is studying it — so this table is
 * deliberately global, matching that existing shape. Both 'teacher' and
 * 'admin' can upload at this stage (per this prompt's brief) — but because
 * extraction (Prompt 2+) will eventually make an uploaded document
 * authoritative for the GLOBAL topic tree, whether teacher-uploaded
 * documents should require admin approval before extraction/activation is
 * a real policy question worth deciding explicitly before Part 2 (or
 * Prompt 3's review/confirm UI) makes extracted structure live, not
 * something decided silently here either.
 */

const path       = require('path');
const fs         = require('fs');
const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');

const sequelize  = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const { createUploadMiddleware } = require('../middleware/uploadSecurity');
const r2         = require('../utils/r2Storage');
const logger     = require('../config/logger');
const { extractSyllabusText } = require('../utils/syllabusTextExtraction');

/* ================================
   UPLOAD DIRECTORY (local fallback)
   ================================ */
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'syllabus');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/* ================================
   SECURE UPLOAD MIDDLEWARE
   Only docx/pdf accepted — matches uploadSecurity's documented allowedTypes
   subset option, reusing its existing four-layer validation.
   ================================ */
const upload = createUploadMiddleware({
  maxSizeMB:    50,
  maxFiles:     1,
  allowedTypes: ['pdf', 'docx'],
});

/* ═══════════════════════════════════════════════════════════════════════
   Background text extraction — Prompt 2, PART 1 ONLY.
   Triggered fire-and-forget from the upload handler below, per Prompt 1's
   own TODO recommendation ("a background job kicked off from this
   endpoint... not blocking the upload response"). Deliberately stops at
   "get raw text out, or fail clearly" — does NOT call any AI service and
   does NOT touch topics/subtopics. That is Part 2's job, not built here.

   Status lifecycle this function owns: 'uploaded' -> 'processing' (started)
   -> either stays 'processing' with raw_extracted_text populated (success —
   the overall extraction pipeline genuinely isn't finished yet; Part 2
   is the remaining step) or -> 'failed' with failure_reason set (raw text
   extraction itself failed — corrupted file, scanned-image-with-no-text-
   layer PDF, etc; see syllabusTextExtraction.js for the specific error
   messages surfaced here).
   ═══════════════════════════════════════════════════════════════════════ */
async function runBackgroundTextExtraction(documentId, buffer, fileType) {
  try {
    await sequelize.query(
      `UPDATE syllabus_documents SET status = 'processing', updated_at = NOW() WHERE id = :id`,
      { replacements: { id: documentId }, type: QueryTypes.UPDATE }
    );

    const { text, pageOrParagraphCount } = await extractSyllabusText(buffer, fileType);

    await sequelize.query(
      `UPDATE syllabus_documents
          SET raw_extracted_text = :text, updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: documentId, text }, type: QueryTypes.UPDATE }
    );

    logger.info('[syllabus] text extraction succeeded', {
      id: documentId, textLength: text.length, pageOrParagraphCount,
    });
  } catch (err) {
    logger.error('[syllabus] text extraction failed', { id: documentId, error: err.message });
    await sequelize.query(
      `UPDATE syllabus_documents
          SET status = 'failed', failure_reason = :reason, updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: documentId, reason: err.message }, type: QueryTypes.UPDATE }
    ).catch(updateErr => {
      // Genuinely last-resort: even the failure-recording UPDATE itself
      // failed (e.g. a transient DB connection blip). Log loudly rather
      // than let this vanish silently — a document stuck on 'processing'
      // forever with no failure_reason is a real support headache.
      logger.error('[syllabus] FAILED TO RECORD extraction failure', {
        id: documentId, originalError: err.message, updateError: updateErr.message,
      });
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/syllabus — upload a syllabus/scheme-of-work document
   ═══════════════════════════════════════════════════════════════════════ */
router.post(
  '/',
  protect,
  authorize('admin', 'teacher'),
  upload.single('file'),
  async (req, res) => {
    try {
      const { exam_board_id, subject_id, title } = req.body;

      if (!req.secureFile) {
        return res.status(400).json({ success: false, error: 'A syllabus file (pdf or docx) is required.' });
      }
      const examBoardId = parseInt(exam_board_id, 10);
      const subjectId    = parseInt(subject_id, 10);
      if (!Number.isInteger(examBoardId) || !Number.isInteger(subjectId)) {
        return res.status(400).json({ success: false, error: 'exam_board_id and subject_id are required and must be integers.' });
      }

      // Confirm the (exam_board_id, subject_id) pair actually exists before
      // attaching a document to it — same shape of guard as elsewhere in
      // this codebase (e.g. teacherRoutes.js's ownership checks).
      const [pair] = await sequelize.query(
        `SELECT s.id AS subject_id, eb.id AS exam_board_id
         FROM subjects s
         JOIN exam_boards eb ON eb.id = :examBoardId
         WHERE s.id = :subjectId`,
        { replacements: { examBoardId, subjectId }, type: QueryTypes.SELECT }
      );
      if (!pair) {
        return res.status(404).json({ success: false, error: 'Unknown exam_board_id or subject_id.' });
      }

      const f = req.secureFile;

      // BUG FIX (pre-existing, found while wiring up this file's own
      // extraction step — not introduced by this change). f.ext is
      // ".pdf"/".docx" WITH the leading dot (confirmed directly in
      // uploadSecurity.js's own header comment: `ext: string, // ".pdf"`)
      // but syllabus_documents.file_type has
      // CHECK (file_type IN ('pdf', 'docx')) — no dot. Every upload was
      // therefore hitting a Postgres CHECK-constraint violation on the
      // INSERT and failing outright.
      //
      // Independently found and fixed the same way by another session
      // (commit 30f9e6e, merged to main while this branch was in
      // progress) — that session verified it live: a real HTTP POST
      // against the actual merged code reproduced the 500
      // ("violates check constraint syllabus_documents_file_type_check"),
      // then confirmed 201 with this exact fix applied. Stronger
      // verification than this session had (static read + reasoning, no
      // live DB in this sandbox) — rebased onto that fix rather than
      // shipping a redundant duplicate, keeping the single normalized
      // value here since this file also needs it for the extraction call
      // below, not just the INSERT.
      const normalizedFileType = String(f.ext || '').replace(/^\./, '');

      let fileUrl;
      let r2Key = null;
      if (r2.isR2Enabled()) {
        const { url, key } = await r2.uploadBuffer({
          buffer:       f.buffer,
          originalname: f.storedName,
          mimetype:     f.mimeType,
        });
        fileUrl = url;
        r2Key   = key;
      } else {
        const diskPath = path.join(UPLOADS_DIR, f.storedName);
        fs.writeFileSync(diskPath, f.buffer);
        // Not publicly reachable — server.js explicitly blocks
        // /uploads/syllabus/* with a 403 (mirroring /uploads/resources and
        // /uploads/past-papers) ahead of the general /uploads static mount.
        // No authenticated download route exists yet either, since this
        // prompt is upload-only — add one alongside whatever route
        // eventually lists these documents.
        fileUrl = `/uploads/syllabus/${f.storedName}`;
      }

      const docTitle = (title && String(title).trim()) || path.parse(f.originalname).name;

      // Versioning (Step 2.2): only one syllabus document is "active" per
      // (exam_board_id, subject_id) at a time. Deactivate any prior active
      // document for this pair in the same transaction as the new insert,
      // rather than allowing silent duplicates with no authoritative one.
      const result = await sequelize.transaction(async (t) => {
        await sequelize.query(
          `UPDATE syllabus_documents
           SET is_active = false, updated_at = NOW()
           WHERE exam_board_id = :examBoardId AND subject_id = :subjectId AND is_active = true`,
          { replacements: { examBoardId, subjectId }, type: QueryTypes.UPDATE, transaction: t }
        );

        const [inserted] = await sequelize.query(
          `INSERT INTO syllabus_documents
             (exam_board_id, subject_id, uploaded_by, title, file_url, r2_key,
              file_type, file_size_bytes, original_filename, sha256, status, is_active)
           VALUES
             (:examBoardId, :subjectId, :uploadedBy, :title, :fileUrl, :r2Key,
              :fileType, :size, :origName, :hash, 'uploaded', true)
           RETURNING id, exam_board_id, subject_id, title, file_type, status, is_active, created_at`,
          {
            replacements: {
              examBoardId, subjectId,
              uploadedBy: req.user.id,
              title:      docTitle,
              fileUrl, r2Key,
              fileType:   normalizedFileType,
              size:       f.size,
              origName:   f.originalname,
              hash:       f.sha256,
            },
            type: QueryTypes.SELECT,
            transaction: t,
          }
        );
        return inserted;
      });

      logger.info('[syllabus] uploaded', { id: result.id, examBoardId, subjectId, uploadedBy: req.user.id });

      // Fire-and-forget: do not await, do not block the upload response on
      // text extraction. setImmediate (not a raw un-awaited call) ensures
      // this starts on the next tick, after the response below has been
      // handed off, so a slow/failing extraction step can never affect
      // this request's own response time or error handling.
      //
      // Part 1 stops at raw text extraction (see
      // runBackgroundTextExtraction's own header comment for the exact
      // status lifecycle it owns). Part 2 — not built here — is the AI
      // call that turns raw_extracted_text into a structured topic tree
      // and finally moves status to 'extracted'.
      setImmediate(() => {
        runBackgroundTextExtraction(result.id, f.buffer, normalizedFileType).catch(err => {
          // runBackgroundTextExtraction already catches and records its
          // own failures — this outer catch exists only to guarantee an
          // unhandled promise rejection can never reach the process level
          // from a fire-and-forget call.
          logger.error('[syllabus] unexpected error scheduling text extraction', {
            id: result.id, error: err.message,
          });
        });
      });

      return res.status(201).json({ success: true, data: result });
    } catch (err) {
      logger.error('[POST /api/syllabus]', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
