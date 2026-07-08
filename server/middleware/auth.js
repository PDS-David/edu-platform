'use strict';

/**
 * middleware/auth.js
 *
 * protect   — verifies Bearer JWT via tokenService (revocation + inactivity)
 *             and attaches a fresh req.user from the DB.
 * authorize — role-gate factory used after protect.
 *
 * AUTH-002  revocation check (tokenService.verifyAccessToken)
 * AUTH-005  inactivity expiration (enforced inside tokenService)
 */

const tokenService = require('../services/tokenService');
const { QueryTypes } = require('sequelize');
const db = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// protect
// ─────────────────────────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  const header = req.headers?.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorised — no token provided' });
  }

  try {
    // Verifies signature, expiry, revocation, and inactivity (AUTH-002/005)
    const decoded = await tokenService.verifyAccessToken(token);

    const users = await db.query(
      `SELECT id, email, first_name, last_name, role, school_id,
              is_active, subscription_status, subscription_expires_at,
              daily_goal, em_registered_at
       FROM users
       WHERE id = :id AND is_active = true
       LIMIT 1`,
      { replacements: { id: decoded.id }, type: QueryTypes.SELECT }
    );

    if (!users.length) {
      return res.status(401).json({ success: false, error: 'User not found or account deactivated' });
    }

    req.user = users[0];
    next();

  } catch (err) {
    const code = err.code || '';
    if (code === 'TOKEN_INACTIVE') {
      return res.status(401).json({ success: false, error: 'Session expired due to inactivity. Please log in again.' });
    }
    if (code === 'TOKEN_REVOKED') {
      return res.status(401).json({ success: false, error: 'Token has been revoked. Please log in again.' });
    }
    return res.status(401).json({ success: false, error: 'Not authorised — invalid or expired token' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// authorize
// ─────────────────────────────────────────────────────────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authorised' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: `Access denied — requires role: ${roles.join(' or ')}`,
    });
  }
  next();
};

module.exports = { protect, authorize };
