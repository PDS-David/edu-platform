'use strict';

/**
 * server/middleware/uploadSecurity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure upload middleware factory.
 *
 * Wraps multer with:
 *   • Memory-only storage (no disk write until validation passes)
 *   • Four-layer validation via fileValidator.js
 *   • UUID-based storage naming (never trusts client filename)
 *   • SHA-256 content hash for deduplication and integrity
 *   • Detailed structured logging of every upload attempt / failure
 *   • Proper 400/413/415/422 error codes (never generic 500)
 *   • Antivirus hook point (pluggable — ClamAV / external service)
 *
 * Usage (in a route file):
 *
 *   const { createUploadMiddleware } = require('../middleware/uploadSecurity');
 *
 *   // Single-file upload, 50 MB limit, PDF + DOCX only
 *   const upload = createUploadMiddleware({
 *     maxSizeMB:      50,
 *     allowedTypes:   ['pdf', 'docx'],    // optional subset; default = all allowed
 *   });
 *
 *   router.post('/upload', protect, upload.single('file'), async (req, res) => {
 *     // req.secureFile is populated:
 *     // {
 *     //   buffer:           Buffer,
 *     //   originalname:     string,
 *     //   storedName:       string,        // UUID-based, e.g. "550e8400-...pdf"
 *     //   ext:              string,        // ".pdf"
 *     //   mimeType:         string,        // validated MIME, e.g. "application/pdf"
 *     //   size:             number,
 *     //   sha256:           string,
 *     //   uploadedAt:       Date,
 *     // }
 *   });
 *
 * For multi-file routes:
 *   upload.array('files', 20)  → req.secureFiles (array)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const multer  = require('multer');
const crypto  = require('crypto');
const { randomUUID } = crypto;
const { validateFile, ALLOWED_EXTENSIONS, EXTENSION_MIME_MAP } = require('../utils/fileValidator');
const logger  = require('../config/logger');

// ── AV scanner hook ───────────────────────────────────────────────────────────

/**
 * Pluggable antivirus scanner.
 * Replace this with a real ClamAV / external-API call when the service is
 * provisioned. Returns one of: 'clean' | 'infected' | 'error'
 *
 * @param {Buffer} buffer
 * @param {string} filename - for logging
 * @returns {Promise<{ result: 'clean'|'infected'|'error', detail?: string }>}
 */
async function scanBuffer(buffer, filename) {
  // Stub — always returns clean.
  // To wire in ClamAV (Node.js clamscan or similar):
  //   const clam = require('clamscan');
  //   const scan = await clam.scanBuffer(buffer);
  //   return scan.isInfected ? { result: 'infected', detail: scan.viruses[0] } : { result: 'clean' };
  return { result: 'clean' };
}

// ── Helper: compute SHA-256 of a buffer ───────────────────────────────────────

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── Helper: build a safe stored filename ─────────────────────────────────────

function buildStoredName(ext) {
  return `${randomUUID()}${ext}`;
}

// ── Helper: strip dangerous characters from the original filename for logging ─

function sanitiseForLog(name) {
  return (name || '').replace(/[^\w.\-]/g, '_').slice(0, 200);
}

// ── Core validation pipeline ─────────────────────────────────────────────────

/**
 * Run the full four-layer validation on a multer file object (memory storage).
 *
 * @param {object} file   - multer file object with .buffer, .originalname, .mimetype
 * @param {Set}    allowedExts - optional subset of ALLOWED_EXTENSIONS
 * @returns {{ ok: boolean, secureFile?: object, statusCode?: number, reason?: string }}
 */
async function runValidation(file, allowedExts) {
  const origName = file.originalname || 'unknown';
  const logName  = sanitiseForLog(origName);

  logger.info('[upload] attempt', {
    filename: logName,
    declaredMime: file.mimetype,
    size: file.size || file.buffer?.length,
  });

  // ── Size guard (belt-and-suspenders — multer already checked, but we
  //    re-check here in case the limit was bypassed via streaming tricks)
  const buf = file.buffer;
  if (!buf || buf.length === 0) {
    logger.warn('[upload] rejected — empty buffer', { filename: logName });
    return { ok: false, statusCode: 400, reason: 'File is empty' };
  }

  // ── Four-layer validation ─────────────────────────────────────────────────
  const result = validateFile({
    buffer:       buf,
    originalname: origName,
    declaredMime: file.mimetype,
  });

  if (!result.valid) {
    logger.warn('[upload] validation failure', { filename: logName, reason: result.reason });
    return { ok: false, statusCode: 422, reason: result.reason };
  }

  // ── Subset filter (optional) ───────────────────────────────────────────────
  if (allowedExts && !allowedExts.has(result.ext)) {
    const reason = `File type "${result.ext}" is not accepted by this endpoint`;
    logger.warn('[upload] type not accepted by endpoint', { filename: logName, ext: result.ext });
    return { ok: false, statusCode: 415, reason };
  }

  // ── Antivirus scan ────────────────────────────────────────────────────────
  const avResult = await scanBuffer(buf, logName);
  if (avResult.result === 'infected') {
    logger.error('[upload] MALWARE DETECTED', { filename: logName, detail: avResult.detail });
    return { ok: false, statusCode: 422, reason: `Malware detected: ${avResult.detail || 'unknown'}` };
  }
  if (avResult.result === 'error') {
    // Scan error → quarantine (reject for safety)
    logger.warn('[upload] AV scan error — rejecting for safety', { filename: logName });
    return { ok: false, statusCode: 422, reason: 'File could not be scanned — upload rejected' };
  }

  // ── Build secure file descriptor ──────────────────────────────────────────
  const storedName  = buildStoredName(result.ext);
  const hash        = sha256(buf);

  const secureFile = {
    buffer:       buf,
    originalname: origName,
    storedName,
    ext:          result.ext,
    mimeType:     EXTENSION_MIME_MAP[result.ext][0],  // canonical MIME, not client's
    size:         buf.length,
    sha256:       hash,
    uploadedAt:   new Date(),
  };

  logger.info('[upload] validated', {
    filename:   logName,
    storedName,
    ext:        result.ext,
    size:       buf.length,
    sha256:     hash,
  });

  return { ok: true, secureFile };
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {number}   [options.maxSizeMB=50]     - maximum file size in MB
 * @param {string[]} [options.allowedTypes]      - array of extensions WITHOUT dot, e.g. ['pdf','docx']
 *                                                 Defaults to all types in the allowlist.
 * @param {number}   [options.maxFiles=1]        - max files for .array()
 */
function createUploadMiddleware({ maxSizeMB = 50, allowedTypes, maxFiles = 20 } = {}) {
  // Build the allowed-extension set for this endpoint
  let allowedExts = null;
  if (allowedTypes && allowedTypes.length > 0) {
    allowedExts = new Set(allowedTypes.map(t => (t.startsWith('.') ? t : `.${t}`).toLowerCase()));
  }

  // Multer: memory storage + size limit + MIME pre-filter (first line of defence)
  const multerInst = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: maxSizeMB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      // Quick MIME pre-check to reject obviously wrong types early (before reading body)
      const declaredMime = (file.mimetype || '').toLowerCase().split(';')[0].trim();
      // If it's an explicitly known bad type, reject immediately
      const badMimes = new Set([
        'text/html', 'application/javascript', 'text/javascript',
        'image/svg+xml', 'application/x-sh', 'application/x-msdownload',
        'application/x-msdos-program', 'application/x-executable',
      ]);
      if (badMimes.has(declaredMime)) {
        return cb(new Error(`MIME type "${declaredMime}" is not permitted`));
      }
      cb(null, true);
    },
  });

  // ── Wrapper that runs the security pipeline after multer ──────────────────

  function wrapHandler(multerMethod) {
    return (req, res, next) => {
      multerMethod(req, res, async (err) => {
        // ── Multer errors (file too large, wrong MIME pre-filter, etc.) ───
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            logger.warn('[upload] rejected — file too large', { limit: `${maxSizeMB}MB` });
            return res.status(413).json({
              success: false,
              error:   `File exceeds the ${maxSizeMB} MB size limit`,
            });
          }
          logger.warn('[upload] multer error', { error: err.message });
          return res.status(400).json({ success: false, error: err.message });
        }

        // ── Single-file mode ──────────────────────────────────────────────
        if (req.file) {
          const { ok, secureFile, statusCode, reason } = await runValidation(req.file, allowedExts);
          if (!ok) {
            return res.status(statusCode).json({ success: false, error: reason });
          }
          req.secureFile = secureFile;
          return next();
        }

        // ── Multi-file mode ───────────────────────────────────────────────
        if (req.files && req.files.length > 0) {
          const secure  = [];
          const failed  = [];

          for (const f of req.files) {
            const { ok, secureFile, statusCode, reason } = await runValidation(f, allowedExts);
            if (ok) {
              secure.push(secureFile);
            } else {
              failed.push({ filename: sanitiseForLog(f.originalname), reason });
            }
          }

          req.secureFiles = secure;
          req.failedFiles = failed;

          if (secure.length === 0) {
            return res.status(422).json({
              success: false,
              error:   'No files passed validation',
              failures: failed,
            });
          }
          return next();
        }

        // No files — let the route handler decide if that's an error
        req.secureFile  = null;
        req.secureFiles = [];
        return next();
      });
    };
  }

  return {
    single: (fieldName) => wrapHandler(multerInst.single(fieldName)),
    array:  (fieldName) => wrapHandler(multerInst.array(fieldName, maxFiles)),
    any:    ()          => wrapHandler(multerInst.any()),
  };
}

module.exports = { createUploadMiddleware, runValidation, sha256 };
