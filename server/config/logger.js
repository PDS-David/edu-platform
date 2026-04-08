// server/config/logger.js
// ─────────────────────────────────────────────────────────────────────────────
// Winston logger singleton for the EAC Learning Platform.
//
// Transports:
//   development  — colourised, single-line text to stdout only
//   production   — JSON to stdout + rotating files under server/logs/
//
// Log levels (Winston default hierarchy):
//   error (0) > warn (1) > info (2) > http (3) > debug (4)
//
// The active level is driven by LOG_LEVEL in .env (defaults: 'http' in dev,
// 'warn' in production so info/http are silent unless overridden).
//
// Usage anywhere in the server:
//   const logger = require('./config/logger');
//   logger.info('Something happened', { extra: 'context' });
//   logger.error('Boom', { err });
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const path    = require('path');
const winston = require('winston');

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';
const LOG_LEVEL    = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'http');
const LOG_DIR      = path.join(__dirname, '..', 'logs');

// ── Dev format — human-readable single line ───────────────────────────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, requestId, ...rest }) => {
    const rid  = requestId ? ` [${requestId}]` : '';
    const meta = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
    return `${timestamp}${rid} ${level}: ${message}${meta}`;
  })
);

// ── Production format — structured JSON one-liner per entry ──────────────────
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ── Transports ────────────────────────────────────────────────────────────────
const transports = [
  new winston.transports.Console({
    format: isProduction ? prodFormat : devFormat,
  }),
];

if (isProduction) {
  transports.push(
    // All logs at warn+ go to combined.log
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format:   prodFormat,
      maxsize:  10 * 1024 * 1024,  // 10 MB before rotation
      maxFiles: 7,
      tailable: true,
    }),
    // Errors only, separate file — easier to tail in production
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level:    'error',
      format:   prodFormat,
      maxsize:  10 * 1024 * 1024,
      maxFiles: 14,
      tailable: true,
    })
  );
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level:            LOG_LEVEL,
  defaultMeta:      { service: 'eac-api' },
  transports,
  exceptionHandlers: [
    new winston.transports.Console({ format: isProduction ? prodFormat : devFormat }),
    ...(isProduction
      ? [new winston.transports.File({ filename: path.join(LOG_DIR, 'exceptions.log'), format: prodFormat })]
      : []),
  ],
  rejectionHandlers: [
    new winston.transports.Console({ format: isProduction ? prodFormat : devFormat }),
    ...(isProduction
      ? [new winston.transports.File({ filename: path.join(LOG_DIR, 'rejections.log'), format: prodFormat })]
      : []),
  ],
});

module.exports = logger;
