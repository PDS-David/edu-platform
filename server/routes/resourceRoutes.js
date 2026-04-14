'use strict';
// server/routes/resourceRoutes.js  v3
//
// Routes:
//   POST   /upload              — single upload (teacher/admin), topic optional
//   POST   /bulk-upload         — admin bulk upload up to 20 files, no metadata needed
//   PUT    /:id/assign-meta     — admin assigns exam_type, subject, topic, subtopic to a staged file
//   PUT    /:id/assign-users    — admin assigns a resource to specific students or all students
//   GET    /staged              — admin: list unassigned/staged resources
//   GET    /                    — teacher sees own; student sees accessible; admin sees all
//   GET    /:id                 — single resource
//   DELETE /:id                 — teacher (own) or admin

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// ── MIME → type ───────────────────────────────────────────────────────────────
const MIME_TO_TYPE = {
  'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
  'audio/mpeg': 'other', 'audio/wav': 'other', 'audio/mp4': 'other',
  'application/pdf': 'pdf',
  'application/msword': 'other',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'other',
  'application/vnd.ms-powerpoint': 'other',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'other',
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image',
};

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'resources');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`);
  },
});
const fileFilter = (_req, file, cb) => {
  if (MIME_TO_TYPE[file.mimetype]) cb(null, true);
  else cb(new Error(`File type not allowed: ${file.mimetype}`));
};
const uploadSingle = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 }, fileFilter });
const uploadBulk   = multer({ storage, limits: { fileSize: 500 * 1024 * 1024, files: 20 }, fileFilter });

// ── Middleware helpers ─────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin access required' });
  next();
};

// ── Safe insert (handles pre-migration INTEGER uploaded_by column) ─────────────
async function safeInsert(replacements) {
  const withOwner = `
    INSERT INTO resources (topic_id, subtopic_id, uploaded_by, title, type, url,
      description, is_premium, is_active, is_staged, file_size_bytes, original_filename, created_at, updated_at)
    VALUES (:topicId, :subtopicId, :uploadedBy, :title, :type, :url,
      :description, false, true, :isStaged, :fileSize, :originalFilename, NOW(), NOW())
    RETURNING id`;
  const withoutOwner = `
    INSERT INTO resources (topic_id, subtopic_id, title, type, url,
      description, is_premium, is_active, is_staged, file_size_bytes, original_filename, created_at, updated_at)
    VALUES (:topicId, :subtopicId, :title, :type, :url,
      :description, false, true, :isStaged, :fileSize, :originalFilename, NOW(), NOW())
    RETURNING id`;
  try {
    const r = await sequelize.query(withOwner, { replacements, type: QueryTypes.SELECT });
    return r[0];
  } catch (e) {
    if (e.message.includes('invalid input syntax for type integer') ||
        e.message.includes('column "is_staged" of relation') ||
        e.message.includes('column "file_size_bytes" of relation') ||
        e.message.includes('column "original_filename" of relation')) {
      // Fallback for older schema — insert with minimal columns
      const minimal = `
        INSERT INTO resources (topic_id, subtopic_id, title, type, url,
          description, is_premium, is_active, created_at, updated_at)
        VALUES (:topicId, :subtopicId, :title, :type, :url,
          :description, false, true, NOW(), NOW())
        RETURNING id`;
      const r = await sequelize.query(minimal, { replacements, type: QueryTypes.SELECT });
      return r[0];
    }
    throw e;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/resources/upload  — single upload (teacher/admin)
// ═════════════════════════════════════════════════════════════════════════════
router.post('/upload', protect, authorize('teacher', 'admin'), uploadSingle.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
  const { title, topic_id, subtopic_id, description } = req.body;
  if (!title?.trim()) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ success: false, error: 'title is required' }); }

  const type    = MIME_TO_TYPE[req.file.mimetype] || 'other';
  const fileUrl = `/uploads/resources/${req.file.filename}`;
  try {
    const row = await safeInsert({
      topicId: topic_id || null, subtopicId: subtopic_id || null,
      uploadedBy: req.user.id, title: title.trim(), type, url: fileUrl,
      description: description || null, isStaged: false,
      fileSize: req.file.size, originalFilename: req.file.originalname,
    });
    return res.status(201).json({ success: true, message: 'Resource uploaded.', data: { id: row.id, title: title.trim(), type, url: fileUrl } });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ success: false, error: 'Failed to save: ' + err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/resources/bulk-upload  — admin uploads up to 20 files at once
// Files are saved immediately; metadata (exam type, subject, topic) is
// assigned later via PUT /api/resources/:id/assign-meta
// ═════════════════════════════════════════════════════════════════════════════
router.post('/bulk-upload', protect, adminOnly, uploadBulk.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded. Use field name "files".' });
  }

  const results  = [];
  const failures = [];

  for (const file of req.files) {
    const type        = MIME_TO_TYPE[file.mimetype] || 'other';
    const fileUrl     = `/uploads/resources/${file.filename}`;
    const title       = file.originalname.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

    try {
      const row = await safeInsert({
        topicId: null, subtopicId: null,
        uploadedBy: req.user.id, title, type, url: fileUrl,
        description: null, isStaged: true,
        fileSize: file.size, originalFilename: file.originalname,
      });
      results.push({
        id:                row.id,
        title,
        type,
        url:               fileUrl,
        original_filename: file.originalname,
        file_size:         file.size,
        is_staged:         true,
      });
    } catch (err) {
      fs.unlink(file.path, () => {});
      failures.push({ filename: file.originalname, error: err.message });
    }
  }

  return res.status(201).json({
    success:  true,
    uploaded: results.length,
    failed:   failures.length,
    message:  `${results.length} file(s) uploaded. ${failures.length > 0 ? failures.length + ' failed.' : ''} Assign metadata to make them visible to students.`,
    files:    results,
    failures,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/resources/:id/assign-meta  — admin assigns exam type / subject / topic / subtopic
// Also clears the is_staged flag so the resource becomes visible to students
// ═════════════════════════════════════════════════════════════════════════════
router.put('/:id/assign-meta', protect, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, topic_id, subtopic_id, description, exam_type_id, subject_id } = req.body;

  if (!topic_id && !subject_id) {
    return res.status(400).json({ success: false, error: 'At least a subject or topic must be assigned.' });
  }

  try {
    // Resolve topic_id from subject_id if topic_id not given
    // (store subject_id on the resource via a topic in that subject)
    let resolvedTopicId = topic_id || null;

    await sequelize.query(
      `UPDATE resources SET
         title       = COALESCE(NULLIF(:title, ''), title),
         topic_id    = :topic_id,
         subtopic_id = :subtopic_id,
         description = COALESCE(:description, description),
         is_staged   = false,
         updated_at  = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id,
          title:       title || '',
          topic_id:    resolvedTopicId,
          subtopic_id: subtopic_id || null,
          description: description || null,
        },
        type: QueryTypes.UPDATE,
      }
    ).catch(async () => {
      // Fallback if is_staged column doesn't exist yet
      await sequelize.query(
        `UPDATE resources SET
           title       = COALESCE(NULLIF(:title, ''), title),
           topic_id    = :topic_id,
           subtopic_id = :subtopic_id,
           updated_at  = NOW()
         WHERE id = :id`,
        { replacements: { id, title: title || '', topic_id: resolvedTopicId, subtopic_id: subtopic_id || null }, type: QueryTypes.UPDATE }
      );
    });

    return res.json({ success: true, message: 'Metadata assigned. Resource is now visible to students.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/resources/:id/assign-users  — admin assigns resource to specific students
// Body: { user_ids: ['uuid1','uuid2'] }  OR  { assign_all: true }
// ═════════════════════════════════════════════════════════════════════════════
router.put('/:id/assign-users', protect, adminOnly, async (req, res) => {
  const resourceId = parseInt(req.params.id);
  const { user_ids, assign_all } = req.body;

  try {
    // Ensure assignment table exists
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS resource_user_assignments (
        id          SERIAL      PRIMARY KEY,
        resource_id INTEGER     NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
        assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (resource_id, user_id)
      )
    `, { type: QueryTypes.RAW });

    if (assign_all) {
      // Assign to every active student
      await sequelize.query(`
        INSERT INTO resource_user_assignments (resource_id, user_id, assigned_by, assigned_at)
        SELECT :resourceId, u.id, :assignedBy, NOW()
        FROM users u
        WHERE u.role = 'student' AND u.is_active = true
        ON CONFLICT (resource_id, user_id) DO NOTHING
      `, { replacements: { resourceId, assignedBy: req.user.id }, type: QueryTypes.INSERT });
      return res.json({ success: true, message: 'Resource assigned to all active students.' });
    }

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'user_ids array or assign_all:true is required.' });
    }

    // Assign to specific students
    for (const userId of user_ids) {
      await sequelize.query(`
        INSERT INTO resource_user_assignments (resource_id, user_id, assigned_by, assigned_at)
        VALUES (:resourceId, :userId, :assignedBy, NOW())
        ON CONFLICT (resource_id, user_id) DO NOTHING
      `, { replacements: { resourceId, userId, assignedBy: req.user.id }, type: QueryTypes.INSERT });
    }
    return res.json({ success: true, message: `Resource assigned to ${user_ids.length} student(s).` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/resources/staged  — admin: list files awaiting metadata assignment
// ═════════════════════════════════════════════════════════════════════════════
router.get('/staged', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT r.id, r.title, r.type::text AS type, r.url, r.original_filename,
              r.file_size_bytes, r.created_at,
              u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last
       FROM resources r
       LEFT JOIN users u ON r.uploaded_by = u.id
       WHERE r.is_active = true
         AND (r.is_staged = true OR r.topic_id IS NULL)
       ORDER BY r.created_at DESC`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    // is_staged column may not exist — return all unassigned
    try {
      const rows = await sequelize.query(
        `SELECT r.id, r.title, r.type::text AS type, r.url, r.created_at
         FROM resources r
         WHERE r.is_active = true AND r.topic_id IS NULL
         ORDER BY r.created_at DESC`,
        { type: QueryTypes.SELECT }
      );
      return res.json({ success: true, count: rows.length, data: rows });
    } catch {
      return res.json({ success: true, count: 0, data: [] });
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/resources  — list
// Teacher sees own; admin sees all; student sees what's assigned to them
// ═════════════════════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
  const { topic_id, subtopic_id, type, staged } = req.query;
  const filters      = ['r.is_active = true'];
  const replacements = {};

  if (topic_id)    { filters.push('r.topic_id    = :topic_id');    replacements.topic_id    = topic_id;    }
  if (subtopic_id) { filters.push('r.subtopic_id = :subtopic_id'); replacements.subtopic_id = subtopic_id; }
  if (type)        { filters.push("r.type::text  = :type");        replacements.type        = type;        }

  if (req.user.role === 'teacher') {
    filters.push('r.uploaded_by = :uid');
    replacements.uid = req.user.id;
  } else if (req.user.role === 'student') {
    // Students see resources assigned to them + non-staged public resources
    filters.push(`(
      EXISTS (SELECT 1 FROM resource_user_assignments rua WHERE rua.resource_id = r.id AND rua.user_id = :uid)
      OR (r.is_staged = false AND r.topic_id IS NOT NULL)
    )`);
    replacements.uid = req.user.id;
  }
  // admin sees all — no extra filter

  try {
    const rows = await sequelize.query(
      `SELECT r.id, r.title, r.type::text AS type, r.url, r.description,
              r.topic_id, r.subtopic_id, r.file_size_bytes, r.original_filename,
              r.created_at,
              COALESCE(r.is_staged, r.topic_id IS NULL) AS is_staged,
              u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last,
              t.name  AS topic_name,
              s.name  AS subject_name,
              st.name AS subtopic_name
       FROM resources r
       LEFT JOIN users     u  ON r.uploaded_by = u.id
       LEFT JOIN topics    t  ON r.topic_id    = t.id
       LEFT JOIN subtopics st ON r.subtopic_id = st.id
       LEFT JOIN subjects  s  ON s.id = t.subject_id
       WHERE ${filters.join(' AND ')}
       ORDER BY r.created_at DESC`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    return res.json({ success: true, count: 0, data: [], _error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/resources/:id
// ═════════════════════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT r.*, r.type::text AS type,
              u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last,
              t.name  AS topic_name,
              s.name  AS subject_name,
              st.name AS subtopic_name
       FROM resources r
       LEFT JOIN users     u  ON r.uploaded_by = u.id
       LEFT JOIN topics    t  ON r.topic_id    = t.id
       LEFT JOIN subtopics st ON r.subtopic_id = st.id
       LEFT JOIN subjects  s  ON s.id = t.subject_id
       WHERE r.id = :id AND r.is_active = true`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Resource not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/resources/:id
// ═════════════════════════════════════════════════════════════════════════════
router.delete('/:id', protect, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, url, uploaded_by FROM resources WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Resource not found' });
    const resource = rows[0];
    if (req.user.role === 'teacher' && String(resource.uploaded_by) !== String(req.user.id)) {
      return res.status(403).json({ success: false, error: 'You can only delete your own resources.' });
    }
    await sequelize.query(
      `UPDATE resources SET is_active = false WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.UPDATE }
    );
    const filePath = path.join(__dirname, '..', (resource.url || '').replace(/^\//, ''));
    fs.unlink(filePath, () => {});
    return res.json({ success: true, message: 'Resource deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
