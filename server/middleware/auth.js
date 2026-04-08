// server/middleware/auth.js
// JWT authentication middleware.
// Exports:
//   protect   — verifies the Bearer token and attaches req.user
//   authorize — role-gate factory: authorize('teacher', 'admin')

const { verifyToken, extractToken } = require('../utils/jwt');
const { QueryTypes }                = require('sequelize');
const db                            = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// protect
// Reads the Authorization header, verifies the JWT, then loads the user row
// from the DB so every downstream handler gets a fresh req.user object.
// ─────────────────────────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorised — no token provided' });
  }  // ← FIX: closing brace was missing here

  try {
    const decoded = verifyToken(token);

    const users = await db.query(
      `SELECT id, email, first_name, last_name, role,
              is_active, subscription_status, subscription_expires_at
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
    console.error('[protect]', err.message);
    return res.status(401).json({ success: false, error: 'Not authorised — invalid or expired token' });
  }
};  // ← FIX: closing brace was missing here

// ─────────────────────────────────────────────────────────────────────────────
// authorize
// Role-gate factory. Must be used after protect so req.user is already set.
// Usage: router.get('/admin-only', protect, authorize('admin'), handler)
//        router.get('/staff',      protect, authorize('teacher', 'admin'), handler)
// ─────────────────────────────────────────────────────────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authorised' });
  }  // ← FIX: closing brace was missing here

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: `Access denied — requires role: ${roles.join(' or ')}`,
    });
  }  // ← FIX: closing brace was missing here

  next();
};

module.exports = { protect, authorize };
