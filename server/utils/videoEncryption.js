// server/utils/videoEncryption.js
// ─────────────────────────────────────────────────────────────────────────────
// Encrypts raw MP4 videos into AES-128 HLS streams using FFmpeg.
//
// Prerequisites (install once):
//   Windows:  choco install ffmpeg   OR  download from https://ffmpeg.org/download.html
//   Add ffmpeg to PATH, then verify: ffmpeg -version
//
// npm install:  npm install fluent-ffmpeg uuid crypto-js
//
// Output structure per video:
//   uploads/videos/hls/{videoId}/
//     ├── master.m3u8          ← main playlist (served to player)
//     ├── enc.key              ← AES-128 key (served via /api/videos/key/:keyId)
//     ├── enc.keyinfo          ← ffmpeg keyinfo file (temp, not served)
//     └── segment_000.ts       ← encrypted TS segments
// ─────────────────────────────────────────────────────────────────────────────

const ffmpeg      = require('fluent-ffmpeg');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const { v4: uuidv4 } = require('uuid');

// ── Base directory for all HLS output ────────────────────────────────────────
const HLS_BASE = path.join(__dirname, '..', 'uploads', 'videos', 'hls');

// ── Ensure base directory exists ──────────────────────────────────────────────
if (!fs.existsSync(HLS_BASE)) {
  fs.mkdirSync(HLS_BASE, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// generateEncryptionKey()
// Creates a 16-byte AES-128 key and saves it to disk.
// Returns: { keyId, keyPath, keyHex }
// ─────────────────────────────────────────────────────────────────────────────
function generateEncryptionKey(outputDir) {
  const keyId  = uuidv4().replace(/-/g, '');          // unique key identifier
  const keyPath = path.join(outputDir, 'enc.key');
  const keyBuffer = crypto.randomBytes(16);             // 128-bit AES key

  fs.writeFileSync(keyPath, keyBuffer);

  return {
    keyId,
    keyPath,
    keyHex: keyBuffer.toString('hex'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createKeyInfoFile()
// Writes the .keyinfo file that FFmpeg reads to apply HLS encryption.
// Format:
//   Line 1: Key URI  (URL the player calls to fetch the key)
//   Line 2: Key file path (local path FFmpeg reads)
//   Line 3: IV (optional — we omit for auto-IV per segment)
// ─────────────────────────────────────────────────────────────────────────────
function createKeyInfoFile(outputDir, keyId, keyPath, serverBaseUrl) {
  const keyUrl      = `${serverBaseUrl}/api/videos/key/${keyId}`;
  const keyInfoPath = path.join(outputDir, 'enc.keyinfo');
  const content     = `${keyUrl}\n${keyPath}\n`;

  fs.writeFileSync(keyInfoPath, content);
  return keyInfoPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// encryptVideo(options)
//
// Main function — converts an MP4 to AES-128 encrypted HLS.
//
// @param {Object} options
//   inputPath    {string}  Absolute path to source MP4
//   videoId      {number}  Database video ID (used for output folder name)
//   serverBaseUrl {string} e.g. 'http://localhost:5000'
//
// @returns {Promise<Object>}
//   { playlistUrl, keyId, outputDir, segmentCount }
// ─────────────────────────────────────────────────────────────────────────────
function encryptVideo({ inputPath, videoId, serverBaseUrl }) {
  return new Promise((resolve, reject) => {

    // ── 1. Create output directory ──────────────────────────────────────────
    const outputDir = path.join(HLS_BASE, String(videoId));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // ── 2. Generate AES-128 key ─────────────────────────────────────────────
    const { keyId, keyPath } = generateEncryptionKey(outputDir);

    // ── 3. Write keyinfo file ───────────────────────────────────────────────
    const keyInfoPath = createKeyInfoFile(outputDir, keyId, keyPath, serverBaseUrl);

    // ── 4. Output playlist path ─────────────────────────────────────────────
    const playlistPath = path.join(outputDir, 'master.m3u8');

    // ── 5. Run FFmpeg ───────────────────────────────────────────────────────
    ffmpeg(inputPath)
      .outputOptions([
        '-profile:v baseline',          // max browser compatibility
        '-level 3.0',
        '-start_number 0',
        '-hls_time 10',                 // 10-second segments
        '-hls_list_size 0',             // keep all segments in playlist
        '-hls_key_info_file', keyInfoPath,
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        '-f hls',
      ])
      .output(playlistPath)
      .on('start', (cmd) => {
        console.log(`[VideoEncryption] FFmpeg started for video ${videoId}`);
        console.log(`[VideoEncryption] Command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[VideoEncryption] Video ${videoId}: ${Math.round(progress.percent)}% done`);
        }
      })
      .on('end', () => {
        // Count generated segments
        const segments = fs.readdirSync(outputDir)
          .filter(f => f.endsWith('.ts'));

        // Relative URL for database storage
        const playlistUrl = `/uploads/videos/hls/${videoId}/master.m3u8`;

        console.log(`[VideoEncryption]  Video ${videoId} encrypted. ${segments.length} segments.`);

        resolve({
          playlistUrl,
          keyId,
          outputDir,
          segmentCount: segments.length,
        });
      })
      .on('error', (err) => {
        console.error(`[VideoEncryption]  FFmpeg error for video ${videoId}:`, err.message);
        reject(new Error(`FFmpeg encryption failed: ${err.message}`));
      })
      .run();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// getEncryptionKey(keyId)
//
// Reads the AES-128 key bytes from disk for a given keyId.
// Called by the /api/videos/key/:keyId endpoint.
//
// @param {string} keyId   — the key identifier stored in videos.encryption_key_id
// @param {number} videoId — needed to locate the file on disk
// @returns {Buffer|null}
// ─────────────────────────────────────────────────────────────────────────────
function getEncryptionKey(videoId) {
  const keyPath = path.join(HLS_BASE, String(videoId), 'enc.key');
  if (!fs.existsSync(keyPath)) return null;
  return fs.readFileSync(keyPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// deleteVideoFiles(videoId)
//
// Removes all HLS output for a video (cleanup on deletion).
// ─────────────────────────────────────────────────────────────────────────────
function deleteVideoFiles(videoId) {
  const outputDir = path.join(HLS_BASE, String(videoId));
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log(`[VideoEncryption] Deleted HLS files for video ${videoId}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getVideoDuration(inputPath)
//
// Uses FFmpeg to probe the duration of a video file in seconds.
// @returns {Promise<number>}
// ─────────────────────────────────────────────────────────────────────────────
function getVideoDuration(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const duration = Math.round(metadata.format.duration || 0);
      resolve(duration);
    });
  });
}

module.exports = {
  encryptVideo,
  getEncryptionKey,
  deleteVideoFiles,
  getVideoDuration,
  HLS_BASE,
};
