'use strict';

// utils/jwt.js
// DO NOT call require('dotenv').config() here — server.js owns dotenv loading.

const jwt = require('jsonwebtoken');

const ISSUER = 'edu-platform';

// Resolved lazily at call-time so safeRequire() in server.js can load this
// module without crashing when env vars haven't been injected yet.
const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET in environment variables');
  return secret;
};

const generateToken = (payload) => {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRE || '7d',
    issuer:    ISSUER,
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, getSecret(), { issuer: ISSUER });
};

const extractToken = (req) => {
  const header = req.headers && req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    if (token) return token;
  }
  // DEF-001: fall back to the HttpOnly auth cookie set by login/register.
  // Keeping the header path first preserves existing non-browser API
  // consumers (mobile apps, scripts, Postman) that send a Bearer token
  // directly and never receive/forward cookies.
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
};

// Shared cookie options for setting/clearing the auth cookie.
// SameSite=None + Secure is required for the cross-subdomain/cross-origin
// setup this app already runs under (CORS allow-list with credentials:true);
// SameSite=None cookies are rejected by browsers unless Secure is also set.
const AUTH_COOKIE_NAME = 'token';
const authCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // matches default JWT_EXPIRE of 7d
  path: '/',
});

module.exports = { generateToken, verifyToken, extractToken, AUTH_COOKIE_NAME, authCookieOptions };
