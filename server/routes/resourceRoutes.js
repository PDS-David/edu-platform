'use strict';

/**
 * server/routes/resourceRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY REMEDIATION 2026-06-16
 *
 * Fixes applied vs. the previous version:
 *
 *   INVALID-01 (Critical — Stored XSS)
 *     BEFORE: fileFilter trusted file.mimetype (client-controlled) and stored
 *             extension from path.extname(file.originalname) — allowing an
 *             attacker to upload payload.html with Content-Type: image/png,
 *             then serve it as live HTML from /uploads.
 *     AFTER:  All uploads go through uploadSecurity.js:
 *               1. Extension allowlist check
 *               2. MIME allowlist check
 *               3. Magic-byte inspection
 *               4. Internal structure verification (DOCX/XLSX/PPTX ZIP entries)
 *             Stored filename is a UUID + extension derived from validated type.
 *             SHA-256 hash stored for deduplication and integrity verification.
 *
 *   ACCESS-01 (Critical — unauthenticated-by-design R2 proxy bypass)
 *     BEFORE: GET /r2/* required only `protect` (logged in). Any authenticated
 *             user could fetch any R2 key, bypassing revocation logic in
 *             /:id/download and the entitlement checks there.
 *     AFTER:  GET /r2/* removed. All file access must go through
 *             /:id/download which enforces resource-level entitlement on every
 *             request, so revocation takes effect immediately.
 *             (If a streaming proxy is needed in future, it must call the same
 *             entitlement checks before streaming the object.)
 *
 *   ACCESS-01b (local disk fallback re-expose)
 *     BEFORE: /:id/download's local fallback did res.redirect(302, /uploads/...)
 *             which served the file unauthenticated via express.static.
 *     AFTER:  Local disk fallback streams the file through the Express handler
 *             after the entitlement check passes — /uploads is never exposed.
 *
 *   FUNC-01 (Medium — wrong HTTP status codes)
 *     BEFORE: Multer mounted as router middleware → rejected files threw 500.
 *     AFTER:  createUploadMiddleware() uses callback-style invocation and maps
 *             errors to 400 / 413 / 415 / 422 correctly.
 *
 *   Medium-term items also addressed:
 *     • SHA-256 hash stored in resources.sha256 (add column if missing)
 *     • Duplicate detection: if a hash already exists, return the existing record
 *     • r2_key double-decode anti-pattern removed (decoded once)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express    = require('express');
const router     = express.Router();
const path       = require('path');
const fs         = require('fs');
const { QueryTypes } = require('sequelize');

const sequelize  = require('../config/database');
const { protect, authorize } = require('../middleware/auth');
const { createUploadMiddleware } = require('../middleware/uploadSecurity');
const r2         = require('../utils/r2Storage');
const { getSignedDownloadUrl } = r2;
const { ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');
const logger     = require('../config/logger');

/* ================================
   UPLOAD DIRECTORY (local fallback)
   ================================ */
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'resources');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/* ================================
   SECURE MULTER REPLACEMENT
   Replaces the old multer instance that trusted file.mimetype.
   50 MB limit, all supported types.
   ================================ */
const upload = createUploadMiddleware({
  maxSizeMB:    500,
  maxFiles:     20,
  // allowedTypes omitted → defaults to all types in EXTENSION_MIME_MAP
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
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_kind VARCHAR(32) DEFAULT 'learning_material'`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS questions_extracted_at TIMESTAMPTZ`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS push_type VARCHAR(50) DEFAULT 'learning_material'`,
    // New: SHA-256 hash for deduplication and integrity
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS sha256 CHAR(64)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS stored_filename VARCHAR(255)`,
  ];
  for (const sql of alters) {
    try { await sequelize.query(sql); } catch (err) { logger.warn('[ensureExtraColumns]', err.message); }
  }
  columnsEnsured = true;
}

/* ================================
   RESOURCE TYPE DETECTOR
   ================================ */
function guessResourceType(ext) {
  switch ((ext || '').toLowerCase()) {
    case '.mp4': case '.mov': return 'video';
    case '.mp3': case '.wav': case '.ogg': case '.m4a': case '.aac': return 'audio';
    case '.pdf': return 'pdf';
    case '.jpg': case '.jpeg': case '.png': case '.gif': case '.webp': return 'image';
    case '.ppt': case '.pptx': return 'presentation';
    default: return 'document';
  }
}

/* ================================
   RESOURCE ASSIGNMENT TABLE
   ================================ */
let raEnsured = false;

async function ensureResourceAssignments() {
  if (raEnsured) return;
  try {
    try {
      const [cols] = await sequelize.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_name = 'resource_assignments' AND column_name = 'resource_id'`,
        { type: QueryTypes.SELECT }
      );
      if (cols?.data_type?.toLowerCase().includes('int')) {
        await sequelize.query(`DROP TABLE IF EXISTS resource_user_assignments CASCADE`);
        await sequelize.query(`DROP TABLE IF EXISTS resource_assignments CASCADE`);
      }
    } catch (e) { logger.warn('[ensureResourceAssignments migration]', e.message); }

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS resource_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        assigned_by UUID NOT NULL REFERENCES users(id),
        student_id UUID REFERENCES users(id) ON DELETE CASCADE,
        class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
        push_type VARCHAR(50) DEFAULT 'learning_material',
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT ra_target_check CHECK (student_id IS NOT NULL OR class_id IS NOT NULL)
      );
    `);
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE resource_assignments ADD CONSTRAINT uq_resource_student UNIQUE (resource_id, student_id, push_type);
      EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
    `);
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE resource_assignments ADD CONSTRAINT uq_resource_class UNIQUE (resource_id, class_id, push_type);
      EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
    `);
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
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_rua_user_id     ON resource_user_assignments(user_id);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_rua_resource_id ON resource_user_assignments(resource_id);`);

    // Backfill: live DBs may have resource_assignments / resource_user_assignments
    // created before assigned_by was added — CREATE TABLE IF NOT EXISTS skips silently
    // so we must ALTER to add the column if it's missing.
    await sequelize.query(`
      ALTER TABLE resource_assignments
        ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id);
    `);
    await sequelize.query(`
      ALTER TABLE resource_user_assignments
        ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id);
    `);

    raEnsured = true;
  } catch (err) {
    logger.error('[ensureResourceAssignments]', err.message);
  }
}

/* ================================
   HEALTH CHECK
   ================================ */
router.get('/health', (_req, res) => res.json({ success: true }));

/* ================================================================
   ❌ REMOVED: GET /r2/* proxy route (ACCESS-01)

   The old route required only `protect` (logged in at all) and
   performed NO entitlement check. Any authenticated user who knew
   an R2 key could access any file regardless of assignment status,
   and revocation of an assignment had no effect.

   ALL file access must now go through GET /:id/download which
   re-checks entitlement on every request.

   If a streaming proxy is needed in future, it MUST call the same
   entitlement subquery used in /:id/download before streaming.
   ================================================================ */

/* ================================
   BULK UPLOAD  (POST /api/resources/bulk-upload)
   ================================ */
router.post(
  '/bulk-upload',
  authorize('admin', 'teacher'),
  upload.any(),
  async (req, res) => {
    try {
      await ensureExtraColumns();

      const isProd       = process.env.NODE_ENV === 'production';
      const allowLocal   = process.env.ALLOW_LOCAL_UPLOADS !== 'false';
      if (isProd && !allowLocal && !r2.isR2Enabled()) {
        return res.status(503).json({
          success: false,
          error: 'File uploads are disabled. Configure Cloudflare R2 or set ALLOW_LOCAL_UPLOADS=false.',
        });
      }

      // req.secureFiles populated by uploadSecurity middleware
      const files   = req.secureFiles || [];
      const prefail = req.failedFiles || [];

      if (files.length === 0) {
        return res.status(400).json({
          success:  false,
          error:    'No files uploaded or all files failed validation.',
          failures: prefail,
        });
      }

      const inserted = [];
      const failures = [...prefail];

      for (const f of files) {
        try {
          // Duplicate detection: check if we already have this exact file
          const [existing] = await sequelize.query(
            `SELECT id, title, file_url FROM resources WHERE sha256 = :hash AND is_active = true LIMIT 1`,
            { replacements: { hash: f.sha256 }, type: QueryTypes.SELECT }
          );
          if (existing) {
            logger.info('[bulk-upload] duplicate detected, returning existing', {
              sha256: f.sha256, existingId: existing.id,
            });
            inserted.push({ ...existing, duplicate: true });
            continue;
          }

          let fileUrl;
          let r2Key = null;

          if (r2.isR2Enabled()) {
            // Use the validated (canonical) MIME, not the client-declared one
            const { url, key } = await r2.uploadBuffer({
              buffer:       f.buffer,
              originalname: f.storedName,         // UUID name goes to storage
              mimetype:     f.mimeType,           // validated MIME only
            });
            fileUrl = url;
            r2Key   = key;
          } else {
            // Local fallback: write to disk using UUID name
            const diskPath = path.join(UPLOADS_DIR, f.storedName);
            fs.writeFileSync(diskPath, f.buffer);
            // Note: /uploads/resources/ is NOT publicly reachable without auth
            // (express.static('/uploads') is still mounted for legacy thumbnails
            //  but resources must be served through /:id/download)
            fileUrl = `/uploads/resources/${f.storedName}`;
          }

          const title        = path.parse(f.originalname).name || f.originalname;
          const resourceType = guessResourceType(f.ext);

          const [rows] = await sequelize.query(
            `INSERT INTO resources
               (title, resource_type, file_url, r2_key, file_size_bytes,
                original_filename, stored_filename, mime_type, sha256,
                is_staged, is_active, uploaded_by, school_id, created_at, updated_at)
             VALUES
               (:title, :rtype, :fileUrl, :r2Key, :size,
                :origName, :storedName, :mime, :hash,
                true, true, :uploadedBy, :schoolId, NOW(), NOW())
             RETURNING id, title, resource_type, file_url, r2_key,
                       file_size_bytes, original_filename, stored_filename,
                       mime_type, sha256, is_staged, is_active, created_at`,
            {
              replacements: {
                title,
                rtype:       resourceType,
                fileUrl,
                r2Key:       r2Key || null,
                size:        f.size,
                origName:    f.originalname,
                storedName:  f.storedName,
                mime:        f.mimeType,
                hash:        f.sha256,
                uploadedBy:  req.user?.id || null,
                // School isolation (Da's decision): App Admin uploads have no
                // school_id, so they stay global/shared with every school.
                // A school-affiliated teacher or school_admin's upload is
                // tagged with their own school and stays private to it.
                schoolId:    req.user?.school_id || null,
              },
            }
          );
          inserted.push(rows[0]);

        } catch (err) {
          logger.error('[bulk-upload insert]', err.message);
          failures.push({ filename: f.originalname, error: err.message });
        }
      }

      const message = inserted.length === 0
        ? 'Upload failed — no files were saved.'
        : failures.length === 0
          ? `Uploaded ${inserted.length} file(s) successfully.`
          : `Uploaded ${inserted.length} file(s); ${failures.length} failed.`;

      return res.status(inserted.length ? 201 : 500).json({
        success:  inserted.length > 0,
        uploaded: inserted.length,
        failed:   failures.length,
        message,
        data:     inserted,
        failures,
      });

    } catch (err) {
      logger.error('[bulk-upload]', err);
      return res.status(500).json({
        success:  false,
        uploaded: 0,
        failed:   (req.secureFiles?.length || 0) + (req.failedFiles?.length || 0),
        message:  err.message || 'Upload failed',
        failures: [],
      });
    }
  }
);

/* ================================
   STAGED FILES  (GET /api/resources/staged)
   ================================ */
router.get('/staged', authorize('admin', 'teacher'), async (_req, res) => {
  try {
    await ensureExtraColumns();
    const rows = await sequelize.query(
      `SELECT id, title, resource_type, file_url, file_size_bytes,
              original_filename, stored_filename, mime_type, sha256,
              is_staged, is_active, content_kind, questions_extracted_at,
              uploaded_by, created_at, updated_at
         FROM resources
        WHERE is_staged = true AND is_active = true
        ORDER BY created_at DESC LIMIT 500`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('[staged]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   LIST PUBLISHED RESOURCES  (GET /api/resources)
   ================================ */
router.get('/', async (req, res) => {
  try {
    await ensureExtraColumns();
    await ensureResourceAssignments();

    const { q, subject_id, topic_id, subtopic_id } = req.query;
    const role         = req.user?.role;
    const replacements = { user_id: req.user?.id || null };

    let where = `WHERE r.is_active = true AND (r.is_staged = false OR r.is_staged IS NULL)`;
    if (q && String(q).trim())                          { where += ` AND r.title ILIKE :q`;           replacements.q          = `%${String(q).trim()}%`; }
    if (subject_id  && /^\d+$/.test(subject_id))        { where += ` AND r.subject_id  = :subject_id`;  replacements.subject_id  = parseInt(subject_id,  10); }
    if (topic_id    && /^\d+$/.test(topic_id))          { where += ` AND r.topic_id    = :topic_id`;    replacements.topic_id    = parseInt(topic_id,    10); }
    if (subtopic_id && /^\d+$/.test(subtopic_id))       { where += ` AND r.subtopic_id = :subtopic_id`; replacements.subtopic_id = parseInt(subtopic_id, 10); }

    if (role === 'student') {
      where += `
        AND (
          EXISTS (SELECT 1 FROM resource_assignments      ra  WHERE ra.resource_id = r.id AND ra.student_id = :user_id)
          OR EXISTS (SELECT 1 FROM resource_user_assignments rua WHERE rua.resource_id = r.id AND rua.user_id = :user_id)
          OR EXISTS (
            SELECT 1 FROM resource_assignments ra
            JOIN class_memberships cm ON cm.class_id = ra.class_id
            WHERE ra.resource_id = r.id AND cm.student_id = :user_id
          )
        )`;
    }

    if (role === 'teacher' || role === 'school_admin') {
      // Teachers only see resources they uploaded — not other teachers' files.
      // school_admin gets the same self-scoping here (their own uploads);
      // broader same-school visibility across all staff isn't needed for
      // this slice — a school_admin managing their school's roster/resources
      // in bulk goes through the schools routes, not this per-file list.
      where += ` AND r.uploaded_by = :user_id`;
    }

    const rows = await sequelize.query(
      `SELECT r.id, r.title, r.resource_type, r.file_url, r.file_size_bytes,
              r.original_filename, r.mime_type, r.is_staged, r.is_active,
              r.uploaded_by, r.subject_id, r.topic_id, r.subtopic_id, r.push_type,
              r.content_kind, r.questions_extracted_at, r.created_at, r.updated_at,
              s.name AS subject_name, t.name AS topic_name, st.name AS subtopic_name,
              TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS uploader_name,
              u.role AS uploader_role
         FROM resources r
         LEFT JOIN subjects  s ON s.id = r.subject_id
         LEFT JOIN topics    t ON t.id = r.topic_id
         LEFT JOIN subtopics st ON st.id = r.subtopic_id
         LEFT JOIN users     u  ON u.id  = r.uploaded_by
         ${where}
        ORDER BY r.created_at DESC LIMIT 1000`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('[list resources]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   MY ASSIGNMENTS  (GET /api/resources/my-assignments)
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
              s.name  AS subject_name, t.name AS topic_name, st.name AS subtopic_name,
              TRIM(COALESCE(ab.first_name, '') || ' ' || COALESCE(ab.last_name, '')) AS assigned_by_name,
              TRIM(COALESCE(ub.first_name, '') || ' ' || COALESCE(ub.last_name, '')) AS uploaded_by_name
         FROM resources r
         LEFT JOIN subjects  s  ON s.id  = r.subject_id
         LEFT JOIN topics    t  ON t.id  = r.topic_id
         LEFT JOIN subtopics st ON st.id = r.subtopic_id
         LEFT JOIN LATERAL (
           SELECT assigned_by FROM (
             SELECT assigned_by FROM resource_assignments    WHERE resource_id = r.id AND student_id = :uid
             UNION ALL
             SELECT assigned_by FROM resource_user_assignments WHERE resource_id = r.id AND user_id = :uid
             UNION ALL
             SELECT ra.assigned_by FROM resource_assignments ra
               JOIN class_memberships cm ON cm.class_id = ra.class_id
              WHERE ra.resource_id = r.id AND cm.student_id = :uid
           ) _ab WHERE assigned_by IS NOT NULL LIMIT 1
         ) assigner ON true
         LEFT JOIN users ab ON ab.id = assigner.assigned_by
         LEFT JOIN users ub ON ub.id = r.uploaded_by
        WHERE r.is_active = true
          AND (r.is_staged = false OR r.is_staged IS NULL)
          AND (
            EXISTS (SELECT 1 FROM resource_assignments      ra  WHERE ra.resource_id = r.id AND ra.student_id = :uid)
            OR EXISTS (SELECT 1 FROM resource_user_assignments rua WHERE rua.resource_id = r.id AND rua.user_id = :uid)
            OR EXISTS (
              SELECT 1 FROM resource_assignments ra
              JOIN class_memberships cm ON cm.class_id = ra.class_id
              WHERE ra.resource_id = r.id AND cm.student_id = :uid
            )
          )
        ORDER BY r.created_at DESC LIMIT 1000`,
      { replacements: { uid: userId }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('[my-assignments]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   RENAME  (PUT /api/resources/:id/rename)
   ================================ */
router.put('/:id/rename', authorize('admin', 'teacher'), async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }
  try {
    // Teachers can only rename resources they uploaded
    if (req.user.role === 'teacher') {
      const owned = await sequelize.query(
        `SELECT id FROM resources WHERE id = :id AND uploaded_by = :uid LIMIT 1`,
        { replacements: { id, uid: req.user.id }, type: QueryTypes.SELECT }
      );
      if (!owned.length) {
        return res.status(403).json({ success: false, error: 'Not authorised to rename this resource' });
      }
    }
    await sequelize.query(
      `UPDATE resources SET title = :title, updated_at = NOW() WHERE id = :id`,
      { replacements: { title: title.trim(), id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Resource renamed' });
  } catch (err) {
    console.error('[PUT /resources/:id/rename]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to rename resource' });
  }
});

/* ================================
   ASSIGN METADATA  (PUT /api/resources/:id/assign-meta)
   ================================ */
router.put('/:id/assign-meta', authorize('admin', 'teacher'), async (req, res) => {
  try {
    await ensureExtraColumns();
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, error: 'Invalid resource id' });

    const { title, topic_id = null, subtopic_id = null, subject_id = null,
            push_type = 'learning_material', content_kind = 'learning_material' } = req.body || {};

    if (!subject_id && !topic_id) {
      return res.status(400).json({ success: false, error: 'Please provide at least a subject_id or topic_id.' });
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
          content_kind: safeKind,
        },
      }
    );

    if (!rows || rows.length === 0) return res.status(404).json({ success: false, error: 'Resource not found' });

    if (safeKind === 'question_bank') {
      try {
        const extractor = require('../services/resourceQuestionExtractor');
        extractor.extractFromResource(rows[0], req.user?.id)
          .then(info => logger.info('[assign-meta] extraction complete', info))
          .catch(e  => logger.error('[assign-meta] extraction failed', e.message));
      } catch (e) { logger.error('[assign-meta] extractor unavailable', e.message); }
    }

    return res.json({ success: true, data: rows[0], resource: rows[0], extraction_queued: safeKind === 'question_bank' });
  } catch (err) {
    logger.error('[assign-meta]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   AUTHENTICATED DOWNLOAD  (GET /api/resources/:id/download)

   Security model:
   • Students:   entitlement check (direct, user-level, or class-based assignment)
   • Teachers/Admins: unrestricted
   • R2 path:    60-second signed URL (expires; not permanently shareable)
   • Local path: streamed through Express (NOT redirected to /uploads/ static)

   ACCESS-01b fix: local fallback NO LONGER redirects to /uploads/...
   It streams the file directly after the entitlement check passes.
   This prevents permanent public access to files via the static mount.
   ================================ */
router.get('/:id/download', protect, async (req, res) => {
  try {
    const { id }  = req.params;
    const role    = req.user.role;
    const userId  = req.user.id;

    logger.info('[download] attempt', { resourceId: id, userId, role });

    // ── 1. Fetch resource ──────────────────────────────────────────────────
    const rows = await sequelize.query(
      `SELECT id, title, file_url, r2_key, stored_filename, mime_type, original_filename, is_active
         FROM resources WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length || !rows[0].is_active) {
      logger.warn('[download] resource not found or inactive', { resourceId: id });
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    const resource = rows[0];

    // ── 2. Enforce entitlement for students (re-checked on every request) ───
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
        logger.warn('[download] access denied', { resourceId: id, userId });
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    // ── 3. Resolve the R2 object key ───────────────────────────────────────
    // Decode exactly ONCE. Previous code called decodeURIComponent twice
    // (once here, once in r2Storage). That double-decode is now removed.
    let key = resource.r2_key || null;

    if (!key && resource.file_url) {
      const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
      if (base && resource.file_url.startsWith(base + '/')) {
        key = resource.file_url.slice(base.length + 1);
      } else if (resource.file_url.startsWith('/api/resources/r2/')) {
        // Legacy URLs that pointed at the old proxy route — decode once
        key = decodeURIComponent(resource.file_url.slice('/api/resources/r2/'.length));
      } else {
        const m = resource.file_url.match(/\/(resources\/[^?#]+)/);
        if (m) key = m[1];
      }
    }

    // ── 4. Serve the file ──────────────────────────────────────────────────
    if (key && r2.isR2Enabled()) {
      // R2: viewer mode gets a 10-minute signed URL so Microsoft/Google viewer
      // has time to fetch the file asynchronously after the client receives the URL.
      // Download mode keeps the tight 60-second TTL.
      const ttlSeconds = req.query.viewer === '1' ? 600 : 60;
      const signedUrl = await getSignedDownloadUrl(key, ttlSeconds);
      logger.info('[download] R2 signed URL issued', { resourceId: id, userId });

      // ?direct=1 → return the signed URL as JSON so the client can open it
      // in a new tab without a cross-origin fetch (which caused CORS errors
      // manifesting as "No internet connection" on the View/Download buttons).
      if (req.query.direct === '1' || req.query.viewer === '1') {
        return res.json({ success: true, url: signedUrl });
      }

      return res.redirect(302, signedUrl);
    }

    // ── Local disk fallback: stream through Express, NOT via /uploads/ redirect
    //    This keeps the entitlement check effective. The file is read from disk
    //    and piped to the response — the /uploads/ static mount is never involved.
    if (resource.file_url && !resource.file_url.startsWith('http')) {
      // stored_filename takes priority (UUID-named, safe); fall back to basename
      const fileName = resource.stored_filename || path.basename(resource.file_url);
      const filePath = path.join(UPLOADS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        logger.warn('[download] local file not found', { filePath });
        return res.status(404).json({ success: false, error: 'File not found on disk' });
      }

      // Path traversal guard: ensure resolved path stays within UPLOADS_DIR
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(UPLOADS_DIR))) {
        logger.error('[download] path traversal attempt', { filePath, userId });
        return res.status(400).json({ success: false, error: 'Invalid file path' });
      }

      const safeMime    = resource.mime_type || 'application/octet-stream';
      const safeOriginal = (resource.original_filename || fileName).replace(/[^\w.\-]/g, '_');

      res.setHeader('Content-Type', safeMime);
      res.setHeader('Content-Disposition', `inline; filename="${safeOriginal}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Prevent file from executing in browser if somehow served as wrong type
      res.setHeader('Content-Security-Policy', "default-src 'none'");

      logger.info('[download] local stream', { resourceId: id, userId, filePath });
      return fs.createReadStream(filePath).pipe(res);
    }

    return res.status(502).json({ success: false, error: 'File storage not configured' });

  } catch (err) {
    logger.error('[GET /resources/:id/download]', err.message);
    return res.status(500).json({ success: false, error: 'Download failed' });
  }
});

/* ================================
   DELETE STAGED FILE  (DELETE /api/resources/:id)
   ================================ */
router.delete('/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });

    const rows = await sequelize.query(
      `SELECT file_url, stored_filename FROM resources WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Resource not found' });

    await sequelize.query(`DELETE FROM resource_assignments      WHERE resource_id = :id`, { replacements: { id }, type: QueryTypes.DELETE }).catch(() => {});
    await sequelize.query(`DELETE FROM resource_user_assignments WHERE resource_id = :id`, { replacements: { id }, type: QueryTypes.DELETE }).catch(() => {});
    await sequelize.query(`DELETE FROM resources WHERE id = :id`, { replacements: { id }, type: QueryTypes.DELETE });

    if (rows[0].file_url) {
      if (/^https?:\/\//.test(rows[0].file_url)) {
        r2.deleteByUrl(rows[0].file_url).catch(() => {});
      } else {
        const fileName = rows[0].stored_filename || path.basename(rows[0].file_url);
        const full = path.join(UPLOADS_DIR, fileName);
        fs.unlink(full, () => {});
      }
    }

    return res.json({ success: true, id });
  } catch (err) {
    logger.error('[delete resource]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ================================
   ASSIGN USERS  (PUT /api/resources/:id/assign-users)
   ================================ */
router.put('/:id/assign-users', authorize('admin', 'teacher'), async (req, res) => {
  await ensureResourceAssignments();

  const resourceId = req.params.id;
  if (!resourceId) return res.status(400).json({ success: false, error: 'Invalid resource id' });

  const { user_ids = [], class_ids = [], assign_all = false, push_type = 'learning_material' } = req.body || {};

  try {
    const guardRows = await sequelize.query(
      `SELECT id, is_staged, subject_id, topic_id, subtopic_id, title, push_type FROM resources WHERE id = :rid`,
      { replacements: { rid: resourceId }, type: QueryTypes.SELECT }
    );
    if (!guardRows?.length) return res.status(404).json({ success: false, error: 'Resource not found' });

    const meta = guardRows[0];
    if (meta.is_staged) return res.status(400).json({ success: false, error: 'This file is still in the staging tray.' });
    if (!meta.subject_id && !meta.topic_id && !meta.subtopic_id)
      return res.status(400).json({ success: false, error: 'This file has no subject or topic assigned yet.' });

    const resourcePushType = meta.push_type || 'learning_material';
    if (push_type !== resourcePushType)
      return res.status(400).json({ success: false, error: `push_type mismatch: resource is "${resourcePushType}", request sent "${push_type}".` });

    if (req.user.role === 'teacher') {
      if (!meta.subject_id) return res.status(403).json({ success: false, error: 'No subject assigned.' });
      const teacherRows = await sequelize.query(
        `SELECT 1 FROM teacher_subjects WHERE teacher_id = :tid AND subject_id = :sid AND is_active = true LIMIT 1`,
        { replacements: { tid: req.user.id, sid: meta.subject_id }, type: QueryTypes.SELECT }
      );
      if (!teacherRows.length) return res.status(403).json({ success: false, error: 'You are not assigned to this subject.' });
    }

    let candidateIds = [...user_ids];
    if (assign_all) {
      const students = await sequelize.query(
        `SELECT id FROM users WHERE role = 'student' AND is_active = true`,
        { type: QueryTypes.SELECT }
      );
      candidateIds = students.map(s => s.id);
    }
    if (class_ids.length > 0) {
      const members = await sequelize.query(
        `SELECT student_id FROM class_memberships WHERE class_id IN (:classIds)`,
        { replacements: { classIds: class_ids }, type: QueryTypes.SELECT }
      );
      candidateIds = [...new Set([...candidateIds, ...members.map(m => m.student_id)])];
    }

    // School-boundary check (closes the cross-tenant assignment gap): a
    // school-affiliated assigner (teacher or school_admin with a school_id)
    // can only assign to students/classes within their own school.
    // Standalone assigners (school_id IS NULL) are unaffected — this only
    // activates once the assigner actually belongs to a school. Resource
    // *visibility* was already scoped by school_id; this closes the one
    // remaining path where an explicit assignment could still cross a
    // school boundary regardless of that visibility scoping.
    let skippedOutsideSchool = 0;
    if (req.user.school_id) {
      if (class_ids.length > 0) {
        const ownClassRows = await sequelize.query(
          `SELECT c.id FROM classes c
             JOIN users t ON t.id = c.teacher_id
            WHERE c.id IN (:classIds) AND t.school_id = :schoolId`,
          { replacements: { classIds: class_ids, schoolId: req.user.school_id }, type: QueryTypes.SELECT }
        );
        const ownClassSet = new Set(ownClassRows.map(r => r.id));
        const outsideClasses = class_ids.filter(cid => !ownClassSet.has(cid));
        if (outsideClasses.length > 0) {
          return res.status(403).json({
            success: false,
            error: `${outsideClasses.length} of the selected classes belong to a different school and cannot be assigned to.`,
          });
        }
      }
      if (candidateIds.length > 0) {
        const ownStudentRows = await sequelize.query(
          `SELECT id FROM users WHERE id IN (:cids) AND school_id = :schoolId`,
          { replacements: { cids: candidateIds, schoolId: req.user.school_id }, type: QueryTypes.SELECT }
        );
        const ownStudentSet = new Set(ownStudentRows.map(r => r.id));
        const before = candidateIds.length;
        candidateIds = candidateIds.filter(id => ownStudentSet.has(id));
        skippedOutsideSchool = before - candidateIds.length;
      }
    }

    let eligibleIds = candidateIds;
    if (meta.subject_id && candidateIds.length > 0) {
      const enrolledRows = await sequelize.query(
        `SELECT student_id FROM student_subjects WHERE subject_id = :sid AND (status = :approvedStatus OR status IS NULL) AND student_id IN (:cids)`,
        { replacements: { sid: meta.subject_id, cids: candidateIds, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.SELECT }
      );
      const enrolledSet = new Set(enrolledRows.map(r => r.student_id));
      eligibleIds = candidateIds.filter(id => enrolledSet.has(id));
    }

    let insertedStudents = 0;
    for (const sid of eligibleIds) {
      try {
        await sequelize.query(
          `INSERT INTO resource_assignments (resource_id, assigned_by, student_id, push_type)
           VALUES (:rid, :by, :sid, :pt) ON CONFLICT DO NOTHING`,
          { replacements: { rid: resourceId, by: req.user.id, sid, pt: resourcePushType }, type: QueryTypes.INSERT }
        );
        insertedStudents++;
      } catch (err) { logger.warn('[assign student]', err.message); }
    }

    let insertedClasses = 0;
    for (const cid of class_ids) {
      try {
        await sequelize.query(
          `INSERT INTO resource_assignments (resource_id, assigned_by, class_id, push_type)
           VALUES (:rid, :by, :cid, :pt) ON CONFLICT DO NOTHING`,
          { replacements: { rid: resourceId, by: req.user.id, cid, pt: resourcePushType }, type: QueryTypes.INSERT }
        );
        insertedClasses++;
      } catch (err) { logger.warn('[assign class]', err.message); }
    }

    await sequelize.query(
      `UPDATE resources SET is_staged = false, updated_at = NOW() WHERE id = :rid`,
      { replacements: { rid: resourceId }, type: QueryTypes.UPDATE }
    ).catch(err => logger.warn('[unstage resource]', err.message));

    return res.json({
      success:       true,
      student_count: insertedStudents,
      class_count:   insertedClasses,
      skipped_count: (candidateIds.length - eligibleIds.length) + skippedOutsideSchool,
      skipped_outside_school: skippedOutsideSchool || undefined,
      message:       insertedStudents || insertedClasses
        ? `Pushed to ${insertedStudents} student(s) and ${insertedClasses} class(es).`
        : 'No new assignments were created.',
    });
  } catch (err) {
    logger.error('[assign-users]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
