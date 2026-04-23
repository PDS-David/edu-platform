'use strict';

/**
 * Cloudflare R2 storage helper.
 *
 * Reads these env vars (set them on Render → AISchoolonair-api → Environment):
 *   R2_ACCOUNT_ID         e.g. abc123def456...
 *   R2_ACCESS_KEY_ID      from Cloudflare R2 → Manage R2 API Tokens
 *   R2_SECRET_ACCESS_KEY  from the same screen
 *   R2_BUCKET             your bucket name, e.g. aischoolonair-uploads
 *   R2_PUBLIC_BASE_URL    public URL prefix WITHOUT trailing slash,
 *                         e.g. https://pub-xxxxxxxx.r2.dev
 *                         or   https://files.aischoolonair.com
 *
 * If any of the first four are missing, isR2Enabled() returns false and the
 * upload routes will silently fall back to local disk storage so nothing breaks.
 */

const path = require('path');
const crypto = require('crypto');

let _client = null;
let _S3 = null;

function isR2Enabled() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

function getClient() {
  if (_client) return _client;
  if (!isR2Enabled()) return null;

  // Lazy-require so the dep is optional until configured
  _S3 = _S3 || require('@aws-sdk/client-s3');

  _client = new _S3.S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    // R2 requires path-style addressing for some operations; SDK default works.
  });
  return _client;
}

function publicUrlFor(key) {
  const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/${key}`;
}

function buildKey(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  const stamp = Date.now();
  const rand = crypto.randomBytes(6).toString('hex');
  return `resources/${stamp}-${rand}${ext}`;
}

async function uploadBuffer({ buffer, originalname, mimetype }) {
  if (!isR2Enabled()) throw new Error('R2 is not configured');
  _S3 = _S3 || require('@aws-sdk/client-s3');

  const key = buildKey(originalname);

  await getClient().send(new _S3.PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype || 'application/octet-stream',
    ContentDisposition: `inline; filename="${(originalname || 'file').replace(/"/g, '')}"`,
  }));

  return {
    key,
    url: publicUrlFor(key) || key,
  };
}

async function deleteByUrl(fileUrl) {
  if (!isR2Enabled() || !fileUrl) return false;
  _S3 = _S3 || require('@aws-sdk/client-s3');

  const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  let key = null;
  if (base && fileUrl.startsWith(base + '/')) {
    key = fileUrl.slice(base.length + 1);
  } else if (/^https?:\/\/.+\/resources\//.test(fileUrl)) {
    // Best-effort: take everything after the last "resources/"
    const m = fileUrl.match(/\/(resources\/[^?#]+)/);
    if (m) key = m[1];
  }

  if (!key) return false;

  try {
    await getClient().send(new _S3.DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    }));
    return true;
  } catch (err) {
    console.warn('[r2 delete]', err.message);
    return false;
  }
}

module.exports = { isR2Enabled, uploadBuffer, deleteByUrl };
