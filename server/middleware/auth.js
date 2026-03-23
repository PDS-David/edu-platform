const { verifyToken, extractToken } = require('../utils/jwt');
const { QueryTypes } = require('sequelize');
const db = require('../config/database');

/**
 * Protect routes - Verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database — use Sequelize bind syntax, NOT raw $1 array
    const result = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active
       FROM users
       WHERE id = $1`,
      {
        bind: [decoded.id],
        type: QueryTypes.SELECT
      }
    );

    if (!result || result.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account has been deactivated'
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
};

/**
 * Authorize specific roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

/**
 * Optional authentication - adds user to req if token is valid
 * but doesn't block request if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = verifyToken(token);
      const result = await db.query(
        `SELECT id, email, first_name, last_name, role, is_active
         FROM users
         WHERE id = $1`,
        {
          bind: [decoded.id],
          type: QueryTypes.SELECT
        }
      );

      if (result && result.length > 0 && result[0].is_active) {
        req.user = result[0];
      }
    }

    next();
  } catch (error) {
    // Continue without user
    next();
  }
};

module.exports = {
  protect,
  authorize,
  optionalAuth
};
