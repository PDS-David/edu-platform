// server/routes/pastPaperRoutes.js
// GET  /api/past-papers          — list with filters (public)
// POST /api/past-papers          — upload (teacher/admin, multipart)
// DELETE /api/past-papers/:id    — admin only

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

// ── Multer — save to uploads/past-papers/ ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/past-papers');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
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
router.post('/', protect, teacherOrAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'PDF file is required' });

  const { subject_id, exam_board, year, paper_type, title } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'title is required' });

  const fileUrl = `/uploads/past-papers/${req.file.filename}`;
  try {
    const result = await sequelize.query(
      `INSERT INTO past_papers
         (id, subject_id, exam_board, year, paper_type, title, file_url, file_size_bytes, created_by, created_at)
       VALUES
         (gen_random_uuid(), :subject_id, :exam_board, :year, :paper_type, :title,
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
    // Optionally delete the file from disk
    if (rows?.[0]?.[0]?.file_url) {
      const filePath = path.join(__dirname, '..', rows[0][0].file_url);
      fs.unlink(filePath, () => {}); // fire and forget
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
