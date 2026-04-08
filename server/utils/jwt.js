'use strict';

require('dotenv').config();
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment variables');
}

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d',
    issuer: 'edu-platform',
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;

  if (!header.startsWith('Bearer ')) return null;

  return header.split(' ')[1];
};

module.exports = { generateToken, verifyToken, extractToken };
