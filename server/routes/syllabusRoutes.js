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

      // SCOPING FIX: this endpoint previously had no teacherCanWriteSubject
      // check at all -- POST /:id/confirm and POST /:id/retry (below) both
      // correctly reject a teacher acting outside their assigned subjects,
      // but upload did not, so any teacher could upload a syllabus document
      // for any subject in the system, not just their own. Matches the
      // exact same fail-closed shape as those two routes' own checks.
      // Admins are unaffected -- this only applies to the teacher role.
      if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, subjectId))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
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

      // Prompt 2, Part 1: extraction trigger, matching this TODO's own
      // recommendation exactly — a fire-and-forget background job (not
      // awaited, doesn't block this response), same pattern as
      // resourceRoutes.js's question-extraction flow
      // (extractor.extractFromResource(...).then().catch()). Owns the
      // 'uploaded' -> 'processing' -> 'failed' transitions for text-
      // extraction failures; does NOT reach 'extracted' yet — that
      // requires Part 2's AI/JSON-parsing work, not built in this pass
      // (see syllabusExtractor.js's extractTopicStructureFromText stub).
      try {
        const { beginExtraction } = require('../services/syllabusExtractor');
        beginExtraction(result.id)
          .then(() => logger.info('[syllabus] extraction step finished', { id: result.id }))
          .catch(e => logger.error('[syllabus] extraction step failed', { id: result.id, error: e.message }));
      } catch (e) {
        logger.error('[syllabus] extractor unavailable', { id: result.id, error: e.message });
      }

      return res.status(201).json({ success: true, data: result });
    } catch (err) {
      logger.error('[POST /api/syllabus]', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Helper: is this teacher allowed to write to this subject_id? ───────────
// Own local copy, not an import — topicsRoutes.js's identical helper isn't
// exported, matching this codebase's established convention of per-file
// duplicates for small route-scoped helpers rather than a shared module
// (same reasoning as this feature's own sanitizeAiJson copy). Fail-closed:
// a teacher with zero teacher_subjects rows cannot write to any subject.
async function teacherCanWriteSubject(teacherId, subjectId) {
  const assigned = await sequelize.query(
    `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
    { replacements: { teacherId }, type: QueryTypes.SELECT }
  );
  return assigned.some(r => String(r.subject_id) === String(subjectId));
}

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/syllabus — list documents. Deliberately unscoped by teacher-
   subject assignment (any teacher/admin can see any document), matching
   Prompt 1's own "deliberately global" design for this table — the same
   design this route's header comment already documents. Scoping only
   matters for the actual write action (confirm, below), matching how
   topicsRoutes.js's own CRUD only scopes writes, not its GET /.
   Excludes extracted_structure — this is a list view, not the review
   screen's data source (GET /:id is, below).
   ═══════════════════════════════════════════════════════════════════════ */
router.get('/', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { status, exam_board_id, subject_id } = req.query;
    const conditions = [];
    const replacements = {};
    if (status) { conditions.push('status = :status'); replacements.status = status; }
    if (exam_board_id) { conditions.push('exam_board_id = :examBoardId'); replacements.examBoardId = parseInt(exam_board_id, 10); }
    if (subject_id) { conditions.push('subject_id = :subjectId'); replacements.subjectId = parseInt(subject_id, 10); }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await sequelize.query(
      `SELECT sd.id, sd.exam_board_id, eb.name AS exam_board_name,
              sd.subject_id, s.name AS subject_name,
              sd.title, sd.file_type, sd.status, sd.is_active,
              sd.failure_reason, sd.extracted_at, sd.confirmed_at,
              sd.created_at, sd.updated_at
       FROM syllabus_documents sd
       JOIN exam_boards eb ON eb.id = sd.exam_board_id
       JOIN subjects s     ON s.id  = sd.subject_id
       ${whereClause}
       ORDER BY sd.created_at DESC`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('[GET /api/syllabus]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/syllabus/:id — single document, including extracted_structure.
   This is what the review screen loads, and what it polls while
   status === 'processing'.
   ═══════════════════════════════════════════════════════════════════════ */
router.get('/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const [doc] = await sequelize.query(
      `SELECT sd.*, eb.name AS exam_board_name, s.name AS subject_name
       FROM syllabus_documents sd
       JOIN exam_boards eb ON eb.id = sd.exam_board_id
       JOIN subjects s     ON s.id  = sd.subject_id
       WHERE sd.id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Syllabus document not found.' });
    return res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('[GET /api/syllabus/:id]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/syllabus/:id/confirm — Prompt 3: writes the (possibly
   human-edited) topic hierarchy into the REAL topics/subtopics tables.

   CONTRACT: the request body's `nodes` array is treated as the complete,
   final list the reviewer wants created — exactly the same
   { level, title, number } shape as extracted_structure (Prompt 2's own
   documented shape), NOT a diff or patch against the stored AI output.
   A node the reviewer deleted in the review UI (Prompt 3 Part 2, not yet
   built) simply isn't present in what gets submitted here; this endpoint
   has no separate "action: delete" concept to keep the contract simple.
   This also means an edited title, a promoted/demoted level, or an
   entirely added node are all indistinguishable from each other here —
   whatever the client submits is what gets created, which is exactly
   what "the edit step must not be cosmetic-only" (this prompt's own
   verification requirement) demands: there is no code path here that
   could silently fall back to the stored, unedited AI output.

   Design decisions (Step 2.2, answered explicitly):
   - Pre-existing topics/subtopics for this subject (source_syllabus_id
     IS NULL, predating this upload) are left COMPLETELY untouched. This
     endpoint only INSERTs new rows tagged with this document's id as
     source_syllabus_id — it never deletes, updates, or reads the old
     tree. Reconciling/merging/retiring the old tree against the new one
     is explicitly Prompt 4's job, not attempted here.
   - Multiple confirmed uploads over time for the same subject: each
     confirm is independent and purely additive — confirming a new
     syllabus does NOT deactivate or remove the topics/subtopics created
     by a previous confirmed one for the same subject. Prompt 1's
     is_active/versioning concept lives on syllabus_documents (which
     upload is the CURRENT authoritative source), not on the topics/
     subtopics rows those confirms already created — so a second confirm
     for the same subject adds a second, parallel set of topics rather
     than replacing the first. This is the same "don't attempt
     reconciliation here" reasoning as the point above, and is flagged
     for Prompt 4 the same way.

   Hierarchy reconstruction: nodes are a FLAT, ORDERED array. Walking in
   order, the most recently created level-1 topic becomes the topic_id
   for every level-2/3 node until the next level-1 node resets it; the
   most recently created level-2 subtopic becomes the parent_subtopic_id
   for every level-3 node until the next level-1 OR level-2 node resets
   it. Validated in a dry-run pass BEFORE any INSERT runs — a level-2 or
   3 node with no valid preceding parent in the submitted array fails the
   whole request with a 400 and writes nothing, rather than partially
   writing a tree with dangling/wrong parentage.
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/:id/confirm', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const [doc] = await sequelize.query(
      `SELECT id, subject_id, status FROM syllabus_documents WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Syllabus document not found.' });
    if (doc.status !== 'extracted') {
      return res.status(409).json({
        success: false,
        error: `Cannot confirm a document with status '${doc.status}' — it must be 'extracted' first.`,
      });
    }
    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, doc.subject_id))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : null;
    if (!nodes || nodes.length === 0) {
      return res.status(400).json({ success: false, error: 'A non-empty "nodes" array is required.' });
    }

    // Dry-run validation pass — no DB writes yet. Mirrors the exact
    // clamping/validation rules syllabusExtractor.js already applies to
    // the AI's own output, since a client-submitted array is just as
    // untrusted as a raw AI response.
    const clean = [];
    for (const [i, n] of nodes.entries()) {
      const title = String(n?.title ?? '').trim();
      if (!title) return res.status(400).json({ success: false, error: `Node ${i} is missing a title.` });
      let level = Number.isInteger(n?.level) ? n.level : parseInt(n?.level, 10);
      if (!Number.isInteger(level) || level < 1 || level > 3) {
        return res.status(400).json({ success: false, error: `Node ${i} ("${title}") has an invalid level — must be 1, 2, or 3.` });
      }
      const number = n?.number != null ? String(n.number).trim().slice(0, 50) || null : null;
      clean.push({ title: title.slice(0, 255), level, number });
    }

    let sawTopic = false, sawSubtopicSinceTopic = false;
    for (const [i, n] of clean.entries()) {
      if (n.level === 1) { sawTopic = true; sawSubtopicSinceTopic = false; }
      if (n.level === 2) {
        if (!sawTopic) return res.status(400).json({ success: false, error: `Node ${i} ("${n.title}") is a subtopic with no preceding topic.` });
        sawSubtopicSinceTopic = true;
      }
      if (n.level === 3) {
        if (!sawSubtopicSinceTopic) return res.status(400).json({ success: false, error: `Node ${i} ("${n.title}") is a sub-subtopic with no preceding subtopic under the current topic.` });
      }
    }

    const created = await sequelize.transaction(async (t) => {
      const rows = { topics: [], subtopics: [] };
      let currentTopicId = null;
      let currentSubtopicId = null;

      for (const n of clean) {
        if (n.level === 1) {
          const [topic] = await sequelize.query(
            `INSERT INTO topics (subject_id, name, title, order_index, source_syllabus_id, created_by, created_at, updated_at)
             VALUES (:subjectId, :title, :title, :order, :syllabusId, :userId, NOW(), NOW())
             RETURNING id, name`,
            {
              replacements: { subjectId: doc.subject_id, title: n.title, order: rows.topics.length, syllabusId: doc.id, userId: req.user.id },
              type: QueryTypes.SELECT, transaction: t,
            }
          );
          currentTopicId = topic.id;
          currentSubtopicId = null;
          rows.topics.push({ id: topic.id, title: n.title, number: n.number });
        } else if (n.level === 2) {
          const [sub] = await sequelize.query(
            `INSERT INTO subtopics (topic_id, subject_id, name, order_index, is_active, source_syllabus_id, parent_subtopic_id, created_by, created_at, updated_at)
             VALUES (:topicId, :subjectId, :title, :order, true, :syllabusId, NULL, :userId, NOW(), NOW())
             RETURNING id, name`,
            {
              replacements: { topicId: currentTopicId, subjectId: doc.subject_id, title: n.title, order: rows.subtopics.length, syllabusId: doc.id, userId: req.user.id },
              type: QueryTypes.SELECT, transaction: t,
            }
          );
          currentSubtopicId = sub.id;
          rows.subtopics.push({ id: sub.id, title: n.title, number: n.number, level: 2, parent_subtopic_id: null });
        } else {
          const [sub] = await sequelize.query(
            `INSERT INTO subtopics (topic_id, subject_id, name, order_index, is_active, source_syllabus_id, parent_subtopic_id, created_by, created_at, updated_at)
             VALUES (:topicId, :subjectId, :title, :order, true, :syllabusId, :parentId, :userId, NOW(), NOW())
             RETURNING id, name`,
            {
              replacements: { topicId: currentTopicId, subjectId: doc.subject_id, title: n.title, order: rows.subtopics.length, syllabusId: doc.id, parentId: currentSubtopicId, userId: req.user.id },
              type: QueryTypes.SELECT, transaction: t,
            }
          );
          rows.subtopics.push({ id: sub.id, title: n.title, number: n.number, level: 3, parent_subtopic_id: currentSubtopicId });
        }
      }

      await sequelize.query(
        `UPDATE syllabus_documents SET status = 'confirmed', confirmed_by = :userId, confirmed_at = NOW(), updated_at = NOW() WHERE id = :id`,
        { replacements: { userId: req.user.id, id: doc.id }, type: QueryTypes.UPDATE, transaction: t }
      );

      return rows;
    });

    logger.info('[syllabus] confirmed', {
      id: doc.id, subjectId: doc.subject_id, userId: req.user.id,
      topicCount: created.topics.length, subtopicCount: created.subtopics.length,
    });

    return res.json({ success: true, data: created });
  } catch (err) {
    logger.error('[POST /api/syllabus/:id/confirm]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/syllabus/:id/retry — re-trigger extraction on a failed
   document.
   GAP FILL: Part 3's own brief for the review screen (Part 2, this
   prompt's actual scope) requires a "re-trigger" action on the failed
   state, but Part 1's backend never built a retry endpoint — only the
   upload route ever calls beginExtraction, once, fire-and-forget. Added
   here as the minimal plumbing needed to make that button function,
   flagged rather than silently building a non-functional button in the
   frontend. Same auth/ownership shape as confirm above; re-invokes the
   exact same beginExtraction() the upload route already uses — no new
   extraction logic.
   ═══════════════════════════════════════════════════════════════════════ */
router.post('/:id/retry', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const [doc] = await sequelize.query(
      `SELECT id, subject_id, status FROM syllabus_documents WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Syllabus document not found.' });
    if (doc.status !== 'failed') {
      return res.status(409).json({
        success: false,
        error: `Cannot retry a document with status '${doc.status}' — it must be 'failed' first.`,
      });
    }
    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, doc.subject_id))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    await sequelize.query(
      `UPDATE syllabus_documents SET status = 'uploaded', failure_reason = NULL, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: doc.id }, type: QueryTypes.UPDATE }
    );

    const { beginExtraction } = require('../services/syllabusExtractor');
    beginExtraction(doc.id)
      .then(() => logger.info('[syllabus] retry extraction finished', { id: doc.id }))
      .catch(e => logger.error('[syllabus] retry extraction failed', { id: doc.id, error: e.message }));

    return res.json({ success: true, data: { id: doc.id, status: 'processing' } });
  } catch (err) {
    logger.error('[POST /api/syllabus/:id/retry]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Prompt 4 Part 2 — remap-suggestion review + the actual remap writes
// ═══════════════════════════════════════════════════════════════════════
// Reads/writes syllabus_remap_suggestions (Part 1, migration_034) and
// performs the real subtopic_id/topic_id UPDATEs on the five source
// tables Part 1 already scoped: resources, questions, videos,
// revision_notes, concepts. Scoped to ONE subject/syllabus_document at a
// time per Prompt 4's own "not an app-wide migration" instruction — there
// is no endpoint here that touches more than one syllabus_document_id per
// call. teacherCanWriteSubject-gated, matching confirm/retry/upload.
//
// Per-source-table config: same shape as generateSyllabusRemapSuggestions.js's
// own SOURCE_TABLES (kept as an independent copy here rather than a shared
// import, since that script lives outside the Express app and importing
// across that boundary would be an unusual dependency direction for a
// route file — the two lists must be kept in sync by hand if a table is
// ever added, which is exactly the kind of thing worth a comment, not a
// shared module for two five-line arrays).
const REMAP_TABLE_CONFIG = {
  resources:       { idIsUuid: true,  hasTopicId: true,  hasSubtopicId: true  },
  questions:       { idIsUuid: false, hasTopicId: false, hasSubtopicId: true  },
  videos:          { idIsUuid: true,  hasTopicId: true,  hasSubtopicId: false },
  revision_notes:  { idIsUuid: true,  hasTopicId: false, hasSubtopicId: true  },
  concepts:        { idIsUuid: true,  hasTopicId: false, hasSubtopicId: true  },
};

// ─── GET /api/syllabus/:id/remap-suggestions ─────────────────────────────
// :id is a syllabus_documents.id (matching every other :id in this file),
// NOT a subject_id — a subject could in principle have more than one
// confirmed doc over time, and suggestions are stored per
// syllabus_document_id (migration_034's own unique constraint), so this
// stays consistent with that rather than introducing a second identifier
// shape. Returns: the document's own subject/board context, the new tree
// (real topics/subtopics rows for this doc, for the override picker — same
// query shape as generateSyllabusRemapSuggestions.js's getNewTree()), and
// every 'pending' suggestion joined back to its source table for display
// text (title/question_text/name — the suggestions table itself only
// stores source_id, not the item's text).
router.get('/:id/remap-suggestions', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const docRows = await sequelize.query(
      `SELECT sd.id, sd.subject_id, sd.exam_board_id, sd.status,
              s.name AS subject_name, eb.name AS exam_board_name
         FROM syllabus_documents sd
         JOIN subjects s ON s.id = sd.subject_id
         JOIN exam_boards eb ON eb.id = sd.exam_board_id
        WHERE sd.id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    const doc = docRows[0];
    if (!doc) return res.status(404).json({ success: false, error: 'Syllabus document not found.' });
    if (doc.status !== 'confirmed') {
      return res.status(409).json({ success: false, error: `This document's syllabus tree is not confirmed yet (status: '${doc.status}').` });
    }
    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, doc.subject_id))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    const topics = await sequelize.query(
      `SELECT id, name AS title FROM topics WHERE source_syllabus_id = :id ORDER BY order_index`,
      { replacements: { id: doc.id }, type: QueryTypes.SELECT }
    );
    const subtopics = await sequelize.query(
      `SELECT id, topic_id, parent_subtopic_id, name AS title
         FROM subtopics WHERE source_syllabus_id = :id ORDER BY order_index`,
      { replacements: { id: doc.id }, type: QueryTypes.SELECT }
    );

    // Prompt 4 Part 3: ?unmatched=true switches this same endpoint to the
    // no_confident_match queue instead of the main review list — same
    // source-text-joining logic below serves both rather than duplicating
    // it in a second route, per this feature's own established "one
    // subject at a time" / avoid-duplication conventions. Default (false)
    // is byte-for-byte the same query Part 2 already shipped — zero
    // behavior change for the existing SyllabusRemapPage.jsx caller, which
    // never passes this param.
    const wantUnmatched = req.query.unmatched === 'true';
    const suggestionRows = await sequelize.query(
      `SELECT id, source_table, source_id, suggested_topic_id, suggested_subtopic_id,
              no_confident_match, confidence, ai_rationale, status
         FROM syllabus_remap_suggestions
        WHERE syllabus_document_id = :id AND status = 'pending' AND no_confident_match = :wantUnmatched
        ORDER BY source_table, confidence DESC NULLS LAST`,
      { replacements: { id: doc.id, wantUnmatched }, type: QueryTypes.SELECT }
    );

    // Join back to each source table for display text — grouped by table
    // first so this is one query per table (max 5), not N+1 per row.
    const byTable = {};
    for (const s of suggestionRows) (byTable[s.source_table] ||= []).push(s);

    const textById = {};
    for (const [table, rows] of Object.entries(byTable)) {
      const cfg = REMAP_TABLE_CONFIG[table];
      if (!cfg) continue; // defensive — source_table's own CHECK constraint should prevent this
      const textCol = table === 'questions' ? 'question_text' : table === 'concepts' ? 'name' : 'title';
      const ids = rows.map(r => cfg.idIsUuid ? r.source_id : parseInt(r.source_id, 10));
      const found = await sequelize.query(
        `SELECT id, ${textCol} AS text FROM ${table} WHERE id IN (:ids)`,
        { replacements: { ids }, type: QueryTypes.SELECT }
      );
      for (const f of found) textById[`${table}:${f.id}`] = f.text;
    }

    const suggestions = suggestionRows.map(s => ({
      ...s,
      source_text: textById[`${s.source_table}:${s.source_id}`] ?? '(item no longer exists)',
    }));

    return res.json({
      success: true,
      data: {
        document: { id: doc.id, subject_id: doc.subject_id, subject_name: doc.subject_name, exam_board_name: doc.exam_board_name },
        newTree: { topics, subtopics },
        suggestions,
      },
    });
  } catch (err) {
    logger.error('[GET /api/syllabus/:id/remap-suggestions]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Could not load remap suggestions.' });
  }
});

// ─── POST /api/syllabus/:id/remap-suggestions/apply ──────────────────────
// Body: { decisions: [{ suggestionId, action: 'accept'|'override'|'skip',
//          topicId?, subtopicId? }] }. 'override' requires topicId and/or
// subtopicId (validated against THIS document's own new tree, not trusted
// blindly). One transaction per call — either every decision in the batch
// lands, or none do, so a partial failure can't leave some items remapped
// and others not from what the reviewer believed was a single submit.
router.post('/:id/remap-suggestions/apply', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { decisions } = req.body;
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return res.status(400).json({ success: false, error: 'decisions must be a non-empty array.' });
  }

  const t = await sequelize.transaction();
  try {
    const docRows = await sequelize.query(
      `SELECT id, subject_id FROM syllabus_documents WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT, transaction: t }
    );
    const doc = docRows[0];
    if (!doc) { await t.rollback(); return res.status(404).json({ success: false, error: 'Syllabus document not found.' }); }
    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, doc.subject_id))) {
      await t.rollback();
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    // Validate every override destination against THIS document's own new
    // tree up front — never trust a client-supplied topicId/subtopicId
    // blindly, same reasoning as generateSyllabusRemapSuggestions.js's own
    // "validate the returned node_id actually exists in the tree we sent".
    const validTopicIds = new Set((await sequelize.query(
      `SELECT id FROM topics WHERE source_syllabus_id = :id`,
      { replacements: { id: doc.id }, type: QueryTypes.SELECT, transaction: t }
    )).map(r => r.id));
    const validSubtopicIds = new Set((await sequelize.query(
      `SELECT id FROM subtopics WHERE source_syllabus_id = :id`,
      { replacements: { id: doc.id }, type: QueryTypes.SELECT, transaction: t }
    )).map(r => r.id));

    let accepted = 0, overridden = 0, skipped = 0;

    for (const d of decisions) {
      const rows = await sequelize.query(
        `SELECT * FROM syllabus_remap_suggestions WHERE id = :id AND syllabus_document_id = :docId AND status = 'pending'`,
        { replacements: { id: d.suggestionId, docId: doc.id }, type: QueryTypes.SELECT, transaction: t }
      );
      const suggestion = rows[0];
      if (!suggestion) continue; // already reviewed, or belongs to a different document — silently skip, not a hard error, since a stale UI state (two tabs open) shouldn't fail the whole batch

      if (d.action === 'skip') {
        await sequelize.query(
          `UPDATE syllabus_remap_suggestions SET status = 'skipped', reviewed_by = :uid, reviewed_at = NOW() WHERE id = :id`,
          { replacements: { id: suggestion.id, uid: req.user.id }, type: QueryTypes.UPDATE, transaction: t }
        );
        skipped++;
        continue;
      }

      let topicId = suggestion.suggested_topic_id;
      let subtopicId = suggestion.suggested_subtopic_id;

      if (d.action === 'override') {
        topicId = d.topicId ?? null;
        subtopicId = d.subtopicId ?? null;
        if (topicId != null && !validTopicIds.has(topicId)) {
          await t.rollback();
          return res.status(400).json({ success: false, error: `Invalid override topicId ${topicId} for this document's tree.` });
        }
        if (subtopicId != null && !validSubtopicIds.has(subtopicId)) {
          await t.rollback();
          return res.status(400).json({ success: false, error: `Invalid override subtopicId ${subtopicId} for this document's tree.` });
        }
      } else if (d.action === 'accept') {
        if (suggestion.no_confident_match) {
          await t.rollback();
          return res.status(400).json({ success: false, error: `Suggestion ${suggestion.id} has no confident match — it cannot be accepted as-is (override or leave for the unmatched-item queue instead).` });
        }
      } else {
        await t.rollback();
        return res.status(400).json({ success: false, error: `Unknown action '${d.action}' for suggestion ${suggestion.id}.` });
      }

      const cfg = REMAP_TABLE_CONFIG[suggestion.source_table];
      const idValue = cfg.idIsUuid ? suggestion.source_id : parseInt(suggestion.source_id, 10);
      const setParts = [];
      if (cfg.hasTopicId) setParts.push('topic_id = :topicId');
      if (cfg.hasSubtopicId) setParts.push('subtopic_id = :subtopicId');
      if (setParts.length > 0) {
        await sequelize.query(
          `UPDATE ${suggestion.source_table} SET ${setParts.join(', ')} WHERE id = :itemId`,
          { replacements: { topicId, subtopicId, itemId: idValue }, type: QueryTypes.UPDATE, transaction: t }
        );
      }

      await sequelize.query(
        `UPDATE syllabus_remap_suggestions
            SET status = :status, suggested_topic_id = :topicId, suggested_subtopic_id = :subtopicId,
                reviewed_by = :uid, reviewed_at = NOW()
          WHERE id = :id`,
        {
          replacements: {
            id: suggestion.id, status: d.action === 'override' ? 'overridden' : 'accepted',
            topicId, subtopicId, uid: req.user.id,
          },
          type: QueryTypes.UPDATE, transaction: t,
        }
      );
      if (d.action === 'override') overridden++; else accepted++;
    }

    await t.commit();
    logger.info('[syllabus] remap decisions applied', { syllabusDocumentId: doc.id, accepted, overridden, skipped, userId: req.user.id });
    return res.json({ success: true, data: { accepted, overridden, skipped } });
  } catch (err) {
    await t.rollback();
    logger.error('[POST /api/syllabus/:id/remap-suggestions/apply]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Could not apply remap decisions.' });
  }
});

// ─── GET /api/syllabus/:id/old-topics ────────────────────────────────────
// Prompt 4 Part 3, second half: lists the OLD topics/subtopics for this
// document's subject (source_syllabus_id IS DISTINCT FROM this document —
// covers both "never had the column set" and, defensively, "belongs to a
// different syllabus document for the same subject" should that ever
// happen) alongside a live count of remaining 'pending' suggestions still
// referencing each one. A topic/subtopic only becomes deactivatable once
// its own count reaches zero — enforced server-side in the POST below,
// not just hinted at here.
router.get('/:id/old-topics', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const docRows = await sequelize.query(
      `SELECT id, subject_id, status FROM syllabus_documents WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    const doc = docRows[0];
    if (!doc) return res.status(404).json({ success: false, error: 'Syllabus document not found.' });
    if (doc.status !== 'confirmed') {
      return res.status(409).json({ success: false, error: `This document's syllabus tree is not confirmed yet (status: '${doc.status}').` });
    }
    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, doc.subject_id))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    const topics = await sequelize.query(
      `SELECT t.id, t.title, t.is_active,
              (SELECT COUNT(*) FROM syllabus_remap_suggestions srs
                WHERE srs.source_old_topic_id = t.id AND srs.status = 'pending')::INTEGER AS pending_count
         FROM topics t
        WHERE t.subject_id = :subjectId
          AND t.source_syllabus_id IS DISTINCT FROM :docId
        ORDER BY t.title`,
      { replacements: { subjectId: doc.subject_id, docId: doc.id }, type: QueryTypes.SELECT }
    );
    const subtopics = await sequelize.query(
      `SELECT st.id, st.title, st.topic_id, st.is_active,
              (SELECT COUNT(*) FROM syllabus_remap_suggestions srs
                WHERE srs.source_old_subtopic_id = st.id AND srs.status = 'pending')::INTEGER AS pending_count
         FROM subtopics st
         JOIN topics t ON t.id = st.topic_id
        WHERE t.subject_id = :subjectId
          AND st.source_syllabus_id IS DISTINCT FROM :docId
        ORDER BY st.title`,
      { replacements: { subjectId: doc.subject_id, docId: doc.id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: { topics, subtopics } });
  } catch (err) {
    logger.error('[GET /api/syllabus/:id/old-topics]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Could not load old topics.' });
  }
});

// ─── POST /api/syllabus/:id/old-topics/deactivate ────────────────────────
// Body: { topicIds?: [...], subtopicIds?: [...] }. Refuses (whole request,
// nothing partial) if ANY named id still has a pending suggestion
// referencing it — re-checked here server-side, not trusted from the
// GET response the client is holding, in case another reviewer resolved
// something in between. One transaction, scoped to this document's own
// subject_id only (never touches another subject's topics/subtopics even
// if a client somehow supplied a foreign id).
router.post('/:id/old-topics/deactivate', protect, authorize('admin', 'teacher'), async (req, res) => {
  const topicIds = Array.isArray(req.body?.topicIds) ? req.body.topicIds : [];
  const subtopicIds = Array.isArray(req.body?.subtopicIds) ? req.body.subtopicIds : [];
  if (!topicIds.length && !subtopicIds.length) {
    return res.status(400).json({ success: false, error: 'topicIds and/or subtopicIds is required.' });
  }

  const t = await sequelize.transaction();
  try {
    const docRows = await sequelize.query(
      `SELECT id, subject_id FROM syllabus_documents WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT, transaction: t }
    );
    const doc = docRows[0];
    if (!doc) { await t.rollback(); return res.status(404).json({ success: false, error: 'Syllabus document not found.' }); }
    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, doc.subject_id))) {
      await t.rollback();
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    if (topicIds.length) {
      const blocked = await sequelize.query(
        `SELECT t.id, t.title,
                (SELECT COUNT(*) FROM syllabus_remap_suggestions srs
                  WHERE srs.source_old_topic_id = t.id AND srs.status = 'pending')::INTEGER AS pending_count
           FROM topics t WHERE t.id IN (:ids) AND t.subject_id = :subjectId`,
        { replacements: { ids: topicIds, subjectId: doc.subject_id }, type: QueryTypes.SELECT, transaction: t }
      );
      const stillPending = blocked.filter(b => b.pending_count > 0);
      if (stillPending.length) {
        await t.rollback();
        return res.status(409).json({
          success: false,
          error: `${stillPending.length} topic(s) still have unresolved suggestions and cannot be deactivated yet.`,
          blocked: stillPending,
        });
      }
      await sequelize.query(
        `UPDATE topics SET is_active = false WHERE id IN (:ids) AND subject_id = :subjectId`,
        { replacements: { ids: topicIds, subjectId: doc.subject_id }, type: QueryTypes.UPDATE, transaction: t }
      );
    }

    if (subtopicIds.length) {
      const blocked = await sequelize.query(
        `SELECT st.id, st.title,
                (SELECT COUNT(*) FROM syllabus_remap_suggestions srs
                  WHERE srs.source_old_subtopic_id = st.id AND srs.status = 'pending')::INTEGER AS pending_count
           FROM subtopics st JOIN topics t ON t.id = st.topic_id
          WHERE st.id IN (:ids) AND t.subject_id = :subjectId`,
        { replacements: { ids: subtopicIds, subjectId: doc.subject_id }, type: QueryTypes.SELECT, transaction: t }
      );
      const stillPending = blocked.filter(b => b.pending_count > 0);
      if (stillPending.length) {
        await t.rollback();
        return res.status(409).json({
          success: false,
          error: `${stillPending.length} subtopic(s) still have unresolved suggestions and cannot be deactivated yet.`,
          blocked: stillPending,
        });
      }
      await sequelize.query(
        `UPDATE subtopics st SET is_active = false FROM topics t
          WHERE st.topic_id = t.id AND st.id IN (:ids) AND t.subject_id = :subjectId`,
        { replacements: { ids: subtopicIds, subjectId: doc.subject_id }, type: QueryTypes.UPDATE, transaction: t }
      );
    }

    await t.commit();
    logger.info('[syllabus] old topics/subtopics deactivated', { subjectId: doc.subject_id, topicIds, subtopicIds, userId: req.user.id });
    return res.json({ success: true, data: { deactivatedTopics: topicIds.length, deactivatedSubtopics: subtopicIds.length } });
  } catch (err) {
    await t.rollback();
    logger.error('[POST /api/syllabus/:id/old-topics/deactivate]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Could not deactivate old topics.' });
  }
});

// ─── DELETE /api/syllabus/:id ────────────────────────────────────────────
// Lets an admin/teacher remove a syllabus document that's stuck, failed, or
// was uploaded by mistake — self-service, so this doesn't require going
// through the database directly next time a document gets permanently
// stuck (as one did: a fire-and-forget beginExtraction() call with no
// process-restart recovery left a row at status='processing' for 8+ hours
// after an apparent server restart mid-extraction — the AI-call-timeout
// fix in 5746acb prevents the underlying hang going forward, but doesn't
// retroactively clean up a document that was already orphaned before it
// landed).
//
// Deliberately BLOCKS deleting a 'confirmed' document. source_syllabus_id
// on topics/subtopics is ON DELETE SET NULL (migration_031), not CASCADE
// or RESTRICT — so deleting a confirmed document would not error, it would
// silently null out source_syllabus_id on every real topic/subtopic that
// document created, making an already-live, in-use tree look exactly like
// an old, pre-syllabus one to every downstream feature (this is precisely
// the "old tree" definition generateSyllabusRemapSuggestions.js and the
// old-topics/deactivate endpoint above both use: source_syllabus_id IS
// NULL). That's real data corruption for a click that looks like ordinary
// cleanup, so it's refused outright rather than requiring the caller to
// know to avoid it.
router.delete('/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const [doc] = await sequelize.query(
      `SELECT id, subject_id, status, file_url FROM syllabus_documents WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Syllabus document not found.' });

    if (doc.status === 'confirmed') {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete a confirmed syllabus document — it created real topics and subtopics that are in use. Deactivate the old tree instead once a replacement has been remapped, if you need to retire it.',
      });
    }

    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, doc.subject_id))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    // syllabus_remap_suggestions has ON DELETE CASCADE on syllabus_document_id
    // (migration_034) — shouldn't have any rows here anyway, since those are
    // only ever generated for a subject's CONFIRMED tree, but the cascade
    // makes this safe regardless.
    await sequelize.query(`DELETE FROM syllabus_documents WHERE id = :id`, {
      replacements: { id: doc.id }, type: QueryTypes.DELETE,
    });

    // Best-effort storage cleanup — same pattern as resourceRoutes.js's
    // DELETE /:id (r2.deleteByUrl for R2, fs.unlink for local disk), never
    // lets a storage-cleanup failure block or fail the actual deletion.
    if (doc.file_url) {
      if (/^https?:\/\//.test(doc.file_url)) {
        r2.deleteByUrl(doc.file_url).catch(() => {});
      } else {
        const fileName = path.basename(doc.file_url);
        fs.unlink(path.join(UPLOADS_DIR, fileName), () => {});
      }
    }

    logger.info('[syllabus] document deleted', { id: doc.id, status: doc.status, userId: req.user.id });
    return res.json({ success: true, data: { id: doc.id } });
  } catch (err) {
    logger.error('[DELETE /api/syllabus/:id]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Could not delete this syllabus document.' });
  }
});

module.exports = router;
