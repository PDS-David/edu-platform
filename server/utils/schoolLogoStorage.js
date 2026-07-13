'use strict';
/**
 * utils/schoolLogoStorage.js
 *
 * Shared by POST /api/schools/register, PATCH /api/schools/:id/logo, and
 * PATCH /api/schools/me/logo — one place for the save/delete logic so all
 * three routes behave identically instead of drifting apart.
 *
 * Deliberately NOT reusing resources' local-fallback directory
 * (server/uploads/resources) — that one is explicitly blocked from direct
 * access in server.js (must go through the authenticated /:id/download
 * route). A school logo is public branding shown as a plain <img src>, so
 * it needs to live somewhere the general `/uploads` static mount actually
 * serves — hence its own uploads/logos directory, same pattern as the
 * "thumbnails" the server.js comment already carves out an exception for.
 */

const fs   = require('fs');
const path = require('path');
const r2   = require('./r2Storage');

const LOGOS_DIR = path.join(__dirname, '..', 'uploads', 'logos');
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

// secureFile is req.secureFile as produced by middleware/uploadSecurity.js's
// createUploadMiddleware — already magic-byte validated and AV-scanned by
// the time it reaches here, same as every other upload in the app.
async function saveSchoolLogo(secureFile) {
  if (r2.isR2Enabled()) {
    const { url } = await r2.uploadBuffer({
      buffer:       secureFile.buffer,
      originalname: secureFile.storedName,
      mimetype:     secureFile.mimeType,
    });
    return url;
  }
  const diskPath = path.join(LOGOS_DIR, secureFile.storedName);
  fs.writeFileSync(diskPath, secureFile.buffer);
  return `/uploads/logos/${secureFile.storedName}`;
}

// Best-effort cleanup of the PREVIOUS logo when replacing one, or when a
// school is hard-deleted. Never throws — a failed cleanup shouldn't block
// the actual save/delete it's attached to; it just leaves an orphaned file,
// which is a cheap, recoverable problem compared to blocking the request.
async function deleteSchoolLogo(logoUrl) {
  if (!logoUrl) return;
  try {
    if (logoUrl.startsWith('/uploads/logos/')) {
      const filePath = path.join(LOGOS_DIR, path.basename(logoUrl));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else if (r2.isR2Enabled()) {
      await r2.deleteByUrl(logoUrl);
    }
  } catch (err) {
    console.warn('[schoolLogoStorage] cleanup failed (non-fatal):', err.message);
  }
}

module.exports = { saveSchoolLogo, deleteSchoolLogo };
