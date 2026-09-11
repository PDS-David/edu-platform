'use strict';

/**
 * server/routes/syllabusRoutes.js
 * ─────────────────────────────────────────────────────────────────────────
 * Syllabus-driven topic mapping — Prompt 1 of 4: schema + upload plumbing
 * only. No parsing, no extraction, no remapping of existing resources.
 * Those are later prompts (see the migration file's header comment for the
 * full feature description and this prompt's design decisions).
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
 * a real policy question worth deciding explicitly before Prompt 2 wires
 * extraction up, not something this prompt should decide silently.
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
              // BUG FIX, confirmed live before fixing: f.ext is dot-prefixed
              // ('.pdf'/'.docx', per uploadSecurity.js's runValidation), but
              // syllabus_documents.file_type has a CHECK constraint requiring
              // no dot ('pdf'/'docx') — every upload was failing with a 500
              // ("violates check constraint syllabus_documents_file_type_check").
              // Reproduced with a real POST against the actual merged
              // migration before writing this fix, not assumed from reading
              // the code alone.
              fileType:   f.ext.replace(/^\./, ''),
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

      // TODO(Prompt 2): trigger extraction here. Recommended approach: a
      // background job kicked off from this endpoint (matches this app's
      // existing pattern of not blocking the upload response on slow AI
      // calls — see e.g. resourceRoutes.js's question-extraction flow)
      // rather than a separate "start extraction" endpoint the frontend
      // has to remember to call. Whichever is chosen, it should move
      // status 'uploaded' -> 'processing' -> 'extracted'/'failed', writing
      // failure_reason on failure (column already added by this migration).
      return res.status(201).json({ success: true, data: result });
    } catch (err) {
      logger.error('[POST /api/syllabus]', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
