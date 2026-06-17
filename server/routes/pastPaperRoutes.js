// server/routes/pastPaperRoutes.js
// GET  /api/past-papers          — list with filters (public)
// POST /api/past-papers          — upload (teacher/admin, multipart)
// DELETE /api/past-papers/:id    — admin only
//
// SECURITY REMEDIATION 2026-06-17
//  INVALID-01: Replaced client-MIME-only check with four-layer validation via
//              validateBuffer (extension allowlist + declared MIME + magic bytes
//              + PDF structure). Filenames are now sanitised before storage.
//  FUNC-01:    multer errors now return proper 400/413, not generic 500.

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');
const r2 = require('../utils/r2Storage');
const pastPaperScraper = require('../services/pastPaperScraper');
const {
  validateBuffer,
  multerFileFilter,
  multerErrorHandler,
  sanitiseFilename,
  logUploadAttempt,
} = require('../utils/fileValidation');

// ── Multer ───────────────────────────────────────────────────────────────────
// When R2 is configured, hold the file in memory and push to object storage.
// Otherwise persist to local disk (Hetzner persistent volume) as a fallback.
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/past-papers');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // UUID-based name: original filename never touches the filesystem.
    const { secureStorageName } = require('../utils/fileValidation');
    cb(null, secureStorageName('pdf'));
  },
});

// Pre-flight: extension + declared-MIME check. Full validation (magic bytes +
// PDF structure) runs inside the route handler after the buffer is available.
const upload = multer({
  storage: r2.isR2Enabled() ? multer.memoryStorage() : diskStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: multerFileFilter(['pdf']),
});

const teacherOrAdmin = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Teacher or admin access required' });
  }
  next();
};

// ── GET /api/past-papers ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Safety check — return gracefully if table doesn't exist yet
    const tableCheck = await sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'past_papers'
       ) AS exists`,
      { type: QueryTypes.SELECT }
    );
    if (!tableCheck[0]?.exists) {
      return res.status(200).json({
        success: true,
        data:    [],
        message: 'Past papers coming soon',
      });
    }

    const { subject_id, exam_board, year_from, year_to } = req.query;
    const conditions = ['1=1'];
    const replacements = {};

    if (subject_id)  { conditions.push('pp.subject_id = :subject_id');   replacements.subject_id = subject_id; }
    if (exam_board)  { conditions.push('pp.exam_board = :exam_board');   replacements.exam_board = exam_board; }
    if (year_from)   { conditions.push('pp.year >= :year_from');         replacements.year_from = Number(year_from); }
    if (year_to)     { conditions.push('pp.year <= :year_to');           replacements.year_to   = Number(year_to); }

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
    // Always return gracefully — never 500 to the client for missing table
    console.error('[GET /api/past-papers]', err.message);
    return res.status(200).json({ success: true, data: [], message: 'Past papers coming soon' });
  }
});

// ── POST /api/past-papers ─────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  teacherOrAdmin,
  // Wrap multer in callback style so multer errors return 400/413, not 500.
  (req, res, next) => upload.single('file')(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    next();
  }),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'PDF file is required' });

    // ── Deep validation: magic-byte + PDF structure ───────────────────────
    const buf = req.file.buffer || (() => {
      try { return fs.readFileSync(req.file.path); } catch (_) { return null; }
    })();

    if (buf) {
      const v = await validateBuffer(buf, req.file.originalname, req.file.mimetype);
      logUploadAttempt({
        success:      v.valid,
        userId:       req.user?.id,
        originalname: req.file.originalname,
        ext:          v.ext,
        detectedMime: v.detectedMime,
        hash:         v.hash,
        size:         req.file.size,
        error:        v.error,
        route:        'POST /past-papers',
      });
      if (!v.valid) {
        if (req.file.path) fs.unlink(req.file.path, () => {});
        return res.status(v.status || 422).json({ success: false, error: v.error });
      }
    }

    const { subject_id, exam_board, year, paper_type, title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'title is required' });

    const safeOriginal = sanitiseFilename(req.file.originalname);

    let fileUrl;
    try {
      if (r2.isR2Enabled()) {
        const { url } = await r2.uploadBuffer({
          buffer:       req.file.buffer,
          originalname: safeOriginal,
          mimetype:     'application/pdf', // validated — safe to assert
        });
        fileUrl = url;
      } else {
        fileUrl = `/uploads/past-papers/${req.file.filename}`;
      }
    } catch (err) {
      console.error('[POST /api/past-papers] upload error:', err.message);
      return res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
    }

    try {
      const result = await sequelize.query(
        `INSERT INTO past_papers (subject_id, exam_board, year, paper_type, title, file_url, file_size_bytes, created_by, created_at)
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
            file_size_bytes: req.file.size,
            created_by:      req.user.id,
          },
          type: QueryTypes.INSERT,
        }
      );
      return res.status(201).json({ success: true, data: { id: result[0][0].id, file_url: fileUrl } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

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
        // R2-hosted: best-effort remote delete
        r2.deleteByUrl(fileUrl).catch(() => {});
      } else {
        // Local disk fallback
        const filePath = path.join(__dirname, '..', fileUrl);
        fs.unlink(filePath, () => {}); // fire and forget
      }
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/past-papers/scrape ──────────────────────────────────────────────
// Admin-only. Crawl a starting URL for PDFs and import any it finds into the
// past_papers library. Re-runs are safe — duplicates are skipped by source_url.
//
// Body:
//   { source_url, exam_board?, subject_id?, paper_type?, year_hint?,
//     follow_subpages? }
router.post('/scrape', protect, (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  next();
}, async (req, res) => {
  const {
    source_url,
    exam_board,
    subject_id,
    paper_type,
    year_hint,
    follow_subpages,
  } = req.body || {};

  if (!source_url || !/^https?:\/\//i.test(source_url)) {
    return res.status(400).json({
      success: false,
      error: 'A valid source_url (http/https) is required.',
    });
  }

  try {
    const summary = await pastPaperScraper.scrape({
      source_url,
      exam_board: exam_board || null,
      subject_id: subject_id ? Number(subject_id) : null,
      paper_type: paper_type || null,
      year_hint:  year_hint  ? Number(year_hint)  : null,
      follow_subpages: follow_subpages !== false,
      created_by: req.user.id,
    });
    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error('[POST /past-papers/scrape]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
