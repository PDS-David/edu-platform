'use strict';
// server/routes/resourceRoutes.js

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

/* ================================
   UPLOADS DIR
================================ */

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'resources');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

/* ================================
   ENSURE EXTRA COLUMNS
================================ */

let columnsEnsured = false;
async function ensureExtraColumns() {
  if (columnsEnsured) return;
  const alters = [
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_staged BOOLEAN DEFAULT false`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const sql of alters) await sequelize.query(sql).catch(() => {});
  columnsEnsured = true;
}

async function ensureAssignmentsTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS resource_user_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_id UUID NOT NULL,
      user_id UUID NOT NULL,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(resource_id, user_id)
    )
  `).catch(() => {});
}

/* ================================
   HELPER
================================ */

function guessResourceType(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (['.mp4', '.mov', '.webm', '.avi'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
  if (['.doc', '.docx'].includes(ext)) return 'document';
  if (['.ppt', '.pptx'].includes(ext)) return 'presentation';
  return 'document';
}

/* ================================
   BULK UPLOAD
================================ */

router.post(
  '/bulk-upload',
  protect,
  authorize('admin', 'teacher'),
  upload.array('files', 20),
  async (req, res) => {
    await ensureExtraColumns();

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files received' });
    }

    const uploaded = [];
    const failed = [];

    for (const file of req.files) {
      try {
        const resourceType = guessResourceType(file.originalname);
        const fileUrl = `/uploads/resources/${file.filename}`;
        const ext = path.extname(file.originalname);

        const rows = await sequelize.query(`
          INSERT INTO resources
            (title, resource_type, file_url, file_size_bytes,
             original_filename, mime_type,
             is_staged, is_active, is_free,
             uploaded_by, created_at, updated_at)
          VALUES
            (:title, :resource_type, :file_url, :file_size_bytes,
             :original_filename, :mime_type,
             true, true, true,
             :uploaded_by, NOW(), NOW())
          RETURNING id, title, resource_type, file_url,
                    file_size_bytes, original_filename, is_staged, created_at
        `, {
          replacements: {
            title: path.basename(file.originalname, ext),
            resource_type: resourceType,
            file_url: fileUrl,
            file_size_bytes: file.size,
            original_filename: file.originalname,
            mime_type: file.mimetype,
            uploaded_by: req.user.id,
          },
          type: QueryTypes.SELECT,
        });

        uploaded.push(rows[0]);
      } catch (err) {
        failed.push({ filename: file.originalname, error: err.message });
      }
    }

    return res.json({
      success: uploaded.length > 0,
      uploaded: uploaded.length,
      failed: failed.length,
      failures: failed,
      data: uploaded,
    });
  }
);

/* ================================
   SINGLE FILE UPLOAD (NEW BLOCK)
================================ */

router.post(
  '/upload',
  protect,
  authorize('admin', 'teacher'),
  upload.single('file'),
  async (req, res) => {
    await ensureExtraColumns();

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file received' });
    }

    const { title, topic_id, subtopic_id } = req.body;
    const resourceType = guessResourceType(req.file.originalname);
    const fileUrl = `/uploads/resources/${req.file.filename}`;
    const ext = path.extname(req.file.originalname);

    try {
      const rows = await sequelize.query(`
        INSERT INTO resources
          (title, resource_type, file_url, file_size_bytes,
           original_filename, mime_type, topic_id, subtopic_id,
           is_staged, is_active, is_free, uploaded_by, created_at, updated_at)
        VALUES
          (:title, :resource_type, :file_url, :file_size_bytes,
           :original_filename, :mime_type, :topic_id, :subtopic_id,
           false, true, true, :uploaded_by, NOW(), NOW())
        RETURNING id, title, resource_type, file_url,
                  file_size_bytes, original_filename, created_at
      `, {
        replacements: {
          title: (title || path.basename(req.file.originalname, ext)).trim(),
          resource_type: resourceType,
          file_url: fileUrl,
          file_size_bytes: req.file.size,
          original_filename: req.file.originalname,
          mime_type: req.file.mimetype,
          topic_id: topic_id || null,
          subtopic_id: subtopic_id || null,
          uploaded_by: req.user.id,
        },
        type: QueryTypes.SELECT,
      });

      return res.json({
        success: true,
        data: rows[0],
        message: 'Resource uploaded successfully.',
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ================================
   GET RESOURCES
================================ */

router.get('/', protect, async (req, res) => {
  await ensureExtraColumns();

  try {
    const rows = await sequelize.query(`
      SELECT r.id, r.title, r.file_url
      FROM resources r
      WHERE COALESCE(r.is_active, true) = true
      ORDER BY r.created_at DESC
    `, { type: QueryTypes.SELECT });

    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

module.exports = router;
