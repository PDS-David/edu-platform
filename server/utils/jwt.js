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
  if (!header) return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.split(' ')[1];
  return token || null;
};

module.exports = { generateToken, verifyToken, extractToken };
