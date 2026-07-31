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
              daily_goal, em_registered_at, french_registered_at, german_registered_at
       FROM users
       WHERE id = :id AND is_active = true
       LIMIT 1`,
      { replacements: { id: decoded.id }, type: QueryTypes.SELECT }
    );

    if (!users.length) {
      return res.status(401).json({ success: false, error: 'User not found or account deactivated' });
    }

    req.user = users[0];

    // ── Additive: registeredLanguages from the new join table ──────────────
    // Does not replace em_registered_at/french_registered_at/german_registered_at
    // (still selected above, still read by existing English/French/German
    // gating) -- this is purely additive so new 8-language routes/features
    // can read req.user.registeredLanguages without every existing gate
    // needing to change at the same time. Fails open (empty array) on error,
    // same fail-open philosophy as the school-gating block below -- this
    // must never take down authentication.
    try {
      const regRows = await db.query(
        `SELECT language FROM user_language_registrations WHERE user_id = :id`,
        { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
      );
      req.user.registeredLanguages = regRows.map((r) => r.language);
    } catch (regErr) {
      req.user.registeredLanguages = [];
    }


    // ── Tenant-school service gating ──────────────────────────────────────
    // "A tenant school — its students, teachers, AND school_admin — should
    // ONLY have access to what was provided for that school at registration
    // (or subsequently edited by App Admin). No more." Enforced live, on
    // every request, not just at signup: a school admin can toggle enable_em
    // / enable_aischoolonair at any time (PATCH /schools/:id/services), and
    // App Admin can edit a school's service scope after the fact — access
    // must reflect that immediately, not just what was true at registration.
    //
    // Applies to every role tied to a school (student, teacher,
    // school_admin). Zero impact on accounts outside a tenant: school_id is
    // null for standalone users, and App Admin (role 'admin') never has a
    // school_id, so this block is skipped for both — App Admin manages every
    // school and must never be scoped to one.
    if (req.user.school_id && ['student', 'teacher', 'school_admin'].includes(req.user.role)) {
      try {
        const schoolRows = await db.query(
          `SELECT name, logo_url, is_active, enable_aischoolonair, enable_em, enable_french, enable_german FROM schools WHERE id = :id LIMIT 1`,
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

        // Additive: enabledLanguages from the new join table -- same
        // fail-open handling as the rest of this try block, and does not
        // replace enable_em/enable_french/enable_german above (existing
        // gates keep reading those columns unchanged).
        try {
          const langRows = await db.query(
            `SELECT language FROM school_enabled_languages WHERE school_id = :id`,
            { replacements: { id: req.user.school_id }, type: QueryTypes.SELECT }
          );
          req.school.enabledLanguages = langRows.map((r) => r.language);
        } catch (langErr) {
          req.school.enabledLanguages = [];
        }


        // enable_aischoolonair gates every route EXCEPT the ones below, which
        // have their own more specific gating (EM: enable_em, checked in
        // requireEmRegistration) or must stay reachable regardless of content
        // toggles.
        const url = req.originalUrl || req.url || '';
        const alwaysExempt =
          url.startsWith('/api/english-masterclass') ||
          url.startsWith('/api/language-masterclass') ||
          url.startsWith('/api/schools') ||   // membership/management — incl. school_admin's own roster/settings
          url.startsWith('/api/users') ||     // a user's own profile/account self-service
          url.startsWith('/api/auth') ||      // session self-service (me/logout/refresh) — never content-gated
          url.startsWith('/api/notifications'); // account notifications — not product content

        // A teacher/school_admin pulling a student's progress report is a
        // management action on their own school's roster, not "consuming
        // AISchoolonair" as a product — it must keep working even if the
        // school's content toggle is off (e.g. to print historical
        // records). A student viewing their OWN analytics dashboard IS
        // core product content, so that stays gated like everything else.
        const analyticsExempt =
          url.startsWith('/api/analytics') && ['teacher', 'school_admin'].includes(req.user.role);

        const isExempt = alwaysExempt || analyticsExempt;

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
