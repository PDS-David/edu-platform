// server/middleware/videoAudit.js
// ─────────────────────────────────────────────────────────────────────────────
// Audit logging for video events.
//
// Events emitted:
//   VIDEO_ACCESS_DENIED   — auth/tier/enrollment check failed
//   VIDEO_PLAYBACK_START  — master.m3u8 served successfully
//   VIDEO_PLAYBACK_COMPLETE — progress saved with watch_percentage >= 90
//   VIDEO_KEY_SERVED      — AES-128 key delivered
//   VIDEO_SEGMENT_SERVED  — TS segment delivered (sampled 1-in-10 to reduce noise)
//
// All events are written to Winston at 'info' level. In production Winston
// writes to combined.log; connect a SIEM to that file for alerting.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────────────────────
// auditLog(event, req, extra)
// Thin structured-log wrapper so every audit entry has the same shape.
// ─────────────────────────────────────────────────────────────────────────────
function auditLog(event, req, extra = {}) {
  logger.info(`[AUDIT] ${event}`, {
    event,
    userId:    req.user?.id    ?? null,
    userRole:  req.user?.role  ?? null,
    userEmail: req.user?.email ?? null,
    ip:        req.ip,
    ua:        req.headers['user-agent'] ?? null,
    path:      req.originalUrl,
    requestId: req.id ?? null,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// auditAccessDenied(reason)
// Middleware factory — logs a denial then continues to the next handler
// (which will send the 403). Place BEFORE the real handler on denied paths.
// ─────────────────────────────────────────────────────────────────────────────
function auditAccessDenied(reason) {
  return (req, _res, next) => {
    auditLog('VIDEO_ACCESS_DENIED', req, { reason });
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// auditPlaybackStart(videoId)
// Call after a successful master playlist serve.
// ─────────────────────────────────────────────────────────────────────────────
function auditPlaybackStart(req, videoId) {
  auditLog('VIDEO_PLAYBACK_START', req, { videoId });
}

// ─────────────────────────────────────────────────────────────────────────────
// auditPlaybackComplete(videoId)
// Call when watch_percentage >= 90 on a progress save.
// ─────────────────────────────────────────────────────────────────────────────
function auditPlaybackComplete(req, videoId) {
  auditLog('VIDEO_PLAYBACK_COMPLETE', req, { videoId });
}

// ─────────────────────────────────────────────────────────────────────────────
// auditKeyServed(req, videoId, keyId)
// ─────────────────────────────────────────────────────────────────────────────
function auditKeyServed(req, videoId, keyId) {
  auditLog('VIDEO_KEY_SERVED', req, { videoId, keyId });
}

// ─────────────────────────────────────────────────────────────────────────────
// auditSegmentServed(req, videoId, segment)
// Sampled 1-in-10 to keep log volume manageable.
// ─────────────────────────────────────────────────────────────────────────────
function auditSegmentServed(req, videoId, segment) {
  if (Math.random() < 0.1) {
    auditLog('VIDEO_SEGMENT_SERVED', req, { videoId, segment });
  }
}

module.exports = {
  auditLog,
  auditAccessDenied,
  auditPlaybackStart,
  auditPlaybackComplete,
  auditKeyServed,
  auditSegmentServed,
};
