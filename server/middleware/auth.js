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

    // Single access gate for standalone (non-tenant) users, symmetric with
    // req.school.hasLanguageMasterclass below: per Da's explicit
    // confirmation, registering for any ONE language as a standalone user
    // unlocks all 8, rather than requiring separate registration per
    // language. A single row in user_language_registrations (regardless of
    // which language it's for) is therefore treated as "this user has
    // Language Masterclass access." registeredLanguages above is left in
    // place for anything still reading it (e.g. which language they
    // originally registered under, for analytics/display purposes).
    req.user.hasLanguageMasterclass = req.user.registeredLanguages.length > 0;


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

        // Single access gate for Language Masterclass, per Da's explicit
        // correction: "Once the app admin registers a school for Language
        // Masterclass, the school and her students should have unrestricted
        // access to ALL languages" -- no per-language enablement, no
        // per-student registration. enable_em is reused as this single flag
        // (every school that ever had it turned on already has an 'english'
        // row in school_enabled_languages from the unification migration,
        // so this is non-destructive and doesn't require a data migration
        // of its own). req.school.enabledLanguages above is left in place
        // for anything else still reading it, but new gating logic
        // (requireLanguageRegistration below) should read this flag
        // instead of checking per-language membership.
        req.school.hasLanguageMasterclass = !!school.enable_em;


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

// ─────────────────────────────────────────────────────────────────────────────
// optionalAuth
// ─────────────────────────────────────────────────────────────────────────────
// For routes that must stay reachable without login (public/free content)
// but still want to know who the caller is *when* they happen to be logged
// in, so the response can be personalised/restricted for that case without
// requiring authentication for everyone else.
//
// Unlike protect(), this NEVER blocks the request: no token, an expired/
// invalid/revoked token, or a deactivated/missing user all fall through to
// next() with req.user left undefined — exactly the same as an anonymous
// visitor. Only a genuinely valid token results in req.user being set. Kept
// deliberately minimal (id, role only) rather than reusing protect()'s full
// tenant/language-gating logic, which exists for routes that actually
// require login — a public listing route has no business enforcing that.
const optionalAuth = async (req, res, next) => {
  const header = req.headers?.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return next();

  try {
    const decoded = await tokenService.verifyAccessToken(token);
    const users = await db.query(
      `SELECT id, role, is_active FROM users WHERE id = :id AND is_active = true LIMIT 1`,
      { replacements: { id: decoded.id }, type: QueryTypes.SELECT }
    );
    if (users.length) {
      req.user = users[0];
    }
  } catch {
    // Invalid/expired/revoked token on a route that doesn't require auth —
    // treat as anonymous rather than failing the request.
  }
  next();
};

module.exports = { protect, authorize, optionalAuth };
