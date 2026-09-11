'use strict';
// server/utils/documentTextExtractor.js
// Shared PDF/DOCX/TXT/MD text extraction, extracted from
// resourceQuestionExtractor.js (where this logic previously lived as
// private, unexported functions) so it can be reused by the syllabus
// extraction feature (server/services/syllabusExtractor.js) without
// duplicating the same file-fetching/parsing logic a second time.
// resourceQuestionExtractor.js now imports from here too — behavior
// unchanged, just relocated.

const path = require('path');
const fs   = require('fs');

const DEFAULT_MAX_CHARS = 12000;

// ── extractTextFromBuffer ────────────────────────────────────────────────────
// Works even if pdf-parse/mammoth aren't installed — returns '' rather than
// throwing, so a caller can distinguish "no text" from "crashed", and decide
// for itself whether that's a hard failure (syllabus extraction should treat
// it as one — see syllabusExtractor.js) or a soft one (resourceQuestionExtractor
// falls back to title + curriculum context instead of failing outright).
async function extractTextFromBuffer(buf, ext, maxChars = DEFAULT_MAX_CHARS) {
  try {
    if (ext === '.pdf') {
      // BUG FIX, confirmed live before fixing (not assumed from a version
      // number alone): pdf-parse@1.1.4's calling convention (`pdfParse(buf)`)
      // is what this branch used to call, but its bundled legacy pdf.js
      // parser fails on ANY real PDF in this Node 22 environment —
      // reproduced with an independently-validated, genuinely well-formed
      // PDF (confirmed readable by a separate trusted parser), which still
      // threw "bad XRef entry" here. Not a corrupt-file problem; a
      // dependency-version problem. Switched to pdf-parse v2's actively
      // maintained API (`new PDFParse({ data }).getText()`, matching its
      // README's migration example) and re-verified against the same PDF.
      const pdfModule = safeRequire('pdf-parse');
      if (!pdfModule || !pdfModule.PDFParse) return '';
      const parser = new pdfModule.PDFParse({ data: buf });
      try {
        const result = await parser.getText();
        return (result?.text || '').slice(0, maxChars);
      } finally {
        await parser.destroy(); // v2 README: always call to free memory
      }
    }
    if (ext === '.docx') {
      const mammoth = safeRequire('mammoth');
      if (!mammoth) return '';
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return (value || '').slice(0, maxChars);
    }
    if (['.txt', '.md'].includes(ext)) {
      return buf.toString('utf8').slice(0, maxChars);
    }
  } catch (err) {
    console.warn('[documentTextExtractor] text extraction failed:', err.message);
    throw err; // re-thrown, unlike the original private version — callers
               // that need to distinguish "genuinely corrupt file" from
               // "empty/unsupported format" (syllabusExtractor.js does; see
               // its failure_reason handling) need the real error, not a
               // silently-swallowed ''.
  }
  return '';
}

// ── readFileAsTextFromUrl ─────────────────────────────────────────────────────
// Same three URL cases resourceQuestionExtractor.js already handled (local
// disk, R2 proxy URL, public R2/CDN absolute URL) — generalized to take a
// plain file_url string rather than a whole `resource` row, since
// syllabus_documents has file_url directly rather than wrapped in a
// resource object.
async function readFileAsTextFromUrl(fileUrl, maxChars = DEFAULT_MAX_CHARS) {
  const url = fileUrl || '';
  const ext = path.extname(url.split('?')[0]).toLowerCase();

  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    const localPath = path.join(__dirname, '..', url.replace(/^\//, ''));
    if (!fs.existsSync(localPath)) return '';
    return extractTextFromBuffer(await fs.promises.readFile(localPath), ext, maxChars);
  }

  // BUG FIX: this used to also check a speculative '/api/syllabus/r2/'
  // prefix, on the assumption syllabus uploads might get their own proxy
  // URL shape. Confirmed via r2Storage.js's proxyUrlFor(): it's hardcoded
  // to always return `/api/resources/r2/${key}` regardless of which
  // feature called uploadBuffer() — "resources" in the path is just this
  // shared utility's naming, not a claim the file lives in the resources
  // table. Syllabus files uploaded via r2.uploadBuffer() get this exact
  // same prefix too, so the '/api/syllabus/r2/' branch was dead code that
  // could never actually fire. Note also: this doesn't make an HTTP
  // request to that path at all — it only uses the URL string to extract
  // the R2 key (stripping the prefix below), then reads the object
  // directly via the AWS SDK (r2.getObjectByKey), server-side — so this
  // is unaffected by GET /r2/*'s removal elsewhere in this app (ACCESS-01
  // remediation, see resourceRoutes.js's own header comment): there was
  // never an HTTP call here to break.
  if (url.startsWith('/api/resources/r2/')) {
    const r2 = require('./r2Storage');
    if (!r2.isR2Enabled()) return '';
    const key = decodeURIComponent(url.slice('/api/resources/r2/'.length));
    const obj = await r2.getObjectByKey(key);
    const chunks = [];
    for await (const chunk of obj.body) chunks.push(chunk);
    return extractTextFromBuffer(Buffer.concat(chunks), ext, maxChars);
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const fetcher = url.startsWith('https') ? require('https') : require('http');
    const buf = await new Promise((resolve, reject) => {
      fetcher.get(url, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
    return extractTextFromBuffer(buf, ext, maxChars);
  }

  return '';
}

function safeRequire(name) {
  try { return require(name); } catch { return null; }
}

module.exports = { extractTextFromBuffer, readFileAsTextFromUrl, safeRequire };
