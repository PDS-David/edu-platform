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
   UPLOAD DIRECTORY
   ================================ */

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'resources');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ================================
   MULTER CONFIG
   ================================ */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});

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
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
  ];

  for (const sql of alters) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      console.warn('[ensureExtraColumns]', err.message);
    }
  }

  columnsEnsured = true;
}

/* ================================
   RESOURCE TYPE DETECTOR
   ================================ */

function guessResourceType(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();

  if (['.mp4', '.mov', '.webm', '.avi'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
  if (['.ppt', '.pptx'].includes(ext)) return 'presentation';
  return 'document';
}

/* ================================
   RESOURCE ASSIGNMENT TABLE
   ================================ */

let raEnsured = false;

async function ensureResourceAssignments() {
  if (raEnsured) return;

  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS resource_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        assigned_by UUID NOT NULL REFERENCES users(id),
        student_id UUID REFERENCES users(id) ON DELETE CASCADE,
        class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
        push_type VARCHAR(50) DEFAULT 'learning_material',
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT ra_target_check CHECK (
          student_id IS NOT NULL OR class_id IS NOT NULL
        )
      );
    `);

    // Postgres doesn't support "ADD CONSTRAINT IF NOT EXISTS" universally,
    // so wrap in DO blocks that swallow duplicate errors.
    await sequelize.query(`
      DO $$
      BEGIN
        ALTER TABLE resource_assignments
          ADD CONSTRAINT uq_resource_student
          UNIQUE (resource_id, student_id, push_type);
      EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
      END $$;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        ALTER TABLE resource_assignments
          ADD CONSTRAINT uq_resource_class
          UNIQUE (resource_id, class_id, push_type);
      EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
      END $$;
    `);
  } catch (err) {
    console.error('[ensureResourceAssignments]', err.message);
  }

  raEnsured = true;
}

/* ================================
   HEALTH CHECK
   ================================ */

router.get('/health', (_req, res) => {
  res.json({ success: true });
});

/* ================================
   BULK UPLOAD  (POST /api/resources/bulk-upload)
   Accepts multipart/form-data with field name "files" (or "file").
   Stores each file as a staged resource (is_staged = true).
   ================================ */

router.post(
  '/bulk-upload',
  authorize('admin', 'teacher'),
  upload.any(),
  async (req, res) => {
    try {
      await ensureExtraColumns();

      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded. Use multipart/form-data with a "files" field.'
        });
      }

      const inserted = [];
      const failures = [];

      for (const f of files) {
        try {
          const fileUrl = `/uploads/resources/${path.basename(f.path)}`;
          const title = path.parse(f.originalname).name || f.originalname;
          const resourceType = guessResourceType(f.originalname);

          // sequelize.query without QueryTypes returns [rows, meta]
          const [rows] = await sequelize.query(
            `INSERT INTO resources
               (title, resource_type, file_url, file_size_bytes,
                original_filename, mime_type, is_staged, is_active,
                uploaded_by, created_at, updated_at, uploaded_at)
             VALUES
               (:title, :rtype, :fileUrl, :size,
                :origName, :mime, true, true,
                :uploadedBy, NOW(), NOW(), NOW())
             RETURNING id, title, resource_type, file_url,
                       file_size_bytes, original_filename, mime_type,
                       is_staged, is_active, created_at`,
            {
              replacements: {
                title,
                rtype: resourceType,
                fileUrl,
                size: f.size,
                origName: f.originalname,
                mime: f.mimetype,
                uploadedBy: req.user && req.user.id ? req.user.id : null
              }
            }
          );

          inserted.push(rows[0]);
        } catch (err) {
          console.error('[bulk-upload insert]', err.message);
          failures.push({ filename: f.originalname, error: err.message });
        }
      }

      const message =
        inserted.length === 0
          ? 'Upload failed — no files were saved.'
          : failures.length === 0
            ? `Uploaded ${inserted.length} file(s) successfully.`
            : `Uploaded ${inserted.length} file(s); ${failures.length} failed.`;

      // Frontend reads: result.uploaded, result.failed, result.message, result.failures
      return res.status(inserted.length ? 201 : 500).json({
        success: inserted.length > 0,
        uploaded: inserted.length,
        failed: failures.length,
        message,
        data: inserted,
        failures
      });
    } catch (err) {
      console.error('[bulk-upload]', err);
      return res.status(500).json({
        success: false,
        uploaded: 0,
        failed: req.files ? req.files.length : 0,
        message: err.message || 'Upload failed',
        failures: []
      });
    }
  }
);

/* ================================
   STAGED FILES  (GET /api/resources/staged)
   Returns resources awaiting assignment.
   ================================ */

router.get('/staged', async (_req, res) => {
  try {
    await ensureExtraColumns();

    const rows = await sequelize.query(
      `SELECT id, title, resource_type, file_url, file_size_bytes,
              original_filename, mime_type, is_staged, is_active,
              uploaded_by, created_at, updated_at
         FROM resources
        WHERE is_staged = true
          AND is_active = true
        ORDER BY created_at DESC
        LIMIT 500`,
      { type: QueryTypes.SELECT }
    );

    // Frontend's extract(r) accepts either array or { data: [...] }
    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error('[staged]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   LIST PUBLISHED RESOURCES  (GET /api/resources)
   Powers the "Resource Library" panel.
   ================================ */

router.get('/', async (req, res) => {
  try {
    await ensureExtraColumns();

    const { q } = req.query;
    const replacements = {};
    let where = `WHERE is_active = true AND (is_staged = false OR is_staged IS NULL)`;

    if (q && String(q).trim()) {
      where += ` AND title ILIKE :q`;
      replacements.q = `%${String(q).trim()}%`;
    }

    const rows = await sequelize.query(
      `SELECT id, title, resource_type, file_url, file_size_bytes,
              original_filename, mime_type, is_staged, is_active,
              uploaded_by, created_at, updated_at
         FROM resources
         ${where}
        ORDER BY created_at DESC
        LIMIT 1000`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error('[list resources]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   DELETE STAGED FILE  (DELETE /api/resources/:id)
   ================================ */

router.delete(
  '/:id',
  authorize('admin', 'teacher'),
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }

      // Look up the file path so we can remove it from disk
      const rows = await sequelize.query(
        `SELECT file_url FROM resources WHERE id = :id`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );

      await sequelize.query(
        `DELETE FROM resources WHERE id = :id`,
        { replacements: { id }, type: QueryTypes.DELETE }
      );

      if (rows[0] && rows[0].file_url) {
        const filename = path.basename(rows[0].file_url);
        const full = path.join(UPLOADS_DIR, filename);
        fs.unlink(full, () => { /* ignore */ });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('[delete resource]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ================================
   ASSIGN USERS  (PUT /api/resources/:id/assign-users)
   ================================ */

router.put(
  '/:id/assign-users',
  authorize('admin', 'teacher'),
  async (req, res) => {
    await ensureResourceAssignments();

    const resourceId = req.params.id;
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid resource id'
      });
    }

    const {
      user_ids = [],
      class_ids = [],
      assign_all = false,
      push_type = 'learning_material'
    } = req.body || {};

    try {
      let studentIds = [...user_ids];

      if (assign_all) {
        const students = await sequelize.query(
          `SELECT id FROM users WHERE role='student' AND is_active=true`,
          { type: QueryTypes.SELECT }
        );
        studentIds = students.map((s) => s.id);
      }

      if (class_ids.length > 0) {
        const members = await sequelize.query(
          `SELECT student_id FROM class_memberships
            WHERE class_id = ANY(:classIds)`,
          {
            replacements: { classIds: class_ids },
            type: QueryTypes.SELECT
          }
        );
        const ids = members.map((m) => m.student_id);
        studentIds = [...new Set([...studentIds, ...ids])];
      }

      let insertedStudents = 0;
      for (const sid of studentIds) {
        try {
          await sequelize.query(
            `INSERT INTO resource_assignments
               (resource_id, assigned_by, student_id, push_type)
             VALUES
               (:rid, :by, :sid, :pt)
             ON CONFLICT DO NOTHING`,
            {
              replacements: {
                rid: resourceId,
                by: req.user.id,
                sid,
                pt: push_type
              },
              type: QueryTypes.INSERT
            }
          );
          insertedStudents++;
        } catch (err) {
          console.warn('[assign student]', err.message);
        }
      }

      let insertedClasses = 0;
      for (const cid of class_ids) {
        try {
          await sequelize.query(
            `INSERT INTO resource_assignments
               (resource_id, assigned_by, class_id, push_type)
             VALUES
               (:rid, :by, :cid, :pt)
             ON CONFLICT DO NOTHING`,
            {
              replacements: {
                rid: resourceId,
                by: req.user.id,
                cid,
                pt: push_type
              },
              type: QueryTypes.INSERT
            }
          );
          insertedClasses++;
        } catch (err) {
          console.warn('[assign class]', err.message);
        }
      }

      // After successful assignment, mark resource as no longer staged
      try {
        await sequelize.query(
          `UPDATE resources SET is_staged = false, updated_at = NOW()
            WHERE id = :rid`,
          { replacements: { rid: resourceId }, type: QueryTypes.UPDATE }
        );
      } catch (err) {
        console.warn('[unstage resource]', err.message);
      }

      return res.json({
        success: true,
        student_count: insertedStudents,
        class_count: insertedClasses
      });
    } catch (err) {
      console.error('[assign-users]', err.message);
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

module.exports = router;
