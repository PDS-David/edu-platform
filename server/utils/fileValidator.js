'use strict';

/**
 * server/utils/fileValidator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Four-layer file validation for every upload route.
 *
 * Checks applied in order:
 *   1. Extension allowlist    — filename must end in an approved extension
 *   2. MIME type allowlist    — declared Content-Type must be approved
 *   3. Magic-byte inspection  — first bytes must match the file's real type
 *   4. Internal structure     — Office ZIP containers validated for correct entries
 *
 * All four checks must pass. Failure at any layer returns { valid: false, reason }.
 *
 * References:
 *   PDF magic bytes   : %PDF-
 *   ZIP signature     : PK\x03\x04
 *   JPEG              : \xFF\xD8\xFF
 *   PNG               : \x89PNG\r\n\x1a\n
 *   WEBP              : RIFF????WEBP
 *   MP4 (ftyp box)    : 4-byte offset + "ftyp"
 *   MOV               : "ftyp" or "moov" or "wide" or "mdat" in first box type
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');

// ── Allowlists ────────────────────────────────────────────────────────────────

/** Map from lowercase extension → allowed MIME types for that extension. */
const EXTENSION_MIME_MAP = {
  // Documents
  '.pdf':  ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/zip', 'application/octet-stream'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/zip', 'application/octet-stream'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation',
             'application/zip', 'application/octet-stream'],
  '.csv':  ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'],
  '.txt':  ['text/plain'],
  // Images
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.webp': ['image/webp'],
  // Video
  '.mp4':  ['video/mp4', 'video/x-m4v', 'application/mp4'],
  '.mov':  ['video/quicktime', 'video/x-quicktime'],
};

/** Set of all approved extensions (lower-case, with dot). */
const ALLOWED_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME_MAP));

/**
 * Explicit blocklist for defence-in-depth.
 * These are checked AFTER the allowlist — anything not on the allowlist is
 * already blocked, but we log a distinct reason for known-dangerous types.
 */
const BLOCKED_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.svg', '.xml',
  '.js', '.mjs', '.ts', '.bat', '.cmd', '.sh', '.ps1',
  '.exe', '.dll', '.msi', '.apk', '.appx', '.jar',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.php', '.asp', '.aspx', '.rb', '.py', '.pl',
]);

// ── Magic-byte signatures ─────────────────────────────────────────────────────

/**
 * Check a Buffer against a known signature.
 * @param {Buffer} buf
 * @param {number} offset - byte offset to start comparing
 * @param {number[]|string} signature - array of byte values OR ASCII string
 */
function matchesSignature(buf, offset, signature) {
  if (buf.length < offset + signature.length) return false;
  const bytes = typeof signature === 'string'
    ? [...signature].map(c => c.charCodeAt(0))
    : signature;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/**
 * Returns true if the buffer looks like a ZIP archive (PK\x03\x04).
 * DOCX / XLSX / PPTX all use ZIP as their container.
 */
function isZipMagic(buf) {
  return matchesSignature(buf, 0, [0x50, 0x4B, 0x03, 0x04]);
}

/** PDF magic bytes: "%PDF-" */
function isPDFMagic(buf) {
  return matchesSignature(buf, 0, '%PDF-');
}

/** JPEG magic bytes: FF D8 FF */
function isJPEGMagic(buf) {
  return matchesSignature(buf, 0, [0xFF, 0xD8, 0xFF]);
}

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A */
function isPNGMagic(buf) {
  return matchesSignature(buf, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
}

/** WEBP: "RIFF" at 0, "WEBP" at 8 */
function isWEBPMagic(buf) {
  return matchesSignature(buf, 0, 'RIFF') && matchesSignature(buf, 8, 'WEBP');
}

/**
 * MP4 / MOV: ISO Base Media file format.
 * The first box starts at byte 0; its type is at bytes 4–7.
 * Valid top-level box types for MP4: ftyp, moov, mdat, free, wide, skip
 * MOV additionally uses: pnot, uuid, wide, mdat
 */
const ISO_BOX_TYPES = new Set(['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip', 'pnot', 'uuid']);

function isISOBaseMagic(buf) {
  if (buf.length < 8) return false;
  const boxType = buf.slice(4, 8).toString('ascii');
  return ISO_BOX_TYPES.has(boxType);
}

// ── ZIP structure inspector (in-memory) ───────────────────────────────────────

/**
 * Very lightweight ZIP central-directory scanner.
 * Reads the ZIP end-of-central-directory record to find the start of the
 * central directory, then iterates entries to build a Set of filenames.
 * No external dependencies — pure Node Buffer operations.
 */
function listZipEntries(buf) {
  const entries = new Set();
  try {
    // Locate End of Central Directory record (signature 50 4B 05 06)
    // It can appear at various offsets; scan from the end.
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4B &&
          buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) return entries;

    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    const cdSize   = buf.readUInt32LE(eocdOffset + 12);

    let pos = cdOffset;
    const end = cdOffset + cdSize;
    while (pos < end && pos + 46 <= buf.length) {
      if (buf[pos] !== 0x50 || buf[pos + 1] !== 0x4B ||
          buf[pos + 2] !== 0x01 || buf[pos + 3] !== 0x02) break;

      const filenameLen = buf.readUInt16LE(pos + 28);
      const extraLen    = buf.readUInt16LE(pos + 30);
      const commentLen  = buf.readUInt16LE(pos + 32);

      if (pos + 46 + filenameLen > buf.length) break;
      const filename = buf.slice(pos + 46, pos + 46 + filenameLen).toString('utf8');
      entries.add(filename);
      pos += 46 + filenameLen + extraLen + commentLen;
    }
  } catch {
    // Malformed ZIP — return whatever we found
  }
  return entries;
}

// ── Office document structure validators ─────────────────────────────────────

function validateDOCX(buf) {
  if (!isZipMagic(buf)) return { valid: false, reason: 'DOCX missing ZIP signature' };
  const entries = listZipEntries(buf);
  if (!entries.has('word/document.xml'))   return { valid: false, reason: 'DOCX missing word/document.xml' };
  if (!entries.has('[Content_Types].xml')) return { valid: false, reason: 'DOCX missing [Content_Types].xml' };
  return { valid: true };
}

function validateXLSX(buf) {
  if (!isZipMagic(buf)) return { valid: false, reason: 'XLSX missing ZIP signature' };
  const entries = listZipEntries(buf);
  if (!entries.has('xl/workbook.xml'))     return { valid: false, reason: 'XLSX missing xl/workbook.xml' };
  if (!entries.has('[Content_Types].xml')) return { valid: false, reason: 'XLSX missing [Content_Types].xml' };
  return { valid: true };
}

function validatePPTX(buf) {
  if (!isZipMagic(buf)) return { valid: false, reason: 'PPTX missing ZIP signature' };
  const entries = listZipEntries(buf);
  if (!entries.has('ppt/presentation.xml'))return { valid: false, reason: 'PPTX missing ppt/presentation.xml' };
  if (!entries.has('[Content_Types].xml')) return { valid: false, reason: 'PPTX missing [Content_Types].xml' };
  return { valid: true };
}

function validatePDF(buf) {
  if (!isPDFMagic(buf)) return { valid: false, reason: 'PDF missing %PDF- header — file is not a valid PDF' };
  // Check for "%%EOF" marker somewhere in the last 2KB (allows for linearised PDFs)
  const tail = buf.slice(Math.max(0, buf.length - 2048)).toString('binary');
  if (!tail.includes('%%EOF')) return { valid: false, reason: 'PDF missing %%EOF trailer' };
  return { valid: true };
}

function validateJPEG(buf) {
  if (!isJPEGMagic(buf)) return { valid: false, reason: 'File does not have a valid JPEG signature' };
  return { valid: true };
}

function validatePNG(buf) {
  if (!isPNGMagic(buf)) return { valid: false, reason: 'File does not have a valid PNG signature' };
  return { valid: true };
}

function validateWEBP(buf) {
  if (!isWEBPMagic(buf)) return { valid: false, reason: 'File does not have a valid WEBP signature' };
  return { valid: true };
}

function validateMP4(buf) {
  if (!isISOBaseMagic(buf)) return { valid: false, reason: 'File does not have a valid MP4/ISO-base-media signature' };
  return { valid: true };
}

function validateMOV(buf) {
  if (!isISOBaseMagic(buf)) return { valid: false, reason: 'File does not have a valid MOV signature' };
  return { valid: true };
}

function validateCSV(buf) {
  // CSV: just verify it's printable text — no binary null bytes in first 512 bytes
  const sample = buf.slice(0, 512);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0x00) return { valid: false, reason: 'CSV contains binary null bytes — not a valid CSV' };
  }
  return { valid: true };
}

function validateTXT(buf) {
  const sample = buf.slice(0, 512);
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0x00) return { valid: false, reason: 'TXT file contains binary null bytes — suspicious' };
  }
  return { valid: true };
}

// ── Map extension → structure validator ───────────────────────────────────────

const STRUCTURE_VALIDATORS = {
  '.pdf':  validatePDF,
  '.docx': validateDOCX,
  '.xlsx': validateXLSX,
  '.pptx': validatePPTX,
  '.csv':  validateCSV,
  '.txt':  validateTXT,
  '.jpg':  validateJPEG,
  '.jpeg': validateJPEG,
  '.png':  validatePNG,
  '.webp': validateWEBP,
  '.mp4':  validateMP4,
  '.mov':  validateMOV,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Full four-layer file validation.
 *
 * @param {object} options
 * @param {Buffer}   options.buffer         - file bytes (required)
 * @param {string}   options.originalname   - original client filename
 * @param {string}   options.declaredMime   - MIME type declared by the client (file.mimetype)
 * @returns {{ valid: boolean, reason?: string, ext?: string }}
 */
function validateFile({ buffer, originalname, declaredMime }) {
  // ── Layer 1: extension allowlist ──────────────────────────────────────────
  const ext = path.extname(originalname || '').toLowerCase();

  if (!ext) return { valid: false, reason: 'File has no extension' };
  if (BLOCKED_EXTENSIONS.has(ext)) return { valid: false, reason: `File type "${ext}" is explicitly blocked` };
  if (!ALLOWED_EXTENSIONS.has(ext)) return { valid: false, reason: `File extension "${ext}" is not permitted` };

  // ── Layer 2: declared MIME type allowlist ─────────────────────────────────
  const allowedMimes = EXTENSION_MIME_MAP[ext];
  const normalMime   = (declaredMime || '').toLowerCase().split(';')[0].trim();
  if (!allowedMimes.includes(normalMime)) {
    return {
      valid:  false,
      reason: `MIME type "${normalMime}" is not permitted for extension "${ext}"`,
    };
  }

  // ── Layer 3: magic-byte inspection ────────────────────────────────────────
  if (!buffer || buffer.length < 4) return { valid: false, reason: 'File is too small to inspect' };

  let magicOk = false;
  switch (ext) {
    case '.pdf':              magicOk = isPDFMagic(buffer);      break;
    case '.docx':
    case '.xlsx':
    case '.pptx':             magicOk = isZipMagic(buffer);      break;
    case '.csv': case '.txt': magicOk = true;                    break;
    case '.jpg': case '.jpeg':magicOk = isJPEGMagic(buffer);    break;
    case '.png':              magicOk = isPNGMagic(buffer);      break;
    case '.webp':             magicOk = isWEBPMagic(buffer);     break;
    case '.mp4': case '.mov': magicOk = isISOBaseMagic(buffer);  break;
    default:                  magicOk = false;
  }

  if (!magicOk) {
    return {
      valid:  false,
      reason: `File content does not match declared type "${ext}" — magic bytes mismatch`,
    };
  }

  // ── Layer 4: internal structure verification ───────────────────────────────
  const structureValidator = STRUCTURE_VALIDATORS[ext];
  if (structureValidator) {
    const structResult = structureValidator(buffer);
    if (!structResult.valid) return structResult;
  }

  return { valid: true, ext };
}

module.exports = {
  validateFile,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  EXTENSION_MIME_MAP,
  // Exposed for tests
  _internals: {
    isPDFMagic, isZipMagic, isJPEGMagic, isPNGMagic,
    isWEBPMagic, isISOBaseMagic, listZipEntries,
    validateDOCX, validateXLSX, validatePPTX, validatePDF,
  },
};
