'use strict';

/**
 * server/routes/pastPaperRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY REMEDIATION 2026-06-16
 *
 * Fixes applied:
 *
 *   INVALID-01 (Critical — MIME spoofing on PDF uploads)
 *     BEFORE: fileFilter checked only `file.mimetype === 'application/pdf'`
 *             which is attacker-controlled. A non-PDF file with
 *             Content-Type: application/pdf passed the check and was stored
 *             under its original extension (e.g. payload.html).
 *     AFTER:  uploadSecurity middleware performs:
 *               1. Extension allowlist   (.pdf only)
 *               2. MIME allowlist        (application/pdf only)
 *               3. Magic-byte check      (%PDF- header required)
 *               4. Structure check       (%%EOF trailer required)
 *             Stored filename is UUID-based; original name kept separately.
 *             SHA-256 hash stored for integrity and deduplication.
 *
 *   FUNC-01 (Medium — wrong HTTP status codes on rejection)
 *     BEFORE: Multer mounted as router middleware → rejected files threw 500.
 *     AFTER:  createUploadMiddleware uses callback pattern → 400/413/415/422.
 *
 *   ACCESS-02 (Informational — public listing with no auth)
 *     Originally preserved as fully public/unfiltered. Revised 2026-08-26:
 *     still public for anyone not logged in as a student, but a logged-in
 *     student is now restricted to only their own enrolled exam board(s) —
 *     see the exam-type-mismatch fix comment on GET / below. Revised again
 *     2026-08-27 (TEACHER-01): a teacher with active teacher_subjects
 *     assignments is now restricted to those subject(s) too, same as
 *     resource uploads already were — see the TEACHER-01 comment on GET /
 *     below. Revised again 2026-08-28: a teacher with NO assignments on
 *     record now sees nothing (fails closed), not everything — a School
 *     Admin must assign at least one subject first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express   = require('express');
const router    = express.Router();
const path      = require('path');
const fs        = require('fs');
const { QueryTypes } = require('sequelize');

const sequelize  = require('../config/database');
const { protect, optionalAuth } = require('../middleware/auth');
const { createUploadMiddleware } = require('../middleware/uploadSecurity');
const r2         = require('../utils/r2Storage');
const pastPaperScraper = require('../services/pastPaperScraper');
const logger     = require('../config/logger');

// ── Upload directory (local fallback) ─────────────────────────────────────────
const PAST_PAPERS_DIR = path.join(__dirname, '../uploads/past-papers');

// ── Secure upload middleware ───────────────────────────────────────────────────
// PDF-only, 50 MB limit. Extension, MIME, magic bytes, and structure all checked.
const upload = createUploadMiddleware({
  maxSizeMB:    50,
  allowedTypes: ['pdf'],
});

// ── Role guard ────────────────────────────────────────────────────────────────
const teacherOrAdmin = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Teacher or admin access required' });
  }
  next();
};

// ── GET /api/past-papers ──────────────────────────────────────────────────────
// ACCESS-02: Public for anyone not logged in as a student (unauthenticated
// visitors, teachers, admins) — past exam papers remain freely shareable
// reference material for those callers, per the original confirmed policy.
//
// EXAM-TYPE MISMATCH FIX (2026-08-26): a logged-in student was seeing past
// papers from EVERY exam board (e.g. a JUPEB student seeing NECO papers),
// because this route never filtered by the caller's own exam-board
// enrollment at all. Per explicit product decision, students are now
// restricted to ONLY their own enrolled exam board(s) — no way to browse or
// switch to see others, unlike other filters on this route (subject, year)
// which remain caller-adjustable. optionalAuth (not protect) is used so the
// route stays reachable without login for everyone else; the restriction
// only activates once a request is positively identified as a student.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const tableCheck = await sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'past_papers'
       ) AS exists`,
      { type: QueryTypes.SELECT }
    );
    if (!tableCheck[0]?.exists) {
      return res.status(200).json({ success: true, data: [], message: 'Past papers coming soon' });
    }

    const { subject_id, exam_board, year_from, year_to } = req.query;
    const conditions   = ['1=1'];
    const replacements = {};

    if (subject_id) { conditions.push('pp.subject_id = :subject_id'); replacements.subject_id = subject_id; }
    if (exam_board) { conditions.push('pp.exam_board = :exam_board'); replacements.exam_board = exam_board; }
    if (year_from)  { conditions.push('pp.year >= :year_from');       replacements.year_from  = Number(year_from); }
    if (year_to)    { conditions.push('pp.year <= :year_to');         replacements.year_to    = Number(year_to); }

    // Hard restriction for students: only exam boards they're actively
    // enrolled in (student_exam_types, same enrollment table/status used
    // elsewhere in the app), regardless of any exam_board query param they
    // might pass — a student cannot opt out of this by requesting a
    // different board directly.
    if (req.user?.role === 'student') {
      const enrolledBoards = await sequelize.query(
        `SELECT eb.code FROM student_exam_types set2
           JOIN exam_boards eb ON eb.id = set2.exam_board_id
          WHERE set2.student_id = :studentId
            AND (set2.status = 'approved' OR set2.status IS NULL)
            AND set2.is_active = true`,
        { replacements: { studentId: req.user.id }, type: QueryTypes.SELECT }
      );
      const boardCodes = enrolledBoards.map(r => r.code).filter(Boolean);

      // No enrolled exam board on record — show nothing rather than
      // falling back to "everything" (fail closed for this restriction,
      // matching what "ONLY their own enrolled exam type(s)" means for a
      // student with none on record yet).
      if (!boardCodes.length) {
        return res.json({ success: true, data: [] });
      }

      conditions.push('pp.exam_board IN (:boardCodes)');
      replacements.boardCodes = boardCodes;

      // Same restriction, one level down: a student is also limited to the
      // subjects they're actually registered for (own selection OR
      // class-assigned — same two sources /students/my-subjects merges),
      // not every subject that happens to exist under their enrolled
      // board(s). Applied unconditionally, not just when a subject_id query
      // param is passed — otherwise a student could still browse every
      // subject in their board by simply omitting the filter.
      const registeredSubjects = await sequelize.query(
        `SELECT s.id FROM student_subjects ss
           JOIN subjects s ON s.id = ss.subject_id
          WHERE ss.student_id = :studentId AND ss.status = 'approved' AND s.is_active = true
         UNION
         SELECT s.id FROM class_memberships cm
           JOIN classes        c  ON c.id  = cm.class_id
           JOIN class_subjects cs ON cs.class_id = c.id
           JOIN subjects       s  ON s.id  = cs.subject_id
          WHERE cm.student_id = :studentId AND s.is_active = true`,
        { replacements: { studentId: req.user.id }, type: QueryTypes.SELECT }
      );
      const subjectIds = registeredSubjects.map(r => r.id).filter(Boolean);

      // No registered subject on record — show nothing, same fail-closed
      // stance as the board check above, rather than falling back to every
      // subject under the board.
      if (!subjectIds.length) {
        return res.json({ success: true, data: [] });
      }

      conditions.push('pp.subject_id IN (:subjectIds)');
      replacements.subjectIds = subjectIds;
    }

    // TEACHER-01: a school_admin can now assign specific subject(s) to a
    // teacher (server/routes/schoolRoutes.js POST /me/teachers/:id/subjects,
    // shipped 2026-08-27) — the same teacher_subjects table already used to
    // scope resource uploads (see resourceRoutes.js). Past papers previously
    // had no equivalent restriction at all: a teacher assigned only e.g.
    // Mathematics could browse every subject's past papers platform-wide.
    //
    // UPDATED (explicit product decision, supersedes the original TEACHER-01
    // rollout choice): this now fails CLOSED, matching the student
    // restriction above in shape and in strictness — a teacher with zero
    // active teacher_subjects rows sees no past papers at all, not every
    // subject's. A School Admin must assign at least one subject before a
    // teacher can browse any.
    if (req.user?.role === 'teacher') {
      const assignedSubjects = await sequelize.query(
        `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
        { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
      );
      const teacherSubjectIds = assignedSubjects.map(r => r.subject_id).filter(Boolean);
      if (!teacherSubjectIds.length) {
        return res.json({ success: true, data: [] });
      }
      conditions.push('pp.subject_id IN (:teacherSubjectIds)');
      replacements.teacherSubjectIds = teacherSubjectIds;
    }

    const rows = await sequelize.query(
      `SELECT pp.id, pp.title, pp.exam_board, pp.year, pp.paper_type,
              pp.file_url, pp.file_size_bytes, pp.created_at, pp.created_by,
              s.name AS subject_name
         FROM past_papers pp
         LEFT JOIN subjects s ON s.id = pp.subject_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY pp.year DESC, pp.title ASC`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // BEFORE: any error here (a bad column reference, a broken join, a DB
    // outage) was swallowed and reported back to the client as a normal
    // 200 success with an empty list + "coming soon" — indistinguishable
    // from the deliberate table-not-yet-created case above, and impossible
    // to notice from the frontend (no error, just silently empty data).
    // AFTER: only the genuinely-expected "table doesn't exist yet" case
    // (checked separately above, before this try block's query even runs)
    // returns that friendly message. A real failure here now surfaces as
    // an actual error the client and logs can see.
    logger.error('[GET /api/past-papers] query failed:', err.message);
    return res.status(500).json({ success: false, error: 'Could not load past papers' });
  }
});

// ── POST /api/past-papers ─────────────────────────────────────────────────────
router.post('/', protect, teacherOrAdmin, upload.single('file'), async (req, res) => {
  // req.secureFile is populated by uploadSecurity middleware
  if (!req.secureFile) {
    return res.status(400).json({ success: false, error: 'PDF file is required' });
  }

  const { subject_id, exam_board, year, paper_type, title } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'title is required' });
  // CONFIRMED LIVE BUG: past_papers.subject_id is NOT NULL, but this route
  // used to pass subject_id || null straight through, so any caller that
  // omitted it (e.g. the upload form when subjectId was still unselected —
  // fixed separately in UploadPastPaperForm.jsx) got a raw, unhelpful
  // Postgres constraint-violation message as a generic 500. Checked here
  // too, not just client-side, since this is a public API route any caller
  // could hit directly.
  if (!subject_id) return res.status(400).json({ success: false, error: 'subject_id is required' });

  const f = req.secureFile;
  let fileUrl;

  try {
    if (r2.isR2Enabled()) {
      const { url } = await r2.uploadBuffer({
        buffer:       f.buffer,
        originalname: f.storedName,   // UUID name to storage
        mimetype:     f.mimeType,     // validated canonical MIME only
      });
      fileUrl = url;
    } else {
      // Local disk fallback — write UUID-named file
      fs.mkdirSync(PAST_PAPERS_DIR, { recursive: true });
      const diskPath = path.join(PAST_PAPERS_DIR, f.storedName);
      fs.writeFileSync(diskPath, f.buffer);
      fileUrl = `/uploads/past-papers/${f.storedName}`;
    }
  } catch (err) {
    logger.error('[POST /api/past-papers] storage error:', err.message);
    return res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
  }

  try {
    // CONFIRMED LIVE BUG: past_papers.updated_at is NOT NULL with no
    // DB-level default. This INSERT never set it, so every upload that got
    // past the subject_id check above would have failed one layer deeper
    // with the same class of raw constraint-violation 500.
    const result = await sequelize.query(
      `INSERT INTO past_papers
         (subject_id, exam_board, year, paper_type, title,
          file_url, file_size_bytes, created_by, created_at, updated_at)
       VALUES
         (:subject_id, :exam_board, :year, :paper_type, :title,
          :file_url, :file_size_bytes, :created_by, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          subject_id:      subject_id || null,
          exam_board:      exam_board || null,
          year:            year ? Number(year) : null,
          paper_type:      paper_type || null,
          title,
          file_url:        fileUrl,
          file_size_bytes: f.size,
          created_by:      req.user.id,
        },
        type: QueryTypes.INSERT,
      }
    );

    logger.info('[POST /api/past-papers] uploaded', {
      id:       result[0][0].id,
      sha256:   f.sha256,
      size:     f.size,
      uploader: req.user.id,
    });

    return res.status(201).json({ success: true, data: { id: result[0][0].id, file_url: fileUrl } });
  } catch (err) {
    logger.error('[POST /api/past-papers] db error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/past-papers/:id/download ────────────────────────────────────────
// Model B: login required to download, but download is free.
// Verifies the user is authenticated, then redirects to the actual file URL.
// The public GET / list still exposes file_url for in-browser preview (iframe/
// embed) which stays unauthenticated — good for SEO and discoverability.
// Only the download action (triggering a file save) is gated behind login.
router.get('/:id/download', protect, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT file_url, title, exam_board, subject_id FROM past_papers WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Paper not found' });

    // Same exam-board restriction as GET / — closes off downloading a paper
    // outside a student's own enrolled exam board(s) via a direct/known ID,
    // which would otherwise bypass the listing-level filter entirely.
    if (req.user?.role === 'student') {
      const enrolledBoards = await sequelize.query(
        `SELECT 1 FROM student_exam_types set2
           JOIN exam_boards eb ON eb.id = set2.exam_board_id
          WHERE set2.student_id = :studentId
            AND eb.code = :examBoard
            AND (set2.status = 'approved' OR set2.status IS NULL)
            AND set2.is_active = true
          LIMIT 1`,
        { replacements: { studentId: req.user.id, examBoard: rows[0].exam_board }, type: QueryTypes.SELECT }
      );
      if (!enrolledBoards.length) {
        return res.status(403).json({ success: false, error: 'This past paper is not available for your exam type.' });
      }
    }

    // TEACHER-01: same subject restriction as GET /, and for the same
    // reason as the student check above — otherwise a teacher who can no
    // longer see an out-of-subject paper in the list could still fetch it
    // directly via a bookmarked/previously-seen link. UPDATED: fails closed
    // now, matching GET / above — a teacher with zero assignments on record
    // cannot download any past paper.
    if (req.user?.role === 'teacher') {
      const assignedSubjects = await sequelize.query(
        `SELECT 1 FROM teacher_subjects WHERE teacher_id = :teacherId AND subject_id = :subjectId AND is_active = true LIMIT 1`,
        { replacements: { teacherId: req.user.id, subjectId: rows[0].subject_id }, type: QueryTypes.SELECT }
      );
      if (!assignedSubjects.length) {
        return res.status(403).json({ success: false, error: 'This past paper is not available for your assigned subject(s).' });
      }
    }

    const { file_url, title } = rows[0];

    // If stored on R2 (or any https URL), stream it through the server with
    // an explicit attachment header — a 302 redirect straight to R2 does NOT
    // work here: uploadBuffer() stores every object with
    // ContentDisposition: 'inline', and a Content-Disposition header set on
    // a redirect response is discarded by the browser when it follows the
    // redirect (the header only applies to the response it's attached to,
    // not to whatever the Location points at). The browser was opening the
    // PDF inline instead of downloading it — this is the actual fix for
    // "students can preview but can't download."
    if (/^https?:\/\//i.test(file_url)) {
      const key = r2.keyFromUrl(file_url);
      if (key) {
        try {
          const obj = await r2.getObjectByKey(key);
          res.setHeader('Content-Type', obj.contentType || 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title || 'paper')}.pdf"`);
          if (obj.contentLength) res.setHeader('Content-Length', obj.contentLength);
          obj.body.on('error', (streamErr) => {
            logger.error('[GET /api/past-papers/:id/download] R2 stream error:', streamErr.message);
            if (!res.headersSent) res.status(500).end();
            else res.end();
          });
          return obj.body.pipe(res);
        } catch (err) {
          logger.error('[GET /api/past-papers/:id/download] R2 fetch failed, falling back to redirect:', err.message);
          // fall through to the redirect below as a last resort
        }
      }
      // Not one of our own R2 keys (or the R2 fetch failed) — best-effort redirect.
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title || 'paper')}.pdf"`);
      return res.redirect(302, file_url);
    }

    // Local disk fallback
    const diskPath = path.join(__dirname, '..', file_url);
    if (!fs.existsSync(diskPath)) return res.status(404).json({ success: false, error: 'File not found on disk' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title || 'paper')}.pdf"`);
    return res.sendFile(diskPath);
  } catch (err) {
    logger.error('[GET /api/past-papers/:id/download]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/past-papers/:id ───────────────────────────────────────────────
// Admin   → can delete any past paper.
// Teacher → can only delete a paper they themselves uploaded (created_by match).
router.delete('/:id', protect, teacherOrAdmin, async (req, res) => {
  try {
    const existing = await sequelize.query(
      `SELECT id, file_url, created_by FROM past_papers WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Past paper not found' });
    }

    const paper = existing[0];

    if (req.user.role !== 'admin' && paper.created_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only delete past papers you uploaded yourself' });
    }

    await sequelize.query(
      `DELETE FROM past_papers WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.DELETE }
    );

    const fileUrl = paper.file_url;
    if (fileUrl) {
      if (/^https?:\/\//i.test(fileUrl)) {
        r2.deleteByUrl(fileUrl).catch(() => {});
      } else {
        const filePath = path.join(__dirname, '..', fileUrl);
        fs.unlink(filePath, () => {});
      }
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error('[DELETE /api/past-papers]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/past-papers/scrape ──────────────────────────────────────────────
router.post('/scrape', protect, (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  next();
}, async (req, res) => {
  const { source_url, exam_board, subject_id, paper_type, year_hint, follow_subpages } = req.body || {};

  if (!source_url || !/^https?:\/\//i.test(source_url)) {
    return res.status(400).json({ success: false, error: 'A valid source_url (http/https) is required.' });
  }

  try {
    const summary = await pastPaperScraper.scrape({
      source_url,
      exam_board:     exam_board || null,
      subject_id:     subject_id ? Number(subject_id) : null,
      paper_type:     paper_type || null,
      year_hint:      year_hint  ? Number(year_hint)  : null,
      follow_subpages: follow_subpages !== false,
      created_by:     req.user.id,
    });
    return res.json({ success: true, data: summary });
  } catch (err) {
    logger.error('[POST /past-papers/scrape]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
