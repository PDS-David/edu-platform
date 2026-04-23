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
   ENSURE resource_assignments TABLE
   (uses INTEGER resource_id to match resources.id SERIAL)
================================ */

let raEnsured = false;
async function ensureResourceAssignments() {
  if (raEnsured) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS resource_assignments (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_id  INTEGER     NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      assigned_by  UUID        NOT NULL REFERENCES users(id),
      student_id   UUID        REFERENCES users(id)  ON DELETE CASCADE,
      class_id     UUID        REFERENCES classes(id) ON DELETE CASCADE,
      push_type    VARCHAR(50) NOT NULL DEFAULT 'learning_material',
      assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ra_must_have_target CHECK (student_id IS NOT NULL OR class_id IS NOT NULL)
    )
  `).catch(() => {});
  // Add UNIQUE constraints so ON CONFLICT DO NOTHING actually deduplicates
  await sequelize.query(`
    ALTER TABLE resource_assignments
      ADD CONSTRAINT IF NOT EXISTS ra_uniq_student
        UNIQUE (resource_id, student_id, push_type)
  `).catch(() => {});
  await sequelize.query(`
    ALTER TABLE resource_assignments
      ADD CONSTRAINT IF NOT EXISTS ra_uniq_class
        UNIQUE (resource_id, class_id, push_type)
  `).catch(() => {});
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_ra_student ON resource_assignments(student_id)`).catch(() => {});
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_ra_class   ON resource_assignments(class_id)`).catch(() => {});
  // Gap 4 & 6: UNIQUE constraints required for ON CONFLICT DO NOTHING to work.
  // Without these, every push() call inserts a duplicate row and the conflict
  // clause is a silent no-op. ALTER TABLE … ADD CONSTRAINT IF NOT EXISTS is
  // idempotent — safe to run on every cold start against an existing table.
  await sequelize.query(`
    ALTER TABLE resource_assignments
      ADD CONSTRAINT IF NOT EXISTS uq_ra_student
      UNIQUE (resource_id, student_id, push_type)
  `).catch(() => {});
  await sequelize.query(`
    ALTER TABLE resource_assignments
      ADD CONSTRAINT IF NOT EXISTS uq_ra_class
      UNIQUE (resource_id, class_id, push_type)
  `).catch(() => {});
  raEnsured = true;
}

/* ================================
   GET RESOURCES  (teacher — own uploads only)
================================ */

router.get('/', protect, async (req, res) => {
  await ensureExtraColumns();
  const { subtopic_id, topic_id, subject_id } = req.query;
  const role = req.user.role;

  try {
    if (role === 'student') {
      // Students see resources assigned to them OR publicly attached to this subtopic/topic
      const filters = [`COALESCE(r.is_active, true) = true`, `COALESCE(r.is_staged, false) = false`];
      const replacements = { studentId: req.user.id };

      if (subtopic_id) {
        filters.push('r.subtopic_id = :subtopic_id');
        replacements.subtopic_id = parseInt(subtopic_id);
      } else if (topic_id) {
        filters.push('r.topic_id = :topic_id');
        replacements.topic_id = parseInt(topic_id);
      } else if (subject_id) {
        filters.push('(t.subject_id = :subject_id OR s.id = :subject_id)');
        replacements.subject_id = subject_id;
      } else {
        // No filter — return all resources assigned to this student
        filters.push(`EXISTS (
          SELECT 1 FROM resource_assignments ra
          WHERE ra.resource_id = r.id AND ra.student_id = :studentId
        )`);
      }

      const rows = await sequelize.query(`
        SELECT DISTINCT r.id, r.title, r.file_url, r.resource_type AS type,
               r.resource_type, r.file_size_bytes, r.original_filename,
               r.subtopic_id, r.topic_id, r.created_at,
               s.name AS subject_name, st.name AS subtopic_name
        FROM resources r
        LEFT JOIN subtopics st ON st.id = r.subtopic_id
        LEFT JOIN topics     t  ON t.id  = COALESCE(r.topic_id, st.topic_id)
        LEFT JOIN subjects   s  ON s.id  = t.subject_id
        WHERE ${filters.join(' AND ')}
        ORDER BY r.created_at DESC
      `, { replacements, type: QueryTypes.SELECT });

      return res.json({ success: true, data: rows });
    }

    // Teachers see only their own uploads; admins see all
    const isAdmin = role === 'admin';
    const rows = await sequelize.query(`
      SELECT r.id, r.title, r.file_url, r.resource_type AS type, r.resource_type,
             r.file_size_bytes, r.original_filename, r.is_staged, r.push_type,
             r.created_at, r.uploaded_by,
             s.name  AS subject_name,
             st.name AS subtopic_name
      FROM resources r
      LEFT JOIN subtopics st ON st.id = r.subtopic_id
      LEFT JOIN topics     t  ON t.id  = st.topic_id
      LEFT JOIN subjects   s  ON s.id  = t.subject_id
      WHERE COALESCE(r.is_active, true) = true
        AND (:isAdmin OR r.uploaded_by = :userId)
      ORDER BY r.created_at DESC
    `, {
      replacements: { isAdmin, userId: req.user.id },
      type: QueryTypes.SELECT,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

/* ================================
   GET /staged  — staged files awaiting metadata assignment
================================ */

router.get('/staged', protect, authorize('admin', 'teacher'), async (req, res) => {
  await ensureExtraColumns();
  try {
    const isAdmin = req.user.role === 'admin';
    const rows = await sequelize.query(`
      SELECT r.id, r.title, r.resource_type AS type, r.resource_type,
             r.file_url, r.file_size_bytes, r.original_filename,
             r.is_staged, r.push_type, r.created_at
      FROM resources r
      WHERE COALESCE(r.is_staged, false) = true
        AND COALESCE(r.is_active, true) = true
        AND (:isAdmin OR r.uploaded_by = :userId)
      ORDER BY r.created_at DESC
    `, {
      replacements: { isAdmin, userId: req.user.id },
      type: QueryTypes.SELECT,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

/* ================================
   GET /my-assignments  — student: resources pushed to them
================================ */

router.get('/my-assignments', protect, async (req, res) => {
  await ensureExtraColumns();
  await ensureResourceAssignments();
  try {
    const studentId = req.user.id;

    // Direct student assignments + class-based assignments
    const rows = await sequelize.query(`
      SELECT DISTINCT ON (r.id, ra.push_type)
             r.id, r.title, r.file_url, r.resource_type AS type, r.resource_type,
             r.file_size_bytes, r.original_filename,
             ra.push_type, ra.assigned_at,
             u.first_name || ' ' || u.last_name AS assigned_by_name,
             s.name AS subject_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      LEFT JOIN users    u ON u.id = ra.assigned_by
      LEFT JOIN subtopics st ON st.id = r.subtopic_id
      LEFT JOIN topics     t  ON t.id  = st.topic_id
      LEFT JOIN subjects   s  ON s.id  = t.subject_id
      WHERE COALESCE(r.is_active, true) = true
        AND (
          ra.student_id = :studentId
          OR ra.class_id IN (
            SELECT class_id FROM class_memberships WHERE student_id = :studentId
          )
        )
      ORDER BY r.id, ra.push_type, ra.assigned_at DESC
    `, {
      replacements: { studentId },
      type: QueryTypes.SELECT,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /resources/my-assignments]', err.message);
    return res.json({ success: true, data: [] });
  }
});

/* ================================
   PUT /:id/assign-meta
   Update title / topic / subtopic / subject, mark is_staged = false
================================ */

router.put('/:id/assign-meta', protect, authorize('admin', 'teacher'), async (req, res) => {
  await ensureExtraColumns();
  const resourceId = parseInt(req.params.id);
  if (!resourceId) return res.status(400).json({ success: false, error: 'Invalid resource id' });

  const { title, topic_id, subtopic_id, subject_id, push_type } = req.body;

  try {
    // Only owner or admin may update
    const existing = await sequelize.query(
      `SELECT id, uploaded_by FROM resources WHERE id = :id`,
      { replacements: { id: resourceId }, type: QueryTypes.SELECT }
    );
    if (!existing.length) return res.status(404).json({ success: false, error: 'Resource not found' });
    if (req.user.role !== 'admin' && existing[0].uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await sequelize.query(`
      UPDATE resources SET
        title       = COALESCE(NULLIF(:title, ''), title),
        topic_id    = COALESCE(:topicId::integer,    topic_id),
        subtopic_id = COALESCE(:subtopicId::integer, subtopic_id),
        push_type   = COALESCE(NULLIF(:pushType, ''), push_type),
        is_staged   = false,
        updated_at  = NOW()
      WHERE id = :id
    `, {
      replacements: {
        id:         resourceId,
        title:      title        || '',
        topicId:    topic_id     ? parseInt(topic_id)    : null,
        subtopicId: subtopic_id  ? parseInt(subtopic_id) : null,
        pushType:   push_type    || '',
      },
      type: QueryTypes.UPDATE,
    });

    return res.json({ success: true, message: 'Metadata saved.' });
  } catch (err) {
    console.error('[PUT /resources/:id/assign-meta]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   PUT /:id/assign-users
   Push resource to students and/or classes with a push_type
================================ */

router.put('/:id/assign-users', protect, authorize('admin', 'teacher'), async (req, res) => {
  await ensureResourceAssignments();
  const resourceId = parseInt(req.params.id);
  if (!resourceId) return res.status(400).json({ success: false, error: 'Invalid resource id' });

  const {
    user_ids    = [],
    assign_all  = false,
    class_ids   = [],
    push_type   = 'learning_material',
  } = req.body;

  try {
    let targetStudentIds = user_ids;

    // Expand assign_all → every active student
    if (assign_all) {
      const students = await sequelize.query(
        `SELECT id FROM users WHERE role = 'student' AND is_active = true`,
        { type: QueryTypes.SELECT }
      );
      targetStudentIds = students.map(s => s.id);
    }

    // Expand class_ids → their member student ids
    if (class_ids.length > 0) {
      const classMembers = await sequelize.query(
        `SELECT student_id FROM class_memberships WHERE class_id = ANY(:classIds::uuid[])`,
        { replacements: { classIds: class_ids }, type: QueryTypes.SELECT }
      );
      const memberIds = classMembers.map(m => m.student_id);
      targetStudentIds = [...new Set([...targetStudentIds, ...memberIds])];
    }

    let studentRows = 0;
    // Insert per-student rows
    for (const sid of targetStudentIds) {
      await sequelize.query(`
        INSERT INTO resource_assignments (resource_id, assigned_by, student_id, push_type)
        VALUES (:rid, :by, :sid, :pt)
        ON CONFLICT DO NOTHING
      `, {
        replacements: { rid: resourceId, by: req.user.id, sid, pt: push_type },
        type: QueryTypes.INSERT,
      }).catch(() => {});
      studentRows++;
    }

    // Insert per-class rows (for class-wide visibility)
    let classRows = 0;
    for (const cid of class_ids) {
      await sequelize.query(`
        INSERT INTO resource_assignments (resource_id, assigned_by, class_id, push_type)
        VALUES (:rid, :by, :cid, :pt)
        ON CONFLICT DO NOTHING
      `, {
        replacements: { rid: resourceId, by: req.user.id, cid, pt: push_type },
        type: QueryTypes.INSERT,
      }).catch(() => {});
      classRows++;
    }

    return res.json({
      success: true,
      message: `Pushed to ${studentRows} student(s) and ${classRows} class(es).`,
      student_count: studentRows,
      class_count:   classRows,
    });
  } catch (err) {
    console.error('[PUT /resources/:id/assign-users]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   DELETE /:id  — soft delete
================================ */

router.delete('/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  const resourceId = parseInt(req.params.id);
  if (!resourceId) return res.status(400).json({ success: false, error: 'Invalid resource id' });
  try {
    const existing = await sequelize.query(
      `SELECT id, uploaded_by FROM resources WHERE id = :id`,
      { replacements: { id: resourceId }, type: QueryTypes.SELECT }
    );
    if (!existing.length) return res.status(404).json({ success: false, error: 'Not found' });
    if (req.user.role !== 'admin' && existing[0].uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await sequelize.query(
      `UPDATE resources SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: resourceId }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Resource deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
