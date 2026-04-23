'use strict';
// server/services/pastPaperScraper.js
// ─────────────────────────────────────────────────────────────────────────────
// Generic past-paper PDF crawler.
//
// Takes a starting URL (provided by an admin), walks the page for direct PDF
// links — and optionally crawls one level of in-domain sub-pages — downloads
// each PDF, uploads it to R2 (or saves to local /uploads/past-papers as a
// fallback), and inserts a row into the existing `past_papers` table so it
// appears in the public Past Papers library automatically.
//
// Design notes
// ────────────
// • No third-party HTML parser is required: we use a small set of regexes to
//   extract <a href="…"> targets. Past-paper sites tend to expose PDFs as
//   plain links, so this is enough in practice and keeps the dependency
//   surface small (axios is already present).
// • Each scraped paper gets a `source_url` so re-runs are idempotent — the
//   same PDF URL is never re-imported twice.
// • Year detection: we try filename → URL → page-context, falling back to the
//   year_hint passed in by the caller.
// • Respect: we send a real User-Agent and a small concurrency limit so we
//   look like a normal browser, not a botnet. Admins are responsible for
//   verifying the source's terms of service.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const fs   = require('fs');
const url  = require('url');
const axios = require('axios');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const r2 = require('../utils/r2Storage');

const USER_AGENT =
  'Mozilla/5.0 (compatible; EAC-LearningBot/1.0; +https://eaclearning.com/bot)';

const MAX_PDFS_PER_RUN = 50;
const MAX_SUBPAGES     = 25;
const REQUEST_TIMEOUT  = 20000;

// ── one-time schema additions ──────────────────────────────────────────────
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS past_papers (
       id              SERIAL PRIMARY KEY,
       subject_id      INTEGER,
       exam_board      VARCHAR(50),
       year            INTEGER,
       paper_type      VARCHAR(50),
       title           VARCHAR(500) NOT NULL,
       file_url        TEXT,
       file_size_bytes BIGINT,
       created_by      UUID,
       created_at      TIMESTAMPTZ DEFAULT NOW()
     )`,
    `ALTER TABLE past_papers ADD COLUMN IF NOT EXISTS source_url TEXT`,
    `ALTER TABLE past_papers ADD COLUMN IF NOT EXISTS source_host VARCHAR(255)`,
    `ALTER TABLE past_papers ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ`,
    `CREATE UNIQUE INDEX IF NOT EXISTS past_papers_source_url_uniq
       ON past_papers (source_url) WHERE source_url IS NOT NULL`,
  ];
  for (const sql of stmts) {
    try { await sequelize.query(sql); }
    catch (e) { console.warn('[pastPaperScraper] ensureSchema:', e.message); }
  }
  schemaReady = true;
}

// ── HTML helpers ───────────────────────────────────────────────────────────
function extractHrefs(html) {
  // Capture every href / data-href value, regardless of attribute quoting.
  const out = new Set();
  const re = /\b(?:href|data-href)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = (m[1] || m[2] || m[3] || '').trim();
    if (v) out.add(v);
  }
  return [...out];
}

function absolutize(base, href) {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function isPdf(u) {
  if (!u) return false;
  const path = u.split('?')[0].split('#')[0].toLowerCase();
  return path.endsWith('.pdf');
}

function sameHost(a, b) {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
}

function guessYear(...candidates) {
  const re = /\b(19[7-9]\d|20[0-4]\d)\b/;
  for (const c of candidates) {
    if (!c) continue;
    const m = String(c).match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

function guessTitle(pdfUrl, anchorText) {
  if (anchorText && anchorText.trim()) return anchorText.trim().slice(0, 480);
  try {
    const filename = decodeURIComponent(new URL(pdfUrl).pathname.split('/').pop() || 'past-paper.pdf');
    return filename.replace(/[_+%-]/g, ' ').replace(/\.pdf$/i, '').trim().slice(0, 480) || 'Past Paper';
  } catch { return 'Past Paper'; }
}

// Also extract the anchor's text content so we get nicer titles.
function findAnchorTextForHref(html, href) {
  // Lazy: build a regex to find <a ... href="href">TEXT</a>
  const safe = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<a[^>]+href\\s*=\\s*["']?${safe}["']?[^>]*>([^<]{1,300})</a>`, 'i');
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// ── Network ────────────────────────────────────────────────────────────────
async function fetchHtml(targetUrl) {
  const r = await axios.get(targetUrl, {
    timeout: REQUEST_TIMEOUT,
    maxRedirects: 5,
    responseType: 'text',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
    },
    transformResponse: [(d) => d], // keep as raw string
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return String(r.data || '');
}

async function fetchPdfBuffer(pdfUrl) {
  const r = await axios.get(pdfUrl, {
    timeout: REQUEST_TIMEOUT * 2,
    maxRedirects: 5,
    responseType: 'arraybuffer',
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/pdf,*/*' },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const buf = Buffer.from(r.data);
  const ct  = String(r.headers?.['content-type'] || '').toLowerCase();
  // Some servers serve PDFs as octet-stream — accept those too as long as the
  // bytes start with %PDF-.
  const looksPdf = ct.includes('pdf') || buf.slice(0, 5).toString() === '%PDF-';
  if (!looksPdf) throw new Error(`Not a PDF: ${ct || 'unknown content-type'}`);
  return buf;
}

// ── Storage ────────────────────────────────────────────────────────────────
async function persistPdf(buffer, suggestedFilename) {
  const safeName = (suggestedFilename || 'past-paper.pdf')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  if (r2.isR2Enabled()) {
    const { url: fileUrl } = await r2.uploadBuffer({
      buffer,
      originalname: safeName,
      mimetype: 'application/pdf',
    });
    return { fileUrl, sizeBytes: buffer.length };
  }
  const dir = path.join(__dirname, '..', 'uploads', 'past-papers');
  fs.mkdirSync(dir, { recursive: true });
  const finalName = `${Date.now()}_${safeName}`;
  fs.writeFileSync(path.join(dir, finalName), buffer);
  return { fileUrl: `/uploads/past-papers/${finalName}`, sizeBytes: buffer.length };
}

// ── Insert (idempotent) ────────────────────────────────────────────────────
async function insertPaper(row) {
  const inserted = await sequelize.query(
    `INSERT INTO past_papers
       (subject_id, exam_board, year, paper_type, title,
        file_url, file_size_bytes, created_by,
        source_url, source_host, scraped_at, created_at)
     VALUES
       (:subject_id, :exam_board, :year, :paper_type, :title,
        :file_url, :file_size_bytes, :created_by,
        :source_url, :source_host, NOW(), NOW())
     ON CONFLICT (source_url) WHERE source_url IS NOT NULL
       DO NOTHING
     RETURNING id`,
    { replacements: row, type: QueryTypes.INSERT }
  );
  // INSERT returns [rows, count]; rows is empty on conflict.
  const id = inserted?.[0]?.[0]?.id || null;
  return id;
}

// ── Public entry point ─────────────────────────────────────────────────────
/**
 * Crawl a starting URL and import any PDFs found.
 *
 * @param {Object}  opts
 * @param {string}  opts.source_url   Seed URL to crawl.
 * @param {string=} opts.exam_board   Tag every imported paper (e.g. 'JAMB').
 * @param {number=} opts.subject_id   Tag every imported paper.
 * @param {string=} opts.paper_type   Tag every imported paper.
 * @param {number=} opts.year_hint    Fallback year if we can't infer one.
 * @param {boolean=}opts.follow_subpages  Crawl one level of in-domain links
 *                                        looking for more PDFs (default true).
 * @param {string=} opts.created_by   User id to attribute the import to.
 */
async function scrape(opts) {
  await ensureSchema();
  if (!opts || !opts.source_url) throw new Error('source_url is required');

  const seedUrl = opts.source_url;
  const followSub = opts.follow_subpages !== false;

  const seen      = new Set();          // PDF URLs we've already attempted
  const pdfQueue  = [];                  // {url, anchorText, pageUrl}
  const pageQueue = [seedUrl];           // HTML pages still to crawl
  const visited   = new Set();           // HTML pages we've already fetched

  const result = {
    seed: seedUrl,
    pages_crawled: 0,
    pdfs_found: 0,
    pdfs_imported: 0,
    pdfs_skipped_duplicate: 0,
    pdfs_failed: 0,
    failures: [],
    imported_ids: [],
  };

  // ── Page crawl phase ─────────────────────────────────────────────────────
  while (pageQueue.length && visited.size < (followSub ? MAX_SUBPAGES + 1 : 1)) {
    const pageUrl = pageQueue.shift();
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    let html;
    try { html = await fetchHtml(pageUrl); }
    catch (e) {
      result.failures.push({ url: pageUrl, kind: 'page', error: e.message });
      continue;
    }
    result.pages_crawled++;

    const hrefs = extractHrefs(html);
    for (const raw of hrefs) {
      const abs = absolutize(pageUrl, raw);
      if (!abs) continue;
      if (isPdf(abs)) {
        if (!seen.has(abs)) {
          seen.add(abs);
          pdfQueue.push({
            url: abs,
            anchorText: findAnchorTextForHref(html, raw),
            pageUrl,
          });
        }
      } else if (followSub && visited.size === 1 && sameHost(abs, seedUrl)) {
        // Only enqueue sub-pages from the seed page itself, and only on the
        // same host. Keeps the crawl tightly scoped.
        if (!visited.has(abs) && !pageQueue.includes(abs)) pageQueue.push(abs);
      }
    }
  }

  result.pdfs_found = pdfQueue.length;

  // ── PDF download phase ───────────────────────────────────────────────────
  for (const { url: pdfUrl, anchorText, pageUrl } of pdfQueue.slice(0, MAX_PDFS_PER_RUN)) {
    try {
      // Quick existence check to skip duplicates without downloading.
      const existing = await sequelize.query(
        `SELECT id FROM past_papers WHERE source_url = :u LIMIT 1`,
        { replacements: { u: pdfUrl }, type: QueryTypes.SELECT }
      );
      if (existing.length) { result.pdfs_skipped_duplicate++; continue; }

      const buf = await fetchPdfBuffer(pdfUrl);
      const filename = decodeURIComponent(new URL(pdfUrl).pathname.split('/').pop() || 'past-paper.pdf');
      const { fileUrl, sizeBytes } = await persistPdf(buf, filename);

      const title = guessTitle(pdfUrl, anchorText);
      const year  = guessYear(filename, pdfUrl, anchorText, pageUrl) || opts.year_hint || null;

      const id = await insertPaper({
        subject_id:      opts.subject_id || null,
        exam_board:      opts.exam_board || null,
        year,
        paper_type:      opts.paper_type || null,
        title,
        file_url:        fileUrl,
        file_size_bytes: sizeBytes,
        created_by:      opts.created_by || null,
        source_url:      pdfUrl,
        source_host:     (() => { try { return new URL(pdfUrl).host; } catch { return null; } })(),
      });

      if (id) {
        result.pdfs_imported++;
        result.imported_ids.push(id);
      } else {
        // Unique conflict: a parallel run beat us to it.
        result.pdfs_skipped_duplicate++;
      }
    } catch (err) {
      result.pdfs_failed++;
      result.failures.push({ url: pdfUrl, kind: 'pdf', error: err.message });
    }
  }

  return result;
}

module.exports = { scrape };
