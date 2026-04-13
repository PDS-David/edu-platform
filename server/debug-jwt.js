// server/debug-jwt.js
// ─────────────────────────────────────────────────────────────────────────────
// Development-only utility to verify a JWT against JWT_SECRET.
// Usage: JWT_TOKEN=<token> node server/debug-jwt.js
//     OR node server/debug-jwt.js <token>
//
// NEVER run this in production — the guard below prevents it.
// NEVER hardcode real tokens in this file — pass via env var or CLI arg.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

require('dotenv').config();

// ── Production guard ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  console.error('[debug-jwt] This script must not be run in production. Exiting.');
  process.exit(1);
}

const jwt = require('jsonwebtoken');

// Accept token from env var or first CLI argument — never hardcoded
const token = process.env.JWT_TOKEN || process.argv[2];

if (!token) {
  console.error('[debug-jwt] No token provided.');
  console.error('Usage: JWT_TOKEN=<token> node server/debug-jwt.js');
  console.error('    OR node server/debug-jwt.js <token>');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('[debug-jwt] JWT_SECRET is not set in environment. Check your .env file.');
  process.exit(1);
}

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log('[debug-jwt] VALID TOKEN');
  console.log(decoded);
} catch (err) {
  console.error('[debug-jwt] INVALID TOKEN');
  console.error(err.message);
}
