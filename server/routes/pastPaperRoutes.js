'use strict';

/**
 * server/routes/pastPaperRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY REMEDIATION 2026-06-16
 *
 * Fixes applied:
 *
 *   INVALID-01 (Critical — MIME spoofing on PDF uploads)
 *     BEFORE: fileFilter checked only `file.mimetype === 'application/pdf'`
 *             which is attacker-controlled. A non-PDF file with
 *             Content-Type: application/pdf passed the check and was stored
 *             under its original extension (e.g. payload.html).
 *     AFTER:  uploadSecurity middleware performs:
 *               1. Extension allowlist   (.pdf only)
 *               2. MIME allowlist        (application/pdf only)
 *               3. Magic-byte check      (%PDF- header required)
 *               4. Structure check       (%%EOF trailer required)
 *             Stored filename is UUID-based; original name kept separately.
 *             SHA-256 hash stored for integrity and deduplication.
 *
 *   FUNC-01 (Medium — wrong HTTP status codes on rejection)
 *     BEFORE: Multer mounted as router middleware → rejected files threw 500.
 *     AFTER:  createUploadMiddleware uses callback pattern → 400/413/415/422.
 *
 *   ACCESS-02 (Informational — public listing with no auth)
 *     Preserved as intentional. GET /api/past-papers remains public.
 *     Comment added to make the policy explicit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express   = require('express');
const router    = express.Router();
const path      = require('path');
const fs        = require('fs');
const { QueryTypes } = require('sequelize');

const sequelize  = require('../config/database');
const { protect } = require('../middleware/auth');
const { createUploadMiddleware } = require('../middleware/uploadSecurity');
const r2         = require('../utils/r2Storage');
const pastPaperScraper = require('../services/pastPaperScraper');
const logger     = require('../config/logger');

// ── Upload directory (local fallback) ─────────────────────────────────────────
const PAST_PAPERS_DIR = path.join(__dirname, '../uploads/past-papers');

// ── Secure upload middleware ───────────────────────────────────────────────────
// PDF-only, 50 MB limit. Extension, MIME, magic bytes, and structure all checked.
const upload = createUploadMiddleware({
  maxSizeMB:    50,
  allowedTypes: ['pdf'],
});

// ── Role guard ────────────────────────────────────────────────────────────────
const teacherOrAdmin = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Teacher or admin access required' });
  }
  next();
};

// ── GET /api/past-papers ──────────────────────────────────────────────────────
// ACCESS-02: Intentionally public — past exam papers are freely shareable
// reference material. Confirmed policy. If this should change, add `protect`
// and appropriate tier/role gating here.
router.get('/', async (req, res) => {
  try {
    const tableCheck = await sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'past_papers'
       ) AS exists`,
      { type: QueryTypes.SELECT }
    );
    if (!tableCheck[0]?.exists) {
      return res.status(200).json({ success: true, data: [], message: 'Past papers coming soon' });
    }

    const { subject_id, exam_board, year_from, year_to } = req.query;
    const conditions   = ['1=1'];
    const replacements = {};

    if (subject_id) { conditions.push('pp.subject_id = :subject_id'); replacements.subject_id = subject_id; }
    if (exam_board) { conditions.push('pp.exam_board = :exam_board'); replacements.exam_board = exam_board; }
    if (year_from)  { conditions.push('pp.year >= :year_from');       replacements.year_from  = Number(year_from); }
    if (year_to)    { conditions.push('pp.year <= :year_to');         replacements.year_to    = Number(year_to); }

    const rows = await sequelize.query(
      `SELECT pp.id, pp.title, pp.exam_board, pp.year, pp.paper_type,
              pp.file_url, pp.file_size_bytes, pp.created_at,
              s.name AS subject_name
         FROM past_papers pp
         LEFT JOIN subjects s ON s.id = pp.subject_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY pp.year DESC, pp.title ASC`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('[GET /api/past-papers]', err.message);
    return res.status(200).json({ success: true, data: [], message: 'Past papers coming soon' });
  }
});

// ── POST /api/past-papers ─────────────────────────────────────────────────────
router.post('/', protect, teacherOrAdmin, upload.single('file'), async (req, res) => {
  // req.secureFile is populated by uploadSecurity middleware
  if (!req.secureFile) {
    return res.status(400).json({ success: false, error: 'PDF file is required' });
  }

  const { subject_id, exam_board, year, paper_type, title } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'title is required' });

  const f = req.secureFile;
  let fileUrl;

  try {
    if (r2.isR2Enabled()) {
      const { url } = await r2.uploadBuffer({
        buffer:       f.buffer,
        originalname: f.storedName,   // UUID name to storage
        mimetype:     f.mimeType,     // validated canonical MIME only
      });
      fileUrl = url;
    } else {
      // Local disk fallback — write UUID-named file
      fs.mkdirSync(PAST_PAPERS_DIR, { recursive: true });
      const diskPath = path.join(PAST_PAPERS_DIR, f.storedName);
      fs.writeFileSync(diskPath, f.buffer);
      fileUrl = `/uploads/past-papers/${f.storedName}`;
    }
  } catch (err) {
    logger.error('[POST /api/past-papers] storage error:', err.message);
    return res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
  }

  try {
    const result = await sequelize.query(
      `INSERT INTO past_papers
         (subject_id, exam_board, year, paper_type, title,
          file_url, file_size_bytes, created_by, created_at)
       VALUES
         (:subject_id, :exam_board, :year, :paper_type, :title,
          :file_url, :file_size_bytes, :created_by, NOW())
       RETURNING id`,
      {
        replacements: {
          subject_id:      subject_id || null,
          exam_board:      exam_board || null,
          year:            year ? Number(year) : null,
          paper_type:      paper_type || null,
          title,
          file_url:        fileUrl,
          file_size_bytes: f.size,
          created_by:      req.user.id,
        },
        type: QueryTypes.INSERT,
      }
    );

    logger.info('[POST /api/past-papers] uploaded', {
      id:       result[0][0].id,
      sha256:   f.sha256,
      size:     f.size,
      uploader: req.user.id,
    });

    return res.status(201).json({ success: true, data: { id: result[0][0].id, file_url: fileUrl } });
  } catch (err) {
    logger.error('[POST /api/past-papers] db error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/past-papers/:id ───────────────────────────────────────────────
router.delete('/:id', protect, (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  next();
}, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `DELETE FROM past_papers WHERE id = :id RETURNING file_url`,
      { replacements: { id: req.params.id }, type: QueryTypes.DELETE }
    );

    const fileUrl = rows?.[0]?.[0]?.file_url;
    if (fileUrl) {
      if (/^https?:\/\//i.test(fileUrl)) {
        r2.deleteByUrl(fileUrl).catch(() => {});
      } else {
        const filePath = path.join(__dirname, '..', fileUrl);
        fs.unlink(filePath, () => {});
      }
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error('[DELETE /api/past-papers]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/past-papers/scrape ──────────────────────────────────────────────
router.post('/scrape', protect, (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  next();
}, async (req, res) => {
  const { source_url, exam_board, subject_id, paper_type, year_hint, follow_subpages } = req.body || {};

  if (!source_url || !/^https?:\/\//i.test(source_url)) {
    return res.status(400).json({ success: false, error: 'A valid source_url (http/https) is required.' });
  }

  try {
    const summary = await pastPaperScraper.scrape({
      source_url,
      exam_board:     exam_board || null,
      subject_id:     subject_id ? Number(subject_id) : null,
      paper_type:     paper_type || null,
      year_hint:      year_hint  ? Number(year_hint)  : null,
      follow_subpages: follow_subpages !== false,
      created_by:     req.user.id,
    });
    return res.json({ success: true, data: summary });
  } catch (err) {
    logger.error('[POST /past-papers/scrape]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
