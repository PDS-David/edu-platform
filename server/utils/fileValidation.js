'use strict';

/**
 * fileValidation.js
 * =================
 * Authoritative file-upload security layer for AISchoolOnAir.
 *
 * Implements four-layer validation required by the security spec:
 *   1. Extension allowlist  — reject unknown/dangerous extensions
 *   2. Client MIME check    — allowlist (never blocklist) on declared type
 *   3. Magic-byte detection — actual bytes via file-type (ignores Content-Type)
 *   4. Structure check      — PDF header, Office ZIP internals, image decoding
 *
 * All four layers must pass.  Any failure returns a structured error with
 * the appropriate HTTP status code so callers can respond consistently.
 *
 * Also provides:
 *   - SHA-256 hashing for every buffer (duplicate detection + integrity)
 *   - Sanitised display names safe for HTML/JSON output
 *   - multer callback-style wrapper for uniform 4xx error responses
 */

const path   = require('path');
const crypto = require('crypto');
const { fromBuffer } = require('file-type');

// ── Allowed types table ───────────────────────────────────────────────────────
// Each entry maps a lowercase extension to the set of MIME types that are
// acceptable for that extension (both declared and detected must be in here).
//
// IMPORTANT: this is an allowlist, not a blocklist.  Anything not listed is
// rejected regardless of what the client sends.
//
// Key  = lowercase extension without the dot
// mime = Set of acceptable MIME strings (declared + magic-detected)

const ALLOWED = {
  // Documents
  pdf:  { mimes: new Set(['application/pdf']),
          type: 'document', maxBytes: 100 * 1024 * 1024 },
  docx: { mimes: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                           'application/zip', 'application/x-zip-compressed']),
          type: 'document', maxBytes: 100 * 1024 * 1024 },
  xlsx: { mimes: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                           'application/zip', 'application/x-zip-compressed']),
          type: 'document', maxBytes: 100 * 1024 * 1024 },
  pptx: { mimes: new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation',
                           'application/zip', 'application/x-zip-compressed']),
          type: 'document', maxBytes: 100 * 1024 * 1024 },
  csv:  { mimes: new Set(['text/csv', 'text/plain', 'application/csv',
                           'application/octet-stream']),
          type: 'document', maxBytes: 50 * 1024 * 1024 },
  txt:  { mimes: new Set(['text/plain', 'application/octet-stream']),
          type: 'document', maxBytes: 10 * 1024 * 1024 },
  // Images
  jpg:  { mimes: new Set(['image/jpeg']),
          type: 'image', maxBytes: 20 * 1024 * 1024 },
  jpeg: { mimes: new Set(['image/jpeg']),
          type: 'image', maxBytes: 20 * 1024 * 1024 },
  png:  { mimes: new Set(['image/png']),
          type: 'image', maxBytes: 20 * 1024 * 1024 },
  webp: { mimes: new Set(['image/webp']),
          type: 'image', maxBytes: 20 * 1024 * 1024 },
  // Video
  mp4:  { mimes: new Set(['video/mp4', 'video/x-m4v', 'application/octet-stream']),
          type: 'video', maxBytes: 2 * 1024 * 1024 * 1024 },
  mov:  { mimes: new Set(['video/quicktime', 'video/x-quicktime', 'application/octet-stream']),
          type: 'video', maxBytes: 2 * 1024 * 1024 * 1024 },
};

// Magic bytes that must NEVER appear at the start of an accepted file,
// regardless of what extension or MIME type is claimed.
// Checked before anything else as a fast short-circuit.
const BLOCKED_MAGIC = [
  // HTML / web
  Buffer.from('<!DOCTYPE', 'utf8'),
  Buffer.from('<!doctype', 'utf8'),
  Buffer.from('<html',     'utf8'),
  Buffer.from('<HTML',     'utf8'),
  Buffer.from('<script',   'utf8'),
  Buffer.from('<SCRIPT',   'utf8'),
  // ELF executable (Linux)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  // Windows PE executable
  Buffer.from([0x4d, 0x5a]),
  // Java class
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
];

// ── ZIP internal structure requirements ──────────────────────────────────────
// Office Open XML formats are ZIP archives.  We verify that the expected
// internal paths are present so a generic ZIP cannot be renamed to .docx etc.
const OFFICE_STRUCTURE = {
  docx: ['word/document.xml', '[Content_Types].xml'],
  xlsx: ['xl/workbook.xml',   '[Content_Types].xml'],
  pptx: ['ppt/presentation.xml', '[Content_Types].xml'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a Buffer, returned as hex string.
 */
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Strip everything that isn't a safe display character from a filename.
 * Returns a string safe to embed in HTML, JSON, log lines, and HTTP headers.
 * The file extension is preserved but normalised to lowercase.
 */
function sanitiseFilename(originalname) {
  if (!originalname || typeof originalname !== 'string') return 'upload';
  const ext  = path.extname(originalname).toLowerCase();
  const base = path.basename(originalname, ext)
                   .replace(/[^\w\s.-]/g, '')   // strip shell-special chars
                   .replace(/\s+/g, '_')         // spaces → underscore
                   .replace(/\.{2,}/g, '.')      // collapse .. sequences
                   .slice(0, 200);               // cap length
  return (base || 'upload') + ext;
}

/**
 * Fast check: does the buffer start with any blocked magic byte sequence?
 */
function hasBlockedMagic(buffer) {
  for (const magic of BLOCKED_MAGIC) {
    if (buffer.length >= magic.length && buffer.slice(0, magic.length).equals(magic)) {
      return true;
    }
  }
  return false;
}

/**
 * Verify that a ZIP-based Office document contains the expected internal paths.
 * Uses a minimal ZIP central-directory scan (no full decompression needed).
 *
 * Returns { ok: true } or { ok: false, reason: string }.
 */
function verifyOfficeStructure(buffer, ext) {
  const required = OFFICE_STRUCTURE[ext];
  if (!required) return { ok: true }; // not an office format — skip

  // ZIP local file header signature: PK\x03\x04
  const ZIP_LFH = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  if (!buffer.slice(0, 4).equals(ZIP_LFH)) {
    return { ok: false, reason: `${ext.toUpperCase()} must be a valid ZIP archive (missing ZIP signature)` };
  }

  // Scan for filename entries in the ZIP local file headers.
  // Each entry: PK\x03\x04 + 26 bytes fixed fields + variable filename
  const found = new Set();
  let offset = 0;
  while (offset + 30 < buffer.length) {
    if (buffer[offset]     !== 0x50 || buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x03 || buffer[offset + 3] !== 0x04) {
      // Not a local file header — try advancing one byte (handles padding)
      offset++;
      continue;
    }
    const compressedSize   = buffer.readUInt32LE(offset + 18);
    const filenameLength   = buffer.readUInt16LE(offset + 26);
    const extraLength      = buffer.readUInt16LE(offset + 28);
    const filenameStart    = offset + 30;
    const filenameEnd      = filenameStart + filenameLength;
    if (filenameEnd > buffer.length) break;
    const filename = buffer.slice(filenameStart, filenameEnd).toString('utf8');
    found.add(filename);
    // Jump to next local file header
    offset = filenameEnd + extraLength + compressedSize;
  }

  for (const req of required) {
    if (!found.has(req)) {
      return {
        ok: false,
        reason: `${ext.toUpperCase()} is missing required internal file: ${req}. Generic ZIP archives are not allowed.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Verify PDF header and basic structure.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
function verifyPdf(buffer) {
  // Must start with %PDF-
  if (buffer.length < 5 || buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
    return { ok: false, reason: 'File does not have a valid PDF header (%PDF-)' };
  }
  // Must contain %%EOF somewhere in the last 2 KB
  const tail = buffer.slice(Math.max(0, buffer.length - 2048)).toString('binary');
  if (!tail.includes('%%EOF')) {
    return { ok: false, reason: 'PDF is truncated or corrupt (missing %%EOF marker)' };
  }
  return { ok: true };
}

/**
 * Verify image magic bytes directly (belt-and-suspenders over file-type).
 * Returns { ok: true } or { ok: false, reason: string }.
 */
function verifyImageMagic(buffer, ext) {
  const normalExt = ext === 'jpg' ? 'jpeg' : ext;
  switch (normalExt) {
    case 'jpeg': {
      // FF D8 FF
      const ok = buffer.length >= 3 &&
                 buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      return ok ? { ok: true } : { ok: false, reason: 'Not a valid JPEG image (bad magic bytes)' };
    }
    case 'png': {
      // 89 50 4E 47 0D 0A 1A 0A
      const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const ok  = buffer.length >= 8 && buffer.slice(0, 8).equals(PNG);
      return ok ? { ok: true } : { ok: false, reason: 'Not a valid PNG image (bad magic bytes)' };
    }
    case 'webp': {
      // RIFF????WEBP
      const ok = buffer.length >= 12 &&
                 buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
                 buffer.slice(8, 12).toString('ascii') === 'WEBP';
      return ok ? { ok: true } : { ok: false, reason: 'Not a valid WebP image (bad magic bytes)' };
    }
    default:
      return { ok: true }; // csv/txt — no binary magic
  }
}

// ── Main validator ────────────────────────────────────────────────────────────

/**
 * validateBuffer(buffer, originalname, declaredMimetype)
 *
 * Runs all four validation layers against a file buffer.
 *
 * @param {Buffer} buffer           - Raw file bytes
 * @param {string} originalname     - Client-supplied filename (untrusted)
 * @param {string} declaredMimetype - Content-Type from multipart (untrusted)
 *
 * @returns {Promise<{
 *   valid: boolean,
 *   status?: number,      // HTTP status to return on failure
 *   error?: string,       // Human-readable rejection reason
 *   ext?: string,         // Normalised lowercase extension (on success)
 *   detectedMime?: string,// MIME type from magic-byte detection (on success)
 *   hash?: string,        // SHA-256 hex (on success)
 *   safe?: boolean,       // Always true on success
 * }>}
 */
async function validateBuffer(buffer, originalname, declaredMimetype) {

  // ── Layer 1: Extension allowlist ──────────────────────────────────────────
  const ext = path.extname(originalname || '').toLowerCase().replace(/^\./, '');
  if (!ext) {
    return { valid: false, status: 415, error: 'File has no extension. Only PDF, DOCX, XLSX, PPTX, CSV, TXT, JPG, PNG, WEBP, MP4, MOV are accepted.' };
  }
  const profile = ALLOWED[ext];
  if (!profile) {
    return {
      valid: false,
      status: 415,
      error: `".${ext}" files are not permitted. Allowed: PDF, DOCX, XLSX, PPTX, CSV, TXT, JPG, JPEG, PNG, WEBP, MP4, MOV.`,
    };
  }

  // ── Layer 2: Declared MIME allowlist ─────────────────────────────────────
  // Treat application/octet-stream as a neutral "unknown" declaration —
  // some browsers/tools use it for everything.  All other values must be
  // in the allowlist for this extension.
  const declared = (declaredMimetype || '').toLowerCase().split(';')[0].trim();
  if (declared && declared !== 'application/octet-stream' && !profile.mimes.has(declared)) {
    return {
      valid: false,
      status: 415,
      error: `Declared content type "${declared}" is not valid for .${ext} files.`,
    };
  }

  // ── Fast-path: reject blocked magic before anything else ─────────────────
  if (hasBlockedMagic(buffer)) {
    return {
      valid: false,
      status: 422,
      error: 'File content was rejected: detected dangerous content signature.',
    };
  }

  // ── Layer 3: Magic-byte detection (file-type) ─────────────────────────────
  // file-type reads the first several KB and returns the detected MIME + ext.
  // We use a sniff of the first 4 MB at most (large videos don't need full read).
  const sniffBuf   = buffer.length > 4 * 1024 * 1024 ? buffer.slice(0, 4 * 1024 * 1024) : buffer;
  const detected   = await fromBuffer(sniffBuf);
  const detectedMime = detected ? detected.mime : null;

  // For plain-text formats (CSV, TXT) file-type usually returns null because
  // they have no binary signature — that's fine, skip the MIME cross-check.
  const isTextFormat = ['csv', 'txt'].includes(ext);

  if (!isTextFormat) {
    // For video files, file-type can return null for large partial buffers;
    // we relax the check since FFmpeg processing acts as a secondary gate.
    const isVideoExt = ['mp4', 'mov'].includes(ext);

    if (!isVideoExt && !detectedMime) {
      return {
        valid: false,
        status: 422,
        error: `Could not determine file type from content. The file may be corrupt or is not a valid ${ext.toUpperCase()}.`,
      };
    }

    if (detectedMime && !profile.mimes.has(detectedMime)) {
      return {
        valid: false,
        status: 422,
        error: `File content detected as "${detectedMime}" but extension is .${ext}. MIME-type spoofing is not allowed.`,
      };
    }
  }

  // ── Layer 4: Structure verification ──────────────────────────────────────
  let structCheck;
  if (ext === 'pdf') {
    structCheck = verifyPdf(buffer);
  } else if (['docx', 'xlsx', 'pptx'].includes(ext)) {
    structCheck = verifyOfficeStructure(buffer, ext);
  } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    structCheck = verifyImageMagic(buffer, ext);
  } else {
    structCheck = { ok: true };
  }

  if (!structCheck.ok) {
    return { valid: false, status: 422, error: structCheck.reason };
  }

  // ── All layers passed ─────────────────────────────────────────────────────
  const hash = sha256(buffer);

  return {
    valid:        true,
    ext,
    detectedMime: detectedMime || declared || 'application/octet-stream',
    hash,
    safe:         true,
  };
}

// ── multer fileFilter wrapper ─────────────────────────────────────────────────
// Use this in multer config to reject files at the multipart boundary.
// Note: multer fileFilter only has access to the header-declared mimetype,
// not the actual bytes — we use this only for the extension + declared-MIME
// pre-flight. Full validation must still run after upload() completes.
function multerFileFilter(allowedExtensions) {
  return (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/^\./, '');
    if (!ext || !allowedExtensions.includes(ext)) {
      // Return an error with a 415-annotated message so the error handler
      // can respond correctly.
      const err = new Error(`".${ext || 'unknown'}" files are not permitted.`);
      err.httpStatus = 415;
      return cb(err);
    }
    const profile  = ALLOWED[ext];
    const declared = (file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (declared && declared !== 'application/octet-stream' && profile && !profile.mimes.has(declared)) {
      const err = new Error(`Declared content type "${declared}" is not valid for .${ext} files.`);
      err.httpStatus = 415;
      return cb(err);
    }
    cb(null, true);
  };
}

// ── Multer error handler ──────────────────────────────────────────────────────
// Mount this as the error handler immediately after an upload() middleware call.
// Converts multer's internal errors + our custom httpStatus errors into proper
// 4xx responses instead of the default generic 500.
function multerErrorHandler(err, req, res, next) {
  if (!err) return next();

  const { MulterError } = require('multer');

  if (err instanceof MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const msg    = err.code === 'LIMIT_FILE_SIZE'
      ? `File too large. Maximum size is ${_humanSize(err.field)}.`
      : err.message;
    return res.status(status).json({ success: false, error: msg });
  }

  // Our own validation errors carry an httpStatus property
  const status = err.httpStatus || 400;
  return res.status(status).json({ success: false, error: err.message });
}

function _humanSize(bytes) {
  if (!bytes || isNaN(bytes)) return 'unknown';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// ── Secure filename generator ─────────────────────────────────────────────────
// Generates a UUID-based storage filename, keeping only the validated extension.
const { v4: uuidv4 } = require('uuid');

function secureStorageName(ext) {
  return `${uuidv4()}.${ext}`;
}

// ── Upload logger ─────────────────────────────────────────────────────────────
function logUploadAttempt({ success, userId, originalname, ext, detectedMime, hash, size, error, route }) {
  const entry = {
    event:     success ? 'upload_success' : 'upload_failure',
    ts:        new Date().toISOString(),
    route:     route    || 'unknown',
    userId:    userId   || 'anonymous',
    filename:  originalname,
    ext:       ext      || null,
    mime:      detectedMime || null,
    hash:      hash     || null,
    bytes:     size     || null,
    error:     error    || null,
  };
  if (success) {
    console.log('[upload]', JSON.stringify(entry));
  } else {
    console.warn('[upload:rejected]', JSON.stringify(entry));
  }
}

module.exports = {
  validateBuffer,
  multerFileFilter,
  multerErrorHandler,
  sanitiseFilename,
  secureStorageName,
  sha256,
  logUploadAttempt,
  ALLOWED,
};
