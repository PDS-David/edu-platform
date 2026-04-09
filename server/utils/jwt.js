'use strict';

// utils/jwt.js
// DO NOT call require('dotenv').config() here — server.js owns dotenv loading.

const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment variables');
}

const SECRET = process.env.JWT_SECRET;
const ISSUER = 'edu-platform';

const generateToken = (payload) => {
  return jwt.sign(payload, SECRET, {
    expiresIn: '7d',
    issuer:    ISSUER,
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, SECRET, { issuer: ISSUER });
};

const extractToken = (req) => {
  const header = req.headers && req.headers.authorization;
  if (!header) return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.split(' ')[1];
  return token || null;
};

module.exports = { generateToken, verifyToken, extractToken };
