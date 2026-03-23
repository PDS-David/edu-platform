// server/routes/resourceRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   POST   /api/resources/upload          — teacher/admin: upload file
//   GET    /api/resources                 — authenticated: list resources
//   DELETE /api/resources/:id             — teacher/admin: delete resource
//   GET    /api/resources/:id             — authenticated: single resource
// ─────────────────────────────────────────────────────────────────────────────

const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(v); }

// ── Accepted MIME types ───────────────────────────────────────────────────────
const ALLOWED_TYPES = {
  // Video
  'video/mp4':       { type: 'video',    ext: '.mp4'  },
  'video/webm':      { type: 'video',    ext: '.webm' },
  'video/quicktime': { type: 'video',    ext: '.mov'  },
  // Audio
  'audio/mpeg':      { type: 'audio',    ext: '.mp3'  },
  'audio/wav':       { type: 'audio',    ext: '.wav'  },
  'audio/mp4':       { type: 'audio',    ext: '.m4a'  },
  // Documents
  'application/pdf': { type: 'document', ext: '.pdf'  },
  'application/msword': { type: 'document', ext: '.doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'document', ext: '.docx' },
  'application/vnd.ms-powerpoint': { type: 'document', ext: '.ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { type: 'document', ext: '.pptx' },
};

// ── Multer storage — preserve original name, store in /uploads/resources ──────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'resources');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}. Accepted: MP4, WebM, MP3, WAV, PDF, DOCX, PPTX`));
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/resources/upload
// Teacher or admin only. Uploads a file and creates a resources record.
// Form fields: subject_id, topic_id (optional), subtopic_id (optional), title
// File field:  file
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/upload',
  protect,
  authorize('teacher', 'admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' });
    }

    const { subject_id, topic_id, subtopic_id, title } = req.body;

    if (!subject_id || !isValidUUID(subject_id)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, error: 'subject_id is required and must be a valid UUID' });
    }

    if (!title || !title.trim()) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const mimeInfo    = ALLOWED_TYPES[req.file.mimetype];
    const resourceType = mimeInfo.type;
    const fileUrl     = `/uploads/resources/${req.file.filename}`;
    const fileSizeBytes = req.file.size;

    try {
      // For video files, check if HLS pipeline exists and trigger it
      let hlsPath = null;
      if (resourceType === 'video') {
        try {
          const { encryptVideo } = require('../utils/videoEncryption');
          const videoId = uuidv4();
          hlsPath = await encryptVideo(req.file.path, videoId);
        } catch (hlsErr) {
          // HLS encryption failed — still save the resource with direct file URL
          console.warn('[ResourceUpload] HLS encryption skipped:', hlsErr.message);
        }
      }

      // Insert resource record
      const result = await sequelize.query(
        `INSERT INTO resources
           (topic_id, subject_id, subtopic_id, uploaded_by, title,
            resource_type, file_url, hls_path, file_size_bytes,
            content_url, is_free, created_at)
         VALUES
           (:topicId, :subjectId, :subtopicId, :uploadedBy, :title,
            :resourceType, :fileUrl, :hlsPath, :fileSizeBytes,
            :contentUrl, false, NOW())
         RETURNING id`,
        {
          replacements: {
            topicId:       topic_id    || null,
            subjectId:     subject_id,
            subtopicId:    subtopic_id || null,
            uploadedBy:    req.user.id,
            title:         title.trim(),
            resourceType,
            fileUrl,
            hlsPath:       hlsPath || null,
            fileSizeBytes,
            contentUrl:    hlsPath ? hlsPath : fileUrl,
          },
          type: QueryTypes.SELECT,
        }
      );

      const resourceId = result[0].id;

      return res.status(201).json({
        success: true,
        message: 'Resource uploaded successfully',
        data: {
          id:            resourceId,
          title:         title.trim(),
          resource_type: resourceType,
          file_url:      fileUrl,
          hls_path:      hlsPath,
          file_size_bytes: fileSizeBytes,
          subject_id,
          topic_id:    topic_id    || null,
          subtopic_id: subtopic_id || null,
        },
      });

    } catch (err) {
      // Clean up uploaded file if DB insert fails
      fs.unlink(req.file.path, () => {});
      console.error('[POST /resources/upload] Error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to save resource' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/resources
// Returns resources filtered by query params.
// Query params: subject_id, topic_id, subtopic_id, resource_type
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const { subject_id, topic_id, subtopic_id, resource_type } = req.query;

  const filters      = [];
  const replacements = {};

  if (subject_id  && isValidUUID(subject_id))  { filters.push('r.subject_id  = :subject_id');  replacements.subject_id  = subject_id;  }
  if (topic_id    && isValidUUID(topic_id))    { filters.push('r.topic_id    = :topic_id');    replacements.topic_id    = topic_id;    }
  if (subtopic_id && isValidUUID(subtopic_id)) { filters.push('r.subtopic_id = :subtopic_id'); replacements.subtopic_id = subtopic_id; }
  if (resource_type) { filters.push('r.resource_type = :resource_type'); replacements.resource_type = resource_type; }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const resources = await sequelize.query(
      `SELECT
         r.id, r.title, r.resource_type, r.file_url, r.hls_path,
         r.file_size_bytes, r.duration_seconds, r.content_url,
         r.subject_id, r.topic_id, r.subtopic_id,
         r.created_at,
         u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last,
         s.name AS subject_name,
         st.name AS subtopic_name
       FROM resources r
       LEFT JOIN users     u  ON r.uploaded_by  = u.id
       LEFT JOIN subjects  s  ON r.subject_id   = s.id
       LEFT JOIN subtopics st ON r.subtopic_id  = st.id
       ${where}
       ORDER BY r.created_at DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      count: resources.length,
      data:  resources,
    });
  } catch (err) {
    console.error('[GET /resources] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch resources' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/resources/:id
// Single resource by ID
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid resource ID' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT r.*, u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last,
              s.name AS subject_name, st.name AS subtopic_name
       FROM resources r
       LEFT JOIN users     u  ON r.uploaded_by = u.id
       LEFT JOIN subjects  s  ON r.subject_id  = s.id
       LEFT JOIN subtopics st ON r.subtopic_id = st.id
       WHERE r.id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(`[GET /resources/${id}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch resource' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/resources/:id
// Teacher or admin only. Deletes the DB record and the file from disk.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('teacher', 'admin'), async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid resource ID' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT id, file_url, hls_path, uploaded_by FROM resources WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    const resource = rows[0];

    // Teachers can only delete their own uploads; admins can delete any
    if (req.user.role === 'teacher' && resource.uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only delete your own resources' });
    }

    // Delete from DB
    await sequelize.query(
      `DELETE FROM resources WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.DELETE }
    );

    // Delete file from disk
    const filePath = path.join(__dirname, '..', resource.file_url.replace(/^\//, ''));
    fs.unlink(filePath, (err) => {
      if (err) console.warn('[ResourceDelete] Could not delete file:', err.message);
    });

    return res.status(200).json({ success: true, message: 'Resource deleted successfully' });
  } catch (err) {
    console.error(`[DELETE /resources/${id}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete resource' });
  }
});

module.exports = router;
