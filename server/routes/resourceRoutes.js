'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100 MB

/* ================================
   ENSURE EXTRA COLUMNS
================================ */

async function ensureExtraColumns() {
  const alters = [
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_staged   BOOLEAN      DEFAULT false`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_active   BOOLEAN      DEFAULT true`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_free     BOOLEAN      DEFAULT true`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_size   BIGINT`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS mime_type   VARCHAR(120)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS uploaded_by UUID`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ  DEFAULT NOW()`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS subject_id  UUID`,
  ];
  for (const sql of alters) await sequelize.query(sql).catch(() => {});
}

async function ensureAssignmentsTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS resource_user_assignments (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_id UUID NOT NULL,
      user_id     UUID NOT NULL,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(resource_id, user_id)
    )
  `).catch(() => {});
}

/* ================================
   POST /api/resources/bulk-upload
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
    const failed   = [];

    for (const file of req.files) {
      try {
        const ext  = path.extname(file.originalname).toLowerCase();
        const type = ext === '.mp4' || ext === '.mov' || ext === '.webm' ? 'video'
                   : ext === '.mp3' || ext === '.wav' || ext === '.ogg'  ? 'audio'
                   : ext === '.pdf'                                       ? 'pdf'
                   : 'document';

        const fileUrl = `/uploads/resources/${file.filename}`;

        const rows = await sequelize.query(`
          INSERT INTO resources
            (title, file_url, url, resource_type, type, original_filename,
             file_size, mime_type, is_staged, is_active, is_free, uploaded_by, created_at, updated_at)
          VALUES
            (:title, :file_url, :file_url, :type, :type, :original_filename,
             :file_size, :mime_type, true, true, true, :uploaded_by, NOW(), NOW())
          RETURNING id, title, file_url AS url, type, is_staged, original_filename, created_at
        `, {
          replacements: {
            title:             path.basename(file.originalname, ext),
            file_url:          fileUrl,
            type,
            original_filename: file.originalname,
            file_size:         file.size,
            mime_type:         file.mimetype,
            uploaded_by:       req.user.id,
          },
          type: QueryTypes.SELECT,
        });

        uploaded.push(rows[0]);
      } catch (err) {
        failed.push({ name: file.originalname, error: err.message });
      }
    }

    return res.json({
      success: true,
      uploaded: uploaded.length,
      failed:   failed.length,
      failures: failed,
      data:     uploaded,
      message:  `${uploaded.length} file(s) uploaded successfully${failed.length ? `, ${failed.length} failed` : ''}.`,
    });
  }
);

/* ================================
   GET /api/resources/staged
================================ */

router.get('/staged', protect, authorize('admin', 'teacher'), async (req, res) => {
  await ensureExtraColumns();
  try {
    const rows = await sequelize.query(`
      SELECT r.id, r.title, r.file_url AS url, r.resource_type AS type, r.type AS type2,
             r.original_filename, r.file_size, r.is_staged, r.created_at,
             t.name AS topic_name, s.name AS subject_name
      FROM resources r
      LEFT JOIN topics   t ON r.topic_id   = t.id
      LEFT JOIN subjects s ON s.id         = t.subject_id
      WHERE COALESCE(r.is_staged, false) = true
        AND COALESCE(r.is_active, true)  = true
      ORDER BY r.created_at DESC
    `, { type: QueryTypes.SELECT });

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    return res.json({ success: true, count: 0, data: [], _error: err.message });
  }
});

/* ================================
   PUT /api/resources/:id/assign-meta
================================ */

router.put('/:id/assign-meta', protect, authorize('admin', 'teacher'), async (req, res) => {
  await ensureExtraColumns();

  const { id }          = req.params;
  const { title, topic_id, subtopic_id, subject_id } = req.body;

  try {
    await sequelize.query(`
      UPDATE resources
      SET title       = COALESCE(:title, title),
          topic_id    = :topic_id,
          subtopic_id = :subtopic_id,
          subject_id  = :subject_id,
          is_staged   = false,
          updated_at  = NOW()
      WHERE id = :id
    `, {
      replacements: { id, title: title || null, topic_id: topic_id || null, subtopic_id: subtopic_id || null, subject_id: subject_id || null },
      type: QueryTypes.UPDATE,
    });

    return res.json({ success: true, message: 'Resource metadata updated' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   PUT /api/resources/:id/assign-users
================================ */

router.put('/:id/assign-users', protect, authorize('admin', 'teacher'), async (req, res) => {
  await ensureAssignmentsTable();

  const { id }                     = req.params;
  const { user_ids, assign_all }   = req.body;

  try {
    if (assign_all) {
      // Assign to every active student
      await sequelize.query(`
        INSERT INTO resource_user_assignments (resource_id, user_id)
        SELECT :resource_id, id FROM users
        WHERE role = 'student' AND COALESCE(is_active, true) = true
        ON CONFLICT (resource_id, user_id) DO NOTHING
      `, { replacements: { resource_id: id }, type: QueryTypes.INSERT });
    } else {
      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(400).json({ success: false, error: 'user_ids must be a non-empty array' });
      }
      for (const uid of user_ids) {
        await sequelize.query(`
          INSERT INTO resource_user_assignments (resource_id, user_id)
          VALUES (:resource_id, :user_id)
          ON CONFLICT (resource_id, user_id) DO NOTHING
        `, { replacements: { resource_id: id, user_id: uid }, type: QueryTypes.INSERT }).catch(() => {});
      }
    }

    return res.json({ success: true, message: 'Resource assigned to users' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   GET /api/resources
================================ */

router.get('/', protect, async (req, res) => {

  await ensureExtraColumns();

  const filters = ['r.is_active = true'];
  const replacements = {};

  if (req.user.role === 'student') {

    filters.push(`
      (
        EXISTS (
          SELECT 1 FROM resource_user_assignments rua
          WHERE rua.resource_id = r.id
          AND rua.user_id = :uid
        )
        OR (
          r.topic_id IS NOT NULL
          AND COALESCE(r.is_staged, false) = false
          AND COALESCE(r.is_free, true) = true
        )
      )
    `);

    replacements.uid = req.user.id;
  }

  try {

    const rows = await sequelize.query(
`
SELECT
  r.id,
  r.title,
  r.file_url,
  r.resource_type,
  r.topic_id,
  r.subtopic_id,
  r.is_staged,
  s.name AS subject_name
FROM resources r
LEFT JOIN topics t ON r.topic_id = t.id
LEFT JOIN subjects s ON s.id = t.subject_id
WHERE ${filters.join(' AND ')}
ORDER BY r.created_at DESC
`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {

    console.error(err);

    return res.json({
      success: true,
      count: 0,
      data: []
    });

  }

});

module.exports = router;


/* ================================
   ENSURE EXTRA COLUMNS
================================ */

async function ensureExtraColumns() {
  const alters = [
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_staged BOOLEAN DEFAULT false`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
  ];

  for (const sql of alters) {
    await sequelize.query(sql).catch(() => {});
  }
}

/* ================================
   GET /api/resources
================================ */

router.get('/', protect, async (req, res) => {

  await ensureExtraColumns();

  const filters = ['r.is_active = true'];
  const replacements = {};

  if (req.user.role === 'student') {

    filters.push(`
      (
        EXISTS (
          SELECT 1 FROM resource_user_assignments rua
          WHERE rua.resource_id = r.id
          AND rua.user_id = :uid
        )
        OR (
          r.topic_id IS NOT NULL
          AND COALESCE(r.is_staged, false) = false
          AND COALESCE(r.is_free, true) = true
        )
      )
    `);

    replacements.uid = req.user.id;
  }

  try {

    const rows = await sequelize.query(
`
SELECT
  r.id,
  r.title,
  r.file_url,
  r.resource_type,
  r.topic_id,
  r.subtopic_id,
  r.is_staged,
  s.name AS subject_name
FROM resources r
LEFT JOIN topics t ON r.topic_id = t.id
LEFT JOIN subjects s ON s.id = t.subject_id
WHERE ${filters.join(' AND ')}
ORDER BY r.created_at DESC
`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {

    console.error(err);

    return res.json({
      success: true,
      count: 0,
      data: []
    });

  }

});

module.exports = router;
