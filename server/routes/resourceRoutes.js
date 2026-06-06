'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');

const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const r2 = require('../utils/r2Storage');
const { getSignedDownloadUrl } = r2;

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

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  }
});

// When R2 is configured, hold the file in memory just long enough to push
// it to object storage. Otherwise persist to local disk like before.
const upload = multer({
  storage: r2.isR2Enabled() ? multer.memoryStorage() : diskStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    // Block high-risk web-executable types that would be dangerous to serve from /uploads.
    const blocked = new Set([
      'text/html',
      'application/javascript',
      'text/javascript',
      'image/svg+xml',
    ]);
    if (blocked.has(file.mimetype)) return cb(new Error('File type not allowed'));
    cb(null, true);
  }
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
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    // Distinguishes downloadable material from a file whose questions should
    // be extracted by AI and surfaced as quiz/practice questions to students.
    // Values: 'learning_material' | 'question_bank'
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_kind VARCHAR(32) DEFAULT 'learning_material'`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS questions_extracted_at TIMESTAMPTZ`,
    // push_type is used to categorise how a resource is delivered to students
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS push_type VARCHAR(50) DEFAULT 'learning_material'`
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
    // ── MIGRATION: If resource_assignments.resource_id is INTEGER (wrong type
    // from manual Supabase creation), drop and recreate both tables with UUID.
    // This is safe because no real data is in them yet at this stage.
    try {
      const [cols] = await sequelize.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_name = 'resource_assignments'
            AND column_name = 'resource_id'`,
        { type: QueryTypes.SELECT }
      );
      if (cols && cols.data_type && cols.data_type.toLowerCase().includes('int')) {
        console.log('[ensureResourceAssignments] Detected INTEGER resource_id — migrating to UUID...');
        await sequelize.query(`DROP TABLE IF EXISTS resource_user_assignments CASCADE`);
        await sequelize.query(`DROP TABLE IF EXISTS resource_assignments CASCADE`);
        console.log('[ensureResourceAssignments] Dropped old tables, recreating with UUID...');
      }
    } catch (migErr) {
      console.warn('[ensureResourceAssignments migration check]', migErr.message);
    }

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS resource_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
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

    // resource_user_assignments — individual user-level assignments
    // (used alongside resource_assignments for direct per-user pushes)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS resource_user_assignments (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        resource_id UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
        assigned_by UUID        REFERENCES users(id),
        push_type   VARCHAR(50) DEFAULT 'learning_material',
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_rua_resource_user UNIQUE (resource_id, user_id, push_type)
      );
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_rua_user_id     ON resource_user_assignments(user_id);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_rua_resource_id ON resource_user_assignments(resource_id);
    `);
    raEnsured = true;
  } catch (err) {
    console.error('[ensureResourceAssignments]', err.message);
    // Do NOT set raEnsured = true on failure — allow retry on next request
    // so transient DB errors (e.g. FK type mismatch mid-migration) self-heal
    // once the migration completes.
  }
}

/* ================================
   HEALTH CHECK
   ================================ */

router.get('/health', (_req, res) => {
  res.json({ success: true });
});

/* ================================
   R2 PROXY  (GET /api/resources/r2/*)
   Streams a file from Cloudflare R2 when the bucket is private or when
   R2_PUBLIC_BASE_URL isn't configured.
   ================================ */
router.get('/r2/*', protect, async (req, res) => {
  try {
    const keyRaw = req.params[0] || '';
    const key = decodeURIComponent(keyRaw);
    if (!key || !key.startsWith('resources/')) {
      return res.status(400).json({ success: false, error: 'Invalid R2 key' });
    }
    if (!r2.isR2Enabled()) {
      return res.status(503).json({ success: false, error: 'R2 is not configured' });
    }

    const obj = await r2.getObjectByKey(key);
    res.setHeader('Content-Type', obj.contentType || 'application/octet-stream');
    if (obj.contentLength) res.setHeader('Content-Length', String(obj.contentLength));
    if (obj.cacheControl) res.setHeader('Cache-Control', obj.cacheControl);
    if (obj.etag) res.setHeader('ETag', obj.etag);
    // Allow inline viewing in iframes (PDF/Office viewers).
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');

    if (obj.contentDisposition) res.setHeader('Content-Disposition', obj.contentDisposition);

    // obj.body is a stream from AWS SDK
    return obj.body.pipe(res);
  } catch (err) {
    console.error('[r2 proxy]', err.message);
    return res.status(404).json({ success: false, error: 'File not found' });
  }
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

      // Storage mode: if Cloudflare R2 env vars are present, push to R2.
      // Otherwise fall back to local disk. Local disk is acceptable on
      // Hetzner (persistent volumes) or any server with stable storage.
      // Set ALLOW_LOCAL_UPLOADS=true on Render ONLY if you have mounted a
      // persistent disk at /uploads — otherwise files will vanish on redeploy.
      const isProd = process.env.NODE_ENV === 'production';
      const allowLocal = process.env.ALLOW_LOCAL_UPLOADS !== 'false'; // default: allow
      if (isProd && !allowLocal && !r2.isR2Enabled()) {
        return res.status(503).json({
          success: false,
          error:
            'File uploads are disabled. ' +
            'Configure Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) ' +
            'or set ALLOW_LOCAL_UPLOADS=false to explicitly disable local fallback.'
        });
      }

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
          let fileUrl;
          let r2Key = null;
          if (r2.isR2Enabled()) {
            // Memory storage → push buffer to Cloudflare R2
            const { url, key } = await r2.uploadBuffer({
              buffer: f.buffer,
              originalname: f.originalname,
              mimetype: f.mimetype,
            });
            fileUrl = url;
            r2Key = key;
          } else {
            // Local disk fallback (Render ephemeral)
            fileUrl = `/uploads/resources/${path.basename(f.path)}`;
          }
          const title = path.parse(f.originalname).name || f.originalname;
          const resourceType = guessResourceType(f.originalname);

          // sequelize.query without QueryTypes returns [rows, meta]
          const [rows] = await sequelize.query(
            `INSERT INTO resources
               (title, resource_type, file_url, r2_key, file_size_bytes,
                original_filename, mime_type, is_staged, is_active,
                uploaded_by, created_at, updated_at)
             VALUES
               (:title, :rtype, :fileUrl, :r2Key, :size,
                :origName, :mime, true, true,
                :uploadedBy, NOW(), NOW())
             RETURNING id, title, resource_type, file_url, r2_key,
                       file_size_bytes, original_filename, mime_type,
                       is_staged, is_active, created_at`,
            {
              replacements: {
                title,
                rtype: resourceType,
                fileUrl,
                r2Key: r2Key || null,
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

router.get('/staged', authorize('admin', 'teacher'), async (_req, res) => {
  try {
    await ensureExtraColumns();

    const rows = await sequelize.query(
      `SELECT id, title, resource_type, file_url, file_size_bytes,
              original_filename, mime_type, is_staged, is_active,
              content_kind, questions_extracted_at,
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
    await ensureResourceAssignments();

    const { q, subject_id, topic_id, subtopic_id } = req.query;
    const role = req.user?.role;
    const replacements = { user_id: req.user?.id || null };

    let where = `WHERE r.is_active = true AND (r.is_staged = false OR r.is_staged IS NULL)`;

    if (q && String(q).trim())     { where += ` AND r.title ILIKE :q`;            replacements.q          = `%${String(q).trim()}%`; }
    if (subject_id  && /^\d+$/.test(subject_id))   { where += ` AND r.subject_id  = :subject_id`;   replacements.subject_id  = parseInt(subject_id,  10); }
    if (topic_id    && /^\d+$/.test(topic_id))     { where += ` AND r.topic_id    = :topic_id`;     replacements.topic_id    = parseInt(topic_id,    10); }
    if (subtopic_id && /^\d+$/.test(subtopic_id))  { where += ` AND r.subtopic_id = :subtopic_id`;  replacements.subtopic_id = parseInt(subtopic_id, 10); }

    // Students see ONLY resources assigned to them (directly, or via a class they belong to).
    // Admins/teachers see everything.
    if (role === 'student') {
      where += `
        AND (
          EXISTS (SELECT 1 FROM resource_assignments      ra WHERE ra.resource_id = r.id AND ra.student_id = :user_id)
          OR EXISTS (SELECT 1 FROM resource_user_assignments rua WHERE rua.resource_id = r.id AND rua.user_id   = :user_id)
          OR EXISTS (
            SELECT 1
              FROM resource_assignments ra
              JOIN class_memberships cm ON cm.class_id = ra.class_id
             WHERE ra.resource_id = r.id AND cm.student_id = :user_id
          )
        )`;
    }

    const rows = await sequelize.query(
      `SELECT r.id, r.title, r.resource_type, r.file_url, r.file_size_bytes,
              r.original_filename, r.mime_type, r.is_staged, r.is_active,
              r.uploaded_by, r.subject_id, r.topic_id, r.subtopic_id, r.push_type,
              r.content_kind, r.questions_extracted_at,
              r.created_at, r.updated_at,
              s.name AS subject_name, t.name AS topic_name, st.name AS subtopic_name
         FROM resources r
         LEFT JOIN subjects  s ON s.id = r.subject_id
         LEFT JOIN topics    t ON t.id = r.topic_id
         LEFT JOIN subtopics st ON st.id = r.subtopic_id
         ${where}
        ORDER BY r.created_at DESC
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
   MY ASSIGNMENTS  (GET /api/resources/my-assignments)
   Returns every resource that has been pushed to the current user,
   either individually, by direct student assignment, or via a class.
   ================================ */
router.get('/my-assignments', async (req, res) => {
  try {
    await ensureExtraColumns();
    await ensureResourceAssignments();

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const rows = await sequelize.query(
      `SELECT DISTINCT
              r.id, r.title, r.resource_type, r.file_url, r.file_size_bytes,
              r.original_filename, r.mime_type, r.push_type,
              r.subject_id, r.topic_id, r.subtopic_id,
              r.created_at, r.updated_at,
              s.name  AS subject_name,
              t.name  AS topic_name,
              st.name AS subtopic_name,
              -- Retrieve the display name of whoever assigned this resource.
              -- A resource can reach a student via three paths; we take the first
              -- non-null assigned_by found across all three using a lateral subquery.
              TRIM(
                COALESCE(ab.first_name, '') || ' ' || COALESCE(ab.last_name, '')
              ) AS assigned_by_name
         FROM resources r
         LEFT JOIN subjects  s  ON s.id  = r.subject_id
         LEFT JOIN topics    t  ON t.id  = r.topic_id
         LEFT JOIN subtopics st ON st.id = r.subtopic_id
         -- Subquery: find the assigner UUID from whichever assignment path
         -- delivered this resource to :uid, then join to users for the name.
         LEFT JOIN LATERAL (
           SELECT assigned_by
             FROM (
               -- Path A: direct student assignment
               SELECT assigned_by
                 FROM resource_assignments
                WHERE resource_id = r.id AND student_id = :uid
               UNION ALL
               -- Path B: individual user assignment
               SELECT assigned_by
                 FROM resource_user_assignments
                WHERE resource_id = r.id AND user_id = :uid
               UNION ALL
               -- Path C: class-based assignment
               SELECT ra.assigned_by
                 FROM resource_assignments ra
                 JOIN class_memberships cm ON cm.class_id = ra.class_id
                WHERE ra.resource_id = r.id AND cm.student_id = :uid
             ) _ab
            WHERE assigned_by IS NOT NULL
            LIMIT 1
         ) assigner ON true
         LEFT JOIN users ab ON ab.id = assigner.assigned_by
        WHERE r.is_active = true
          AND (r.is_staged = false OR r.is_staged IS NULL)
          AND (
            EXISTS (SELECT 1 FROM resource_assignments      ra  WHERE ra.resource_id  = r.id AND ra.student_id = :uid)
            OR EXISTS (SELECT 1 FROM resource_user_assignments rua WHERE rua.resource_id = r.id AND rua.user_id   = :uid)
            OR EXISTS (
              SELECT 1
                FROM resource_assignments ra
                JOIN class_memberships cm ON cm.class_id = ra.class_id
               WHERE ra.resource_id = r.id AND cm.student_id = :uid
            )
          )
        ORDER BY r.created_at DESC
        LIMIT 1000`,
      { replacements: { uid: userId }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error('[my-assignments]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   ASSIGN METADATA  (PUT /api/resources/:id/assign-meta)
   Saves Exam Type / Subject / Topic / Subtopic on a staged file
   and marks it as published (is_staged = false) so it appears in
   the Resource Library.
   ================================ */

router.put(
  '/:id/assign-meta',
  authorize('admin', 'teacher'),
  async (req, res) => {
    try {
      await ensureExtraColumns();

      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Invalid resource id' });
      }

      const {
        title,
        topic_id = null,
        subtopic_id = null,
        subject_id = null,
        push_type = 'learning_material',
        content_kind = 'learning_material'
      } = req.body || {};

      // At least one of subject/topic must be present, per the UI contract.
      if (!subject_id && !topic_id) {
        return res.status(400).json({
          success: false,
          error: 'Please provide at least a subject_id or topic_id.'
        });
      }

      const safeKind = content_kind === 'question_bank' ? 'question_bank' : 'learning_material';

      const [rows] = await sequelize.query(
        `UPDATE resources
            SET title        = COALESCE(:title, title),
                subject_id   = COALESCE(:subject_id::int,  subject_id),
                topic_id     = COALESCE(:topic_id::int,    topic_id),
                subtopic_id  = COALESCE(:subtopic_id::int, subtopic_id),
                push_type    = COALESCE(:push_type, push_type),
                content_kind = :content_kind,
                is_staged    = false,
                updated_at   = NOW()
          WHERE id = :id
          RETURNING id, title, resource_type, subject_id, topic_id, subtopic_id,
                    push_type, content_kind, is_staged, is_active, file_url,
                    created_at, updated_at`,
        {
          replacements: {
            id,
            title: title && String(title).trim() ? String(title).trim() : null,
            subject_id: subject_id || null,
            topic_id: topic_id || null,
            subtopic_id: subtopic_id || null,
            push_type,
            content_kind: safeKind
          }
        }
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Resource not found' });
      }

      // Question Bank kind → fire-and-forget AI extraction. Generated questions
      // land in `questions` with status='pending' so they show up in the
      // existing teacher/admin question-review queue before going live.
      if (safeKind === 'question_bank') {
        try {
          const extractor = require('../services/resourceQuestionExtractor');
          extractor.extractFromResource(rows[0], req.user?.id)
            .then((info) => {
              console.log('[assign-meta] question extraction complete', info);
            })
            .catch((e) => {
              console.error('[assign-meta] extraction failed', e.message);
            });
        } catch (e) {
          console.error('[assign-meta] extractor unavailable', e.message);
        }
      }

      return res.json({
        success: true,
        data: rows[0],
        resource: rows[0],
        extraction_queued: safeKind === 'question_bank'
      });
    } catch (err) {
      console.error('[assign-meta]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);


/* ================================
   AUTHENTICATED DOWNLOAD  (GET /api/resources/:id/download)
   Generates a 60-second signed R2 URL and redirects to it.
   Students may only download resources assigned to them.
   Teachers and admins may download any resource.
   ================================ */

router.get('/:id/download', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const role    = req.user.role;
    const userId  = req.user.id;

    // ── 1. Fetch resource ───────────────────────────────────────────────
    const rows = await sequelize.query(
      `SELECT id, title, file_url, r2_key, mime_type, original_filename, is_active
         FROM resources WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    const resource = rows[0];

    // ── 2. Enforce visibility for students ─────────────────────────────
    if (role === 'student') {
      const access = await sequelize.query(
        `SELECT 1 FROM resources r
          WHERE r.id = :id
            AND (
              EXISTS (SELECT 1 FROM resource_assignments ra
                       WHERE ra.resource_id = r.id AND ra.student_id = :uid)
              OR EXISTS (SELECT 1 FROM resource_user_assignments rua
                          WHERE rua.resource_id = r.id AND rua.user_id = :uid)
              OR EXISTS (
                SELECT 1 FROM resource_assignments ra
                  JOIN class_memberships cm ON cm.class_id = ra.class_id
                 WHERE ra.resource_id = r.id AND cm.student_id = :uid
              )
            )
          LIMIT 1`,
        { replacements: { id, uid: userId }, type: QueryTypes.SELECT }
      );

      if (!access.length) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    // ── 3. Resolve the R2 object key ───────────────────────────────────
    let key = resource.r2_key || null;

    // Back-fill from file_url if r2_key not yet populated
    if (!key && resource.file_url) {
      const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
      if (base && resource.file_url.startsWith(base + '/')) {
        key = resource.file_url.slice(base.length + 1);
      } else if (resource.file_url.startsWith('/api/resources/r2/')) {
        try { key = decodeURIComponent(resource.file_url.slice('/api/resources/r2/'.length)); }
        catch { key = resource.file_url.slice('/api/resources/r2/'.length); }
      } else {
        // Match anything that looks like resources/<filename>
        const m = resource.file_url.match(/\/(resources\/[^?#]+)/);
        if (m) key = m[1];
      }
    }

    // ── 4. Serve the file ──────────────────────────────────────────────
    if (key && r2.isR2Enabled()) {
      // R2 path: generate a 60-second signed URL
      const signedUrl = await getSignedDownloadUrl(key, 60);
      return res.redirect(302, signedUrl);
    }

    // Local disk fallback: file_url is a relative /uploads/... path
    if (resource.file_url && !resource.file_url.startsWith('http')) {
      return res.redirect(302, resource.file_url);
    }

    return res.status(502).json({ success: false, error: 'File storage not configured' });
  } catch (err) {
    console.error('[GET /resources/:id/download]', err.message);
    return res.status(500).json({ success: false, error: 'Download failed' });
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

      if (!rows[0]) {
        return res.status(404).json({ success: false, error: 'Resource not found' });
      }

      // Clean up dependent rows first to avoid FK violations
      await sequelize.query(
        `DELETE FROM resource_assignments WHERE resource_id = :id`,
        { replacements: { id }, type: QueryTypes.DELETE }
      ).catch(() => {});
      await sequelize.query(
        `DELETE FROM resource_user_assignments WHERE resource_id = :id`,
        { replacements: { id }, type: QueryTypes.DELETE }
      ).catch(() => {});

      await sequelize.query(
        `DELETE FROM resources WHERE id = :id`,
        { replacements: { id }, type: QueryTypes.DELETE }
      );

      if (rows[0].file_url) {
        if (/^https?:\/\//.test(rows[0].file_url)) {
          // Remote (R2) — best-effort delete from bucket
          r2.deleteByUrl(rows[0].file_url).catch(() => {});
        } else {
          const filename = path.basename(rows[0].file_url);
          const full = path.join(UPLOADS_DIR, filename);
          fs.unlink(full, () => { /* ignore */ });
        }
      }

      return res.json({ success: true, id });
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
      // ── Guard: a resource must be fully assigned (out of staging, with at
      // least a subject or topic) before it can be pushed to anyone. This
      // protects against direct API calls bypassing the staging UI.
      const guardRows = await sequelize.query(
        `SELECT id, is_staged, subject_id, topic_id, subtopic_id, title, push_type
           FROM resources
          WHERE id = :rid`,
        { replacements: { rid: resourceId }, type: QueryTypes.SELECT }
      );
      if (!guardRows || guardRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Resource not found' });
      }
      const meta = guardRows[0];
      if (meta.is_staged) {
        return res.status(400).json({
          success: false,
          error: 'This file is still in the staging tray. Assign a subject/topic first, then push it.'
        });
      }
      if (!meta.subject_id && !meta.topic_id && !meta.subtopic_id) {
        return res.status(400).json({
          success: false,
          error: 'This file has no subject or topic assigned yet. Assign curriculum metadata before pushing.'
        });
      }

      // ── 1. Push-type corruption guard ──────────────────────────────────
      // resource.push_type is authoritative. Reject mismatches so callers
      // cannot corrupt the stored classification.
      const resourcePushType = meta.push_type || 'learning_material';
      if (push_type !== resourcePushType) {
        return res.status(400).json({
          success: false,
          error: `push_type mismatch: resource is "${resourcePushType}", request sent "${push_type}". Use the resource's push_type.`
        });
      }

      // ── 2. Teacher subject validation ───────────────────────────────────
      // Teachers may only push resources that belong to a subject they are
      // actively assigned to. Admins bypass this check.
      if (req.user.role === 'teacher') {
        if (!meta.subject_id) {
          return res.status(403).json({
            success: false,
            error: 'This resource has no subject assigned. Only resources with a subject can be pushed by teachers.'
          });
        }
        const teacherSubjectRows = await sequelize.query(
          `SELECT 1 FROM teacher_subjects
            WHERE teacher_id = :tid
              AND subject_id  = :sid
              AND is_active   = true
            LIMIT 1`,
          {
            replacements: { tid: req.user.id, sid: meta.subject_id },
            type: QueryTypes.SELECT
          }
        );
        if (!teacherSubjectRows.length) {
          return res.status(403).json({
            success: false,
            error: 'You are not assigned to the subject of this resource.'
          });
        }
      }

      // ── 3. Collect candidate student IDs ────────────────────────────────
      let candidateIds = [...user_ids];

      if (assign_all) {
        const students = await sequelize.query(
          `SELECT id FROM users WHERE role = 'student' AND is_active = true`,
          { type: QueryTypes.SELECT }
        );
        candidateIds = students.map((s) => s.id);
      }

      if (class_ids.length > 0) {
        const members = await sequelize.query(
          `SELECT student_id FROM class_memberships
            WHERE class_id IN (:classIds)`,
          { replacements: { classIds: class_ids }, type: QueryTypes.SELECT }
        );
        const fromClasses = members.map((m) => m.student_id);
        candidateIds = [...new Set([...candidateIds, ...fromClasses])];
      }

      // ── 4. Student subject eligibility filter ───────────────────────────
      // Only students enrolled in the resource's subject receive assignments.
      // If the resource has no subject_id, all candidates are eligible.
      let eligibleIds = candidateIds;
      if (meta.subject_id && candidateIds.length > 0) {
        const enrolledRows = await sequelize.query(
          `SELECT student_id FROM student_subjects
            WHERE subject_id = :sid
              AND is_active   = true
              AND student_id  IN (:cids)`,
          {
            replacements: { sid: meta.subject_id, cids: candidateIds },
            type: QueryTypes.SELECT
          }
        );
        const enrolledSet = new Set(enrolledRows.map((r) => r.student_id));
        eligibleIds = candidateIds.filter((id) => enrolledSet.has(id));
      }

      // ── 5. Structured log ───────────────────────────────────────────────
      console.log('[assign-users]', JSON.stringify({
        resource_id:        resourceId,
        resource_subject_id: meta.subject_id,
        resource_push_type: resourcePushType,
        teacher_id:         req.user.role === 'teacher' ? req.user.id : null,
        requested_students: candidateIds.length,
        eligible_students:  eligibleIds.length,
        class_ids_count:    class_ids.length,
      }));

      // ── 6. Insert student assignments ───────────────────────────────────
      let insertedStudents = 0;
      for (const sid of eligibleIds) {
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
                by:  req.user.id,
                sid,
                pt:  resourcePushType,
              },
              type: QueryTypes.INSERT
            }
          );
          insertedStudents++;
        } catch (err) {
          console.warn('[assign student]', err.message);
        }
      }

      // ── 7. Insert class assignments ─────────────────────────────────────
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
                by:  req.user.id,
                cid,
                pt:  resourcePushType,
              },
              type: QueryTypes.INSERT
            }
          );
          insertedClasses++;
        } catch (err) {
          console.warn('[assign class]', err.message);
        }
      }

      // ── 8. Final log with assigned count ────────────────────────────────
      console.log('[assign-users]', JSON.stringify({
        resource_id:       resourceId,
        assigned_students: insertedStudents,
        assigned_classes:  insertedClasses,
        skipped_students:  candidateIds.length - eligibleIds.length,
      }));

      // ── 9. Unstage ──────────────────────────────────────────────────────
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
        class_count:   insertedClasses,
        skipped_count: candidateIds.length - eligibleIds.length,
        message:
          insertedStudents || insertedClasses
            ? `Pushed to ${insertedStudents} student(s) and ${insertedClasses} class(es).`
            : 'No new assignments were created (they may already be assigned).'
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
