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

    // ── Tenant-school service gating ──────────────────────────────────────
    // "A student registered with a tenant school should ONLY have access to
    // what was provided for that school" — enforced live, on every request,
    // not just at registration. A school admin can toggle enable_em /
    // enable_aischoolonair at any time (PATCH /schools/:id/services); a
    // student's access must reflect that immediately, not just what was true
    // when they signed up.
    //
    // Zero impact on the overwhelming majority of accounts: school_id is
    // null for anyone not part of a tenant school, and this whole block is
    // skipped for non-student roles (teachers/school_admins/admins need full
    // access to manage or teach within their school regardless of a
    // temporary content toggle — same scoping decision requireEmRegistration
    // already makes in englishMasterclassRoutes.js).
    if (req.user.school_id && req.user.role === 'student') {
      try {
        const schoolRows = await db.query(
          `SELECT is_active, enable_aischoolonair, enable_em FROM schools WHERE id = :id LIMIT 1`,
          { replacements: { id: req.user.school_id }, type: QueryTypes.SELECT }
        );
        const school = schoolRows[0];

        if (!school || !school.is_active) {
          return res.status(403).json({
            success: false,
            error: 'Your school account is currently inactive. Contact your school admin.',
          });
        }

        // Made available to requireEmRegistration (englishMasterclassRoutes.js)
        // so it doesn't need a second query to check enable_em.
        req.school = school;

        // enable_aischoolonair gates every route EXCEPT the ones below, which
        // have their own more specific gating (EM: enable_em, checked in
        // requireEmRegistration) or must stay reachable regardless of content
        // toggles (schools: membership/management actions; users: a
        // student's own profile/account self-service).
        const url = req.originalUrl || req.url || '';
        const isExempt =
          url.startsWith('/api/english-masterclass') ||
          url.startsWith('/api/schools') ||
          url.startsWith('/api/users');

        if (!isExempt && !school.enable_aischoolonair) {
          return res.status(403).json({
            success: false,
            error: 'Your school has not been registered for AISchoolonair. Contact your school admin.',
          });
        }
      } catch (schoolErr) {
        // Fail OPEN here, deliberately: a hiccup in this one extra check
        // must never take down authentication platform-wide. Only this
        // tenant-scoping check is skipped for this one request — the core
        // token/user verification above already succeeded and is unaffected.
        console.error('[protect] tenant-school gating check failed:', schoolErr.message);
      }
    }

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
