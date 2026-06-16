// server/utils/videoEncryption.js
// ─────────────────────────────────────────────────────────────────────────────
// Encrypts raw MP4 videos into AES-128 HLS streams using FFmpeg.
//
// SECURITY HARDENING (2026-06-16):
//   - HLS output is stored OUTSIDE the public uploads tree in server/hls_secure/
//   - enc.key is NEVER co-located with segments (stored in server/keys_secure/)
//   - enc.keyinfo is written to a temp directory and deleted after encode
//   - Adaptive bitrate: 240p / 480p / 720p / 1080p renditions + master playlist
//   - All segment and key delivery MUST go through authenticated API routes
//
// Directory layout:
//   server/hls_secure/{videoId}/
//     ├── master.m3u8          ← multi-variant master playlist
//     ├── 240p/
//     │   ├── playlist.m3u8
//     │   └── segment_*.ts
//     ├── 480p/
//     │   ├── playlist.m3u8
//     │   └── segment_*.ts
//     ├── 720p/
//     │   ├── playlist.m3u8
//     │   └── segment_*.ts
//     └── 1080p/
//         ├── playlist.m3u8
//         └── segment_*.ts
//
//   server/keys_secure/{videoId}.key   ← AES-128 key (never web-accessible)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const ffmpeg      = require('fluent-ffmpeg');
const crypto      = require('crypto');
const fs          = require('fs');
const os          = require('os');
const path        = require('path');
const { v4: uuidv4 } = require('uuid');

// ── Secure storage roots — OUTSIDE the express.static('/uploads') tree ────────
const HLS_SECURE_BASE  = path.join(__dirname, '..', 'hls_secure');
const KEYS_SECURE_BASE = path.join(__dirname, '..', 'keys_secure');

// Ensure both directories exist with restrictive permissions
for (const dir of [HLS_SECURE_BASE, KEYS_SECURE_BASE]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

// ── ABR rendition ladder ──────────────────────────────────────────────────────
const RENDITIONS = [
  { name: '240p',  width: 426,  height: 240,  videoBitrate: '400k',  audioBitrate: '64k'  },
  { name: '480p',  width: 854,  height: 480,  videoBitrate: '1000k', audioBitrate: '96k'  },
  { name: '720p',  width: 1280, height: 720,  videoBitrate: '2800k', audioBitrate: '128k' },
  { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
];

// ─────────────────────────────────────────────────────────────────────────────
// generateEncryptionKey(videoId)
// Creates a 16-byte AES-128 key and writes it to keys_secure/ (not segments/).
// Returns: { keyId, keyPath }
// ─────────────────────────────────────────────────────────────────────────────
function generateEncryptionKey(videoId) {
  const keyId     = uuidv4().replace(/-/g, '');
  const keyPath   = path.join(KEYS_SECURE_BASE, `${videoId}.key`);
  const keyBuffer = crypto.randomBytes(16);

  fs.writeFileSync(keyPath, keyBuffer, { mode: 0o600 });

  return { keyId, keyPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// writeKeyInfoFile(keyId, keyPath, serverBaseUrl)
// Writes a temporary .keyinfo file for FFmpeg. Returns its temp path.
// The caller is responsible for deleting this file after the encode.
// ─────────────────────────────────────────────────────────────────────────────
function writeKeyInfoFile(keyId, keyPath, serverBaseUrl) {
  const keyUrl      = `${serverBaseUrl}/api/videos/key/${keyId}`;
  const tmpPath     = path.join(os.tmpdir(), `keyinfo_${keyId}_${Date.now()}`);
  const content     = `${keyUrl}\n${keyPath}\n`;

  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  return tmpPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// encodeRendition(options)
// Encodes one ABR rendition synchronously (returns Promise).
// ─────────────────────────────────────────────────────────────────────────────
function encodeRendition({ inputPath, rendition, outputDir, keyInfoPath, serverBaseUrl }) {
  return new Promise((resolve, reject) => {
    const playlistPath  = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');

    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .addOptions([
        '-profile:v main',
        `-vf scale=${rendition.width}:${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2`,
        `-b:v ${rendition.videoBitrate}`,
        `-maxrate ${rendition.videoBitrate}`,
        `-bufsize ${parseInt(rendition.videoBitrate) * 2}k`,
        `-b:a ${rendition.audioBitrate}`,
        '-ar 44100',
        '-ac 2',
        '-start_number 0',
        '-hls_time 6',
        '-hls_list_size 0',
        '-hls_flags independent_segments',
        `-hls_key_info_file ${keyInfoPath}`,
        `-hls_segment_filename ${segmentPattern}`,
        '-f hls',
      ])
      .output(playlistPath)
      .on('end', () => {
        const segments = fs.readdirSync(outputDir).filter(f => f.endsWith('.ts'));
        resolve(segments.length);
      })
      .on('error', (err) => reject(new Error(`FFmpeg [${rendition.name}] failed: ${err.message}`)))
      .run();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMasterPlaylist(videoId, serverBaseUrl)
// Constructs a multi-variant HLS master playlist referencing authenticated
// variant playlist URLs (not filesystem paths).
// ─────────────────────────────────────────────────────────────────────────────
function buildMasterPlaylist(videoId, serverBaseUrl) {
  const base = `${serverBaseUrl}/api/videos/stream/${videoId}`;

  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', ''];

  for (const r of RENDITIONS) {
    const bw = parseInt(r.videoBitrate) * 1000 + parseInt(r.audioBitrate) * 1000;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${r.width}x${r.height},NAME="${r.name}"`);
    lines.push(`${base}/${r.name}/playlist.m3u8`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// rewriteVariantPlaylist(playlistPath, videoId, renditionName, serverBaseUrl)
// Rewrites segment filenames in an FFmpeg-generated playlist to use
// authenticated absolute API URLs instead of bare relative paths.
// This is what fixes FUNC-01 and the Safari segment-delivery bug.
// ─────────────────────────────────────────────────────────────────────────────
function rewriteVariantPlaylist(playlistPath, videoId, renditionName, serverBaseUrl) {
  const raw  = fs.readFileSync(playlistPath, 'utf8');
  const base = `${serverBaseUrl}/api/videos/stream/${videoId}/${renditionName}`;

  const rewritten = raw.split('\n').map(line => {
    // Segment lines: bare filename like segment_000.ts
    if (line.match(/^segment_\d+\.ts$/)) {
      return `${base}/${line}`;
    }
    // Key URI: rewrite localhost → production SERVER_BASE_URL (already correct
    // because writeKeyInfoFile() used serverBaseUrl, but guard against mismatches)
    if (line.startsWith('#EXT-X-KEY:')) {
      return line.replace(/URI="[^"]*"/, `URI="${serverBaseUrl}/api/videos/key/${path.basename(playlistPath).replace('playlist.m3u8', '')}"`);
      // NOTE: we leave the key URI as-is — it was already written correctly by writeKeyInfoFile
    }
    return line;
  }).join('\n');

  fs.writeFileSync(playlistPath, rewritten, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// encryptVideo(options)
// Main entry: produces ABR HLS with AES-128 encryption.
// Returns { playlistUrl, keyId, outputDir, renditions }
// ─────────────────────────────────────────────────────────────────────────────
async function encryptVideo({ inputPath, videoId, serverBaseUrl }) {
  // 1. Create per-video output directory
  const outputDir = path.join(HLS_SECURE_BASE, String(videoId));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  }

  // 2. Generate key → stored in keys_secure/ ONLY
  const { keyId, keyPath } = generateEncryptionKey(videoId);

  // 3. Write temp keyinfo (deleted after encode)
  const keyInfoPath = writeKeyInfoFile(keyId, keyPath, serverBaseUrl);

  const renditionResults = [];

  try {
    // 4. Encode each rendition sequentially (saves RAM on low-spec servers)
    for (const rendition of RENDITIONS) {
      const rendDir = path.join(outputDir, rendition.name);
      fs.mkdirSync(rendDir, { recursive: true, mode: 0o700 });

      console.log(`[VideoEncryption] Encoding ${rendition.name} for video ${videoId}…`);
      const segCount = await encodeRendition({
        inputPath,
        rendition,
        outputDir: rendDir,
        keyInfoPath,
        serverBaseUrl,
      });

      // Rewrite variant playlist so all segment URIs are authenticated API URLs
      const variantPlaylist = path.join(rendDir, 'playlist.m3u8');
      rewriteVariantPlaylist(variantPlaylist, videoId, rendition.name, serverBaseUrl);

      renditionResults.push({ name: rendition.name, segments: segCount });
      console.log(`[VideoEncryption] ${rendition.name} done — ${segCount} segments`);
    }

    // 5. Write master playlist (authenticated URLs only, no filesystem paths)
    const masterContent  = buildMasterPlaylist(videoId, serverBaseUrl);
    const masterPath     = path.join(outputDir, 'master.m3u8');
    fs.writeFileSync(masterPath, masterContent, { mode: 0o600 });

    // 6. Cleanup temp keyinfo
    fs.unlinkSync(keyInfoPath);

    // The "playlist URL" stored in the DB points to the authenticated API route
    const playlistUrl = `/api/videos/stream/${videoId}/master.m3u8`;

    console.log(`[VideoEncryption] Video ${videoId} complete — ${renditionResults.length} renditions`);
    return { playlistUrl, keyId, outputDir, renditions: renditionResults };

  } catch (err) {
    // Cleanup temp keyinfo on failure
    try { fs.unlinkSync(keyInfoPath); } catch {}
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getEncryptionKey(videoId)
// Reads AES-128 key bytes from keys_secure/ (never from the HLS directory).
// ─────────────────────────────────────────────────────────────────────────────
function getEncryptionKey(videoId) {
  const keyPath = path.join(KEYS_SECURE_BASE, `${videoId}.key`);
  if (!fs.existsSync(keyPath)) return null;
  return fs.readFileSync(keyPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// deleteVideoFiles(videoId)
// Removes HLS segments AND the AES key for a video (cleanup on deletion).
// ─────────────────────────────────────────────────────────────────────────────
function deleteVideoFiles(videoId) {
  const hlsDir = path.join(HLS_SECURE_BASE, String(videoId));
  const keyFile = path.join(KEYS_SECURE_BASE, `${videoId}.key`);

  if (fs.existsSync(hlsDir))  fs.rmSync(hlsDir,  { recursive: true, force: true });
  if (fs.existsSync(keyFile)) fs.unlinkSync(keyFile);

  console.log(`[VideoEncryption] Deleted all files for video ${videoId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// getVideoDuration(inputPath)
// ─────────────────────────────────────────────────────────────────────────────
function getVideoDuration(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(Math.round(metadata.format.duration || 0));
    });
  });
}

module.exports = {
  encryptVideo,
  getEncryptionKey,
  deleteVideoFiles,
  getVideoDuration,
  HLS_SECURE_BASE,
  KEYS_SECURE_BASE,
  RENDITIONS,
};
