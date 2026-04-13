'use strict';
// server/routes/resourceRoutes.js
// Matches actual Resource model:
//   id (INTEGER), topic_id, subtopic_id, uploaded_by, title,
//   type (ENUM video/pdf/link/note/image/other), url, content,
//   description, is_premium, order_index, is_active, created_at, updated_at
//
// v2 UUID FIX: removed parseInt() from topic_id and subtopic_id query/body params
//   (these are UUID foreign keys). parseInt(req.params.id) is kept — resources.id is INTEGER.

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// ── File type map ─────────────────────────────────────────────────────────────
const MIME_TO_TYPE = {
  'video/mp4':       'video', 'video/webm': 'video', 'video/quicktime': 'video',
  'audio/mpeg':      'other', 'audio/wav':  'other', 'audio/mp4': 'other',
  'application/pdf': 'pdf',
  'application/msword': 'other',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'other',
  'application/vnd.ms-powerpoint': 'other',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'other',
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'resources');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts   = Date.now();
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `${ts}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (MIME_TO_TYPE[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ── POST /api/resources/upload ────────────────────────────────────────────────
// Form fields: title (required), topic_id (optional), subtopic_id (optional), description
// File field:  file
// subject_id is NOT stored in the Resource model — we look it up via subtopic_id or topic_id
router.post(
  '/upload',
  protect,
  authorize('teacher', 'admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' });
    }

    const { title, topic_id, subtopic_id, description } = req.body;

    if (!title?.trim()) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    // topic_id or subtopic_id should be provided for proper organisation
    // but we won't block upload if neither is given
    const resourceType = MIME_TO_TYPE[req.file.mimetype] || 'other';
    const fileUrl      = `/uploads/resources/${req.file.filename}`;

    try {
      const result = await sequelize.query(
        `INSERT INTO resources
           (topic_id, subtopic_id, uploaded_by, title, type, url,
            description, is_premium, is_active, created_at, updated_at)
         VALUES
           (:topicId, :subtopicId, :uploadedBy, :title, :type, :url,
            :description, false, true, NOW(), NOW())
         RETURNING id`,
        {
          replacements: {
            topicId:     topic_id    || null,   // FIX: was parseInt(topic_id)
            subtopicId:  subtopic_id || null,   // FIX: was parseInt(subtopic_id)
            uploadedBy:  req.user.id,
            title:       title.trim(),
            type:        resourceType,
            url:         fileUrl,
            description: description || null,
          },
          type: QueryTypes.SELECT,
        }
      );

      return res.status(201).json({
        success: true,
        message: 'Resource uploaded successfully',
        data: {
          id:          result[0].id,
          title:       title.trim(),
          type:        resourceType,
          url:         fileUrl,
          topic_id:    topic_id    || null,
          subtopic_id: subtopic_id || null,
        },
      });
    } catch (err) {
      fs.unlink(req.file.path, () => {});
      console.error('[POST /resources/upload]', err.message);
      return res.status(500).json({ success: false, error: 'Failed to save resource: ' + err.message });
    }
  }
);

// ── GET /api/resources ────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const { topic_id, subtopic_id, type } = req.query;
  const filters      = ['r.is_active = true'];
  const replacements = {};
  // FIX: was parseInt(topic_id) / parseInt(subtopic_id) — both are UUID foreign keys
  if (topic_id)    { filters.push('r.topic_id    = :topic_id');    replacements.topic_id    = topic_id;    }
  if (subtopic_id) { filters.push('r.subtopic_id = :subtopic_id'); replacements.subtopic_id = subtopic_id; }
  if (type)        { filters.push('r.type        = :type');         replacements.type        = type;        }

  try {
    const rows = await sequelize.query(
      `SELECT r.id, r.title, r.type, r.url, r.description, r.is_premium,
              r.topic_id, r.subtopic_id, r.created_at,
              u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last,
              t.name AS topic_name, st.name AS subtopic_name
       FROM resources r
       LEFT JOIN users     u  ON r.uploaded_by  = u.id
       LEFT JOIN topics    t  ON r.topic_id     = t.id
       LEFT JOIN subtopics st ON r.subtopic_id  = st.id
       WHERE ${filters.join(' AND ')}
       ORDER BY r.created_at DESC`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('[GET /resources]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/resources/:id ────────────────────────────────────────────────────
// resources.id is INTEGER — parseInt(req.params.id) is correct here
router.get('/:id', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT r.*, u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last,
              t.name AS topic_name, st.name AS subtopic_name
       FROM resources r
       LEFT JOIN users     u  ON r.uploaded_by = u.id
       LEFT JOIN topics    t  ON r.topic_id    = t.id
       LEFT JOIN subtopics st ON r.subtopic_id = st.id
       WHERE r.id = :id AND r.is_active = true`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Resource not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/resources/:id ─────────────────────────────────────────────────
// resources.id is INTEGER — parseInt(req.params.id) is correct here
router.delete('/:id', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, url, uploaded_by FROM resources WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Resource not found' });
    const resource = rows[0];
    if (req.user.role === 'teacher' && resource.uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only delete your own resources' });
    }
    await sequelize.query(
      `UPDATE resources SET is_active = false WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.UPDATE }
    );
    const filePath = path.join(__dirname, '..', (resource.url || '').replace(/^\//, ''));
    fs.unlink(filePath, () => {});
    return res.json({ success: true, message: 'Resource deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
