'use strict';

/**
 * routes/schoolRoutes.js
 *
 * FIRST SLICE of school multi-tenancy. Deliberately isolated from every
 * existing route file — nothing here is imported by, or modifies, any
 * existing controller, route, or query. It is safe to mount (or leave
 * unmounted) without affecting any current functionality.
 *
 * What exists in this slice:
 *   POST /api/schools/register   — creates a school + its first school_admin account
 *   POST /api/schools/join       — an existing teacher/student links their account
 *                                   to a school using its join_code
 *   GET  /api/schools/me/roster  — school_admin views their school's teachers/students
 *
 * What's deliberately NOT in this slice (next steps, not done yet):
 *   - No scoping of subjects/classes/content by school_id (all content stays
 *     shared/global, exactly as it works today).
 *   - No school-branded dashboard or UI beyond a bare-bones registration form.
 *   - No billing/subscription tie-in for school accounts.
 *   - No migration of existing standalone teachers/students into a school —
 *     that's an opt-in `POST /join` action, never automatic.
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

const { protect, authorize } = require('../middleware/auth');
const { authLimiter, schoolJoinLimiter } = require('../middleware/rateLimiter');
const { createUploadMiddleware } = require('../middleware/uploadSecurity');
const { saveSchoolLogo, deleteSchoolLogo } = require('../utils/schoolLogoStorage');
const User    = require('../models/User');
const sequelize = require('../config/database');
const { ENROLLMENT_SOURCE, ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');

// Single-file, image-only, small size cap — a logo isn't a document upload.
// Same validation pipeline (magic-byte check + AV scan) as every other
// upload in the app; .svg deliberately excluded (can carry embedded script,
// same reasoning as the rest of the app's upload allowlist).
const logoUpload = createUploadMiddleware({
  maxSizeMB:    5,
  maxFiles:     1,
  allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
});

const q = (sql, params) => sequelize.query(sql, {
  bind: params,
  type: sequelize.QueryTypes.SELECT,
});

function generateJoinCode() {
  // 8-char, human-typeable, avoids ambiguous chars (0/O, 1/I/l)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () =>
    alphabet[crypto.randomInt(alphabet.length)]
  ).join('');
}

// ─── POST /api/schools/register ────────────────────────────────────────────
// App Admin only. Creates a new school AND its first school_admin user in
// one call — Da/App Admin sets this up manually, then hands the join_code
// to the school directly (see project notes: schools are provisioned by App
// Admin, not self-service). Previously this was public with no auth at all;
// locked down per that decision.
router.post('/register', protect, authorize('admin'), authLimiter, logoUpload.single('logo'), async (req, res) => {
  const { school_name, admin_email, admin_password, admin_first_name, admin_last_name } = req.body || {};

  if (!school_name || !admin_email || !admin_password) {
    return res.status(400).json({
      success: false,
      error: 'school_name, admin_email, and admin_password are required',
    });
  }

  // Service scope: which product(s) this tenant is registered for. Defaults
  // preserve prior behaviour for anyone calling this before the App Admin
  // UI is updated (AISchoolonair on, EM off) rather than silently changing
  // what an unmodified request would create.
  //
  // Parsed leniently on purpose: this route now accepts multipart/form-data
  // (to carry an optional logo file alongside it), where every field arrives
  // as a string ('true'/'false'), not a JSON boolean — a strict `=== true`
  // check would silently misread every multipart request.
  const parseBool = (v, fallback) => (v === undefined || v === null || v === '') ? fallback : (v === true || v === 'true');
  const enableAISchoolonair = parseBool(req.body.enable_aischoolonair, true);
  const enableEM            = parseBool(req.body.enable_em, false);
  if (!enableAISchoolonair && !enableEM) {
    return res.status(400).json({
      success: false,
      error: 'A school must be registered for at least one of AISchoolonair or English Masterclass',
    });
  }

  let logoUrl = null;
  if (req.secureFile) {
    try {
      logoUrl = await saveSchoolLogo(req.secureFile);
    } catch (err) {
      console.error('[schools] POST /register logo upload failed:', err.message);
      return res.status(500).json({ success: false, error: 'Could not save school logo' });
    }
  }

  const t = await sequelize.transaction();
  try {
    // Ensure a unique join code (retry a few times on the rare collision).
    // schools.join_code is UNIQUE at the DB level, so an exhausted retry
    // loop can never actually create a duplicate — but without this check
    // it would fall through to the generic 500 below with no clue what
    // happened. Fail clearly and let the caller just retry the request.
    let joinCode, attempts = 0, joinCodeFound = false;
    do {
      joinCode = generateJoinCode();
      const existing = await sequelize.query(
        `SELECT 1 FROM schools WHERE join_code = $1`,
        { bind: [joinCode], type: sequelize.QueryTypes.SELECT, transaction: t }
      );
      if (existing.length === 0) { joinCodeFound = true; break; }
      attempts++;
    } while (attempts < 5);

    if (!joinCodeFound) {
      await t.rollback();
      if (logoUrl) deleteSchoolLogo(logoUrl).catch(() => {});
      return res.status(503).json({ success: false, error: 'Could not generate a unique join code — please try again.' });
    }

    const [school] = await sequelize.query(
      `INSERT INTO schools (name, join_code, contact_email, enable_aischoolonair, enable_em, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, join_code, enable_aischoolonair, enable_em, logo_url`,
      { bind: [school_name.trim(), joinCode, admin_email.trim().toLowerCase(), enableAISchoolonair, enableEM, logoUrl],
        type: sequelize.QueryTypes.INSERT, transaction: t }
    );
    const schoolRow = school[0] || school; // pg returns rows directly for RETURNING

    const adminUser = await User.create({
      email: admin_email.trim().toLowerCase(),
      password: admin_password, // hashed automatically by the model's beforeSave hook
      first_name: admin_first_name || '',
      last_name: admin_last_name || '',
      role: 'school_admin',
      is_verified: true, // school admins are trusted by direct registration for this first slice
    }, { transaction: t });

    await sequelize.query(
      `UPDATE schools SET created_by = $1 WHERE id = $2`,
      { bind: [adminUser.id, schoolRow.id], type: sequelize.QueryTypes.UPDATE, transaction: t }
    );
    await sequelize.query(
      `UPDATE users SET school_id = $1 WHERE id = $2`,
      { bind: [schoolRow.id, adminUser.id], type: sequelize.QueryTypes.UPDATE, transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      success: true,
      data: {
        school: {
          id: schoolRow.id, name: schoolRow.name, join_code: schoolRow.join_code,
          enable_aischoolonair: schoolRow.enable_aischoolonair,
          enable_em: schoolRow.enable_em,
          logo_url: schoolRow.logo_url,
        },
        admin:  adminUser.toSafeJSON(),
      },
    });
  } catch (err) {
    await t.rollback();
    // The logo file (if any) was saved BEFORE this transaction, so a
    // rollback here would otherwise leave it orphaned with no school row
    // pointing to it — clean it up rather than leak storage on every
    // failed registration attempt.
    if (logoUrl) deleteSchoolLogo(logoUrl).catch(() => {});
    console.error('[schools] POST /register', err.message);
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, error: 'That admin email is already registered' });
    }
    return res.status(500).json({ success: false, error: 'Could not register school' });
  }
});

// ─── POST /api/schools/join ─────────────────────────────────────────────────
// DISABLED. This used to let any authenticated teacher or student link their
// own account to a school by entering its join_code (Phase 3 follow-up
// reopened it to students after an earlier role-based block broke
// onboarding — see git history on this route for that context). Self-join
// is now blocked outright for every role; accounts must be added to a
// school by a school_admin/App Admin instead. JoinSchoolPage.jsx on the
// client still POSTs here and needs to handle this 403 (update its UI/copy
// to point users to their school admin rather than a join code).
router.post('/join', protect, schoolJoinLimiter, async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Self-join by code is no longer available. Ask your school admin to add your account directly.',
  });
});

// ─── Middleware: only school_admin, only within their own school ──────────
function requireSchoolAdmin(req, res, next) {
  if (req.user?.role !== 'school_admin' || !req.user?.school_id) {
    return res.status(403).json({ success: false, error: 'School admin access required' });
  }
  next();
}

// ─── Middleware: school_admin (own school only) OR App Admin (any school) ──
// Phase 3 Step 3. Does NOT check the target student's school here — that
// needs :studentId from the route params, which isn't resolved yet at this
// point in the middleware chain, so the handler itself re-verifies
// ownership for school_admin callers before touching any data.
function requireSchoolAdminOrAppAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  if (req.user?.role === 'school_admin' && req.user?.school_id) return next();
  return res.status(403).json({ success: false, error: 'School admin or App admin access required' });
}

// ─── GET /api/schools ────────────────────────────────────────────────────────
// App Admin only. Lists every tenant school with basic roster counts, so App
// Admin can see all schools — the one role that isn't confined to a single
// school's data, per the isolation model.
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT sc.id, sc.name, sc.join_code, sc.address, sc.contact_email,
              sc.is_active, sc.enable_aischoolonair, sc.enable_em, sc.logo_url, sc.created_at,
              COUNT(u.id) FILTER (WHERE u.role = 'school_admin') AS admin_count,
              COUNT(u.id) FILTER (WHERE u.role = 'teacher')      AS teacher_count,
              COUNT(u.id) FILTER (WHERE u.role = 'student')      AS student_count
         FROM schools sc
         LEFT JOIN users u ON u.school_id = sc.id
        GROUP BY sc.id
        ORDER BY sc.created_at DESC`,
      []
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[schools] GET /', err.message);
    return res.status(500).json({ success: false, error: 'Could not load schools' });
  }
});

// ─── GET /api/schools/me ─────────────────────────────────────────────────────
// school_admin only. Their own school's basic details (name, join_code) —
// separate from the roster endpoint below since the dashboard needs both.
router.get('/me', protect, requireSchoolAdmin, async (req, res) => {
  try {
    const rows = await q(
      `SELECT id, name, join_code, address, contact_email,
              enable_aischoolonair, enable_em, logo_url, created_at
         FROM schools WHERE id = $1`,
      [req.user.school_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'School not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[schools] GET /me', err.message);
    return res.status(500).json({ success: false, error: 'Could not load school' });
  }
});

// ─── GET /api/schools/me/roster ─────────────────────────────────────────────
// school_admin only. Read-only list of teachers/students linked to their
// school. Explicitly scoped by school_id — cannot see any other school's
// or any standalone (school_id IS NULL) accounts.
//
// NOTE: this must be declared before GET /:id/roster below — Express
// matches routes in declaration order, and /:id/roster would otherwise
// swallow this request with id="me", breaking it for every school_admin.
router.get('/me/roster', protect, requireSchoolAdmin, async (req, res) => {
  try {
    const rows = await q(
      `SELECT id, email, first_name, last_name, role, created_at,
              em_registered_at IS NOT NULL AS uses_english_masterclass
         FROM users
        WHERE school_id = $1
        ORDER BY role, created_at DESC`,
      [req.user.school_id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[schools] GET /me/roster', err.message);
    return res.status(500).json({ success: false, error: 'Could not load roster' });
  }
});

// ─── GET /api/schools/:id/roster ────────────────────────────────────────────
// App Admin only. Same shape as GET /me/roster, but for any school by ID —
// App Admin can see every school's data; a school_admin still only ever sees
// their own (via /me/roster above, which stays unchanged).
router.get('/:id/roster', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT id, email, first_name, last_name, role, created_at,
              em_registered_at IS NOT NULL AS uses_english_masterclass
         FROM users
        WHERE school_id = $1
        ORDER BY role, created_at DESC`,
      [req.params.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[schools] GET /:id/roster', err.message);
    return res.status(500).json({ success: false, error: 'Could not load roster' });
  }
});

// ─── PATCH /api/schools/:id/services ────────────────────────────────────────
// App Admin only. Lets a school's service scope be corrected or extended
// AFTER creation (e.g. a school registered for AISchoolonair only later
// decides to add English Masterclass) — without this, a mistake or a
// changed mind at registration time would need a direct DB edit.
//
// enable_french / enable_german are optional on this endpoint, unlike the
// two required fields below: a school must always have at least one of
// AISchoolonair or English Masterclass, but French/German Masterclass are
// pure add-ons on top (deliberately incomplete proof-of-concept products —
// see server/routes/languageMasterclassRoutes.js) that a school can have
// zero, one, or both of. Omitting them from the request body leaves
// whatever they're currently set to unchanged, rather than resetting them
// to false on every unrelated services update.
//
// UNIFICATION NOTE: enable_em/enable_french/enable_german columns are kept
// exactly as before (existing admin UI still works unchanged) but are now
// also mirrored into school_enabled_languages (english/french/german) after
// every update, since that join table is the scalable source of truth going
// forward for the language dropdown / requireLanguageRegistration. An
// optional `enable_languages` object in the body (e.g.
// { mandarin: true, arabic: false }) additionally lets any of the 5 new
// languages be toggled through this same endpoint without needing 5 more
// dedicated boolean columns.
//
// ACCESS-MODEL UPDATE (post Da's live review): enable_em is now the single
// gate for ALL 8 Language Masterclass languages (see req.school.
// hasLanguageMasterclass in middleware/auth.js -- it's just !!enable_em).
// enable_french/enable_german/enable_languages below, and the
// school_enabled_languages mirroring, are still accepted and still written
// for backward compatibility and because other code may still read
// req.school.enabledLanguages, but none of them affect what a student can
// actually access anymore -- enable_em=true alone unlocks all 8 languages
// for every student at this school, with no further per-language toggle or
// per-student registration needed. Simplifying this endpoint's contract
// itself (dropping the now-vestigial params) is a separate, deliberately
// un-rushed follow-up -- see the admin-UI prompt in this consolidation's
// handoff doc, since AdminSchools.jsx/SchoolAdminDashboard.jsx would need
// to change in lockstep with any contract change here.
router.patch('/:id/services', protect, authorize('admin'), async (req, res) => {
  const enableAISchoolonair = req.body.enable_aischoolonair;
  const enableEM            = req.body.enable_em;
  const enableFrench        = req.body.enable_french;
  const enableGerman        = req.body.enable_german;
  const enableLanguages     = req.body.enable_languages; // optional { code: boolean, ... }
  const NEW_LANGUAGE_CODES  = ['mandarin', 'arabic', 'spanish', 'swahili', 'yoruba'];

  if (typeof enableAISchoolonair !== 'boolean' || typeof enableEM !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'enable_aischoolonair and enable_em must both be provided as true/false',
    });
  }
  if (enableFrench !== undefined && typeof enableFrench !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enable_french must be true/false if provided' });
  }
  if (enableGerman !== undefined && typeof enableGerman !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enable_german must be true/false if provided' });
  }
  if (enableLanguages !== undefined) {
    if (typeof enableLanguages !== 'object' || enableLanguages === null || Array.isArray(enableLanguages)) {
      return res.status(400).json({ success: false, error: 'enable_languages must be an object of { languageCode: boolean }' });
    }
    for (const [code, val] of Object.entries(enableLanguages)) {
      if (!NEW_LANGUAGE_CODES.includes(code)) {
        return res.status(400).json({ success: false, error: `enable_languages contains an unsupported code: ${code}` });
      }
      if (typeof val !== 'boolean') {
        return res.status(400).json({ success: false, error: `enable_languages.${code} must be true/false` });
      }
    }
  }
  if (!enableAISchoolonair && !enableEM) {
    return res.status(400).json({
      success: false,
      error: 'A school must be registered for at least one of AISchoolonair or English Masterclass',
    });
  }
  try {
    const rows = await q(
      `UPDATE schools
          SET enable_aischoolonair = $1,
              enable_em            = $2,
              enable_french        = COALESCE($3, enable_french),
              enable_german        = COALESCE($4, enable_german),
              updated_at           = NOW()
        WHERE id = $5
       RETURNING id, name, enable_aischoolonair, enable_em, enable_french, enable_german`,
      [enableAISchoolonair, enableEM, enableFrench ?? null, enableGerman ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'School not found' });
    const school = rows[0];

    // Mirror into school_enabled_languages. Best-effort: a failure here must
    // not fail the response, since the columns above (the pre-existing
    // contract every current caller relies on) already updated successfully.
    try {
      const syncLanguageFlag = async (code, enabled) => {
        if (enabled) {
          await q(`INSERT INTO school_enabled_languages (school_id, language) VALUES ($1,$2)
                    ON CONFLICT (school_id, language) DO NOTHING`, [school.id, code]);
        } else {
          await q(`DELETE FROM school_enabled_languages WHERE school_id = $1 AND language = $2`, [school.id, code]);
        }
      };
      await syncLanguageFlag('english', school.enable_em);
      await syncLanguageFlag('french', school.enable_french);
      await syncLanguageFlag('german', school.enable_german);
      if (enableLanguages) {
        for (const [code, val] of Object.entries(enableLanguages)) {
          await syncLanguageFlag(code, val);
        }
      }
    } catch (syncErr) {
      console.error('[schools] PATCH /:id/services — school_enabled_languages sync failed:', syncErr.message);
    }

    return res.json({ success: true, data: school });
  } catch (err) {
    console.error('[schools] PATCH /:id/services', err.message);
    return res.status(500).json({ success: false, error: 'Could not update school services' });
  }
});

// ─── PATCH /api/schools/:id ──────────────────────────────────────────────────
// App Admin only. Edits a school's own identity fields — name, address,
// contact_email. Nothing else in this codebase can change these after
// registration (services and logo have their own dedicated endpoints below/
// above; this one deliberately does not touch either, so a partial edit here
// can never accidentally clear a school's enabled services or logo).
router.patch('/:id', protect, authorize('admin'), async (req, res) => {
  const name          = typeof req.body.name === 'string' ? req.body.name.trim() : undefined;
  const address        = typeof req.body.address === 'string' ? req.body.address.trim() : undefined;
  const contact_email  = typeof req.body.contact_email === 'string' ? req.body.contact_email.trim().toLowerCase() : undefined;

  if (name !== undefined && !name) {
    return res.status(400).json({ success: false, error: 'School name cannot be empty' });
  }
  if (contact_email !== undefined && contact_email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contact_email)) {
      return res.status(400).json({ success: false, error: 'Invalid contact email format' });
    }
  }
  if (name === undefined && address === undefined && contact_email === undefined) {
    return res.status(400).json({ success: false, error: 'Nothing to update — provide name, address, and/or contact_email' });
  }

  try {
    const rows = await q(
      `UPDATE schools SET
         name          = COALESCE($1, name),
         address       = COALESCE($2, address),
         contact_email = COALESCE($3, contact_email),
         updated_at    = NOW()
       WHERE id = $4
       RETURNING id, name, address, contact_email, join_code, enable_aischoolonair, enable_em, logo_url`,
      [name, address, contact_email, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'School not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[schools] PATCH /:id', err.message);
    return res.status(500).json({ success: false, error: 'Could not update school details' });
  }
});


// ─── PATCH /api/schools/me/logo ─────────────────────────────────────────────
// school_admin only, own school. Same pipeline as the App-Admin route
// below, so a school can set/update their own branding without waiting on
// App Admin.
//
// NOTE: this must be declared before PATCH /:id/logo below — Express
// matches routes in declaration order, and /:id/logo would otherwise
// swallow this request with id="me" (hitting authorize('admin') instead of
// requireSchoolAdmin, so every school_admin's own-logo upload 403'd with
// "requires role: admin" — confirmed live, same class of bug the /me/roster
// vs /:id/roster pair above was already declared in the correct order to
// avoid, but this pair wasn't).
router.patch('/me/logo', protect, requireSchoolAdmin, logoUpload.single('logo'), async (req, res) => {
  if (!req.secureFile) {
    return res.status(400).json({ success: false, error: 'No logo file was provided' });
  }
  try {
    const existing = await q(`SELECT logo_url FROM schools WHERE id = $1`, [req.user.school_id]);
    const newLogoUrl = await saveSchoolLogo(req.secureFile);
    const rows = await q(
      `UPDATE schools SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, logo_url`,
      [newLogoUrl, req.user.school_id]
    );
    if (existing[0]?.logo_url) deleteSchoolLogo(existing[0].logo_url).catch(() => {});
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[schools] PATCH /me/logo', err.message);
    return res.status(500).json({ success: false, error: 'Could not update school logo' });
  }
});

// ─── PATCH /api/schools/:id/logo ────────────────────────────────────────────
// App Admin only. Sets or replaces any school's logo. Same validated upload
// pipeline as everywhere else (magic-byte check + AV scan via
// createUploadMiddleware), 5MB cap, image types only.
router.patch('/:id/logo', protect, authorize('admin'), logoUpload.single('logo'), async (req, res) => {
  if (!req.secureFile) {
    return res.status(400).json({ success: false, error: 'No logo file was provided' });
  }
  try {
    const existing = await q(`SELECT logo_url FROM schools WHERE id = $1`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'School not found' });

    const newLogoUrl = await saveSchoolLogo(req.secureFile);
    const rows = await q(
      `UPDATE schools SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, logo_url`,
      [newLogoUrl, req.params.id]
    );
    // Clean up the old file only AFTER the new one is safely saved and the
    // DB row updated — never delete the old logo before its replacement is
    // confirmed in place, or a failure partway through leaves the school
    // with no logo at all instead of just the old one.
    if (existing[0].logo_url) deleteSchoolLogo(existing[0].logo_url).catch(() => {});
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[schools] PATCH /:id/logo', err.message);
    return res.status(500).json({ success: false, error: 'Could not update school logo' });
  }
});

// ─── DELETE /api/schools/:id ────────────────────────────────────────────────
// App Admin only. Hard-deletes a school, its users, and its private
// resources. IRREVERSIBLE — requires req.body.confirm_name to exactly match
// the school's current name as a safety check against fat-fingering the
// wrong ID.
//
// schools.school_id on both `users` and `resources` is ON DELETE SET NULL,
// not CASCADE (confirmed live via information_schema audit on 2026-07-13) —
// so deleting the school row alone does nothing to them; both must be
// deleted explicitly, in this order, before the school row itself.
//
// Two tables have ON DELETE NO ACTION back to users (also confirmed live,
// not assumed from the migration script) and will hard-block a user delete
// if left alone: enrollments.user_id, and resource_assignments /
// resource_user_assignments .assigned_by (a teacher who ever assigned a
// resource — including a global App-Admin one — to anyone). Both are
// cleared explicitly below before deleting users. Every other table
// referencing users.id (quiz attempts, class memberships, subscriptions,
// etc.) is ON DELETE CASCADE and needs no special handling.
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  const { confirm_name } = req.body || {};
  const schoolId = req.params.id;
  const t = await sequelize.transaction();
  try {
    const [school] = await sequelize.query(
      `SELECT id, name, logo_url FROM schools WHERE id = $1 FOR UPDATE`,
      { bind: [schoolId], type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    if (!school) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'School not found' });
    }
    if (!confirm_name || confirm_name !== school.name) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: `To confirm this irreversible delete, send confirm_name exactly matching the school's name: "${school.name}"`,
      });
    }

    const userRows = await sequelize.query(
      `SELECT id FROM users WHERE school_id = $1`,
      { bind: [schoolId], type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    const userIds = userRows.map(r => r.id);

    if (userIds.length) {
      // Clear the two confirmed NO ACTION blockers before deleting users.
      await sequelize.query(
        `DELETE FROM enrollments WHERE user_id = ANY($1::uuid[])`,
        { bind: [userIds], type: sequelize.QueryTypes.DELETE, transaction: t }
      );
      await sequelize.query(
        `DELETE FROM resource_assignments WHERE assigned_by = ANY($1::uuid[])`,
        { bind: [userIds], type: sequelize.QueryTypes.DELETE, transaction: t }
      );
      await sequelize.query(
        `DELETE FROM resource_user_assignments WHERE assigned_by = ANY($1::uuid[])`,
        { bind: [userIds], type: sequelize.QueryTypes.DELETE, transaction: t }
      );
    }

    const deletedResources = await sequelize.query(
      `DELETE FROM resources WHERE school_id = $1 RETURNING id`,
      { bind: [schoolId], type: sequelize.QueryTypes.DELETE, transaction: t }
    );
    const deletedUsers = await sequelize.query(
      `DELETE FROM users WHERE school_id = $1 RETURNING id`,
      { bind: [schoolId], type: sequelize.QueryTypes.DELETE, transaction: t }
    );
    await sequelize.query(
      `DELETE FROM schools WHERE id = $1`,
      { bind: [schoolId], type: sequelize.QueryTypes.DELETE, transaction: t }
    );

    // Sanity check before commit — nothing should still reference this
    // school_id anywhere, since we deleted the referencing rows directly
    // rather than relying on the (non-cascading) FK.
    const [{ remaining_users }] = await sequelize.query(
      `SELECT COUNT(*)::int AS remaining_users FROM users WHERE school_id = $1`,
      { bind: [schoolId], type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    const [{ remaining_resources }] = await sequelize.query(
      `SELECT COUNT(*)::int AS remaining_resources FROM resources WHERE school_id = $1`,
      { bind: [schoolId], type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    if (remaining_users > 0 || remaining_resources > 0) {
      throw new Error(`Sanity check failed post-delete: ${remaining_users} users, ${remaining_resources} resources still reference school_id`);
    }

    await t.commit();
    // Only after commit — deleting the file before the DB change is
    // confirmed would leave a live school pointing at a missing logo if
    // the transaction had rolled back instead.
    if (school.logo_url) deleteSchoolLogo(school.logo_url).catch(() => {});
    return res.json({
      success: true,
      data: {
        deleted_school: school.name,
        deleted_users: deletedUsers.length,
        deleted_resources: deletedResources.length,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error('[schools] DELETE /:id', err.message);
    return res.status(500).json({ success: false, error: 'Could not delete school — no changes were made (transaction rolled back).' });
  }
});

// ─── POST /api/schools/me/invite ────────────────────────────────────────────
// school_admin only. Creates a teacher OR student account directly, already
// linked to the caller's own school — no separate self-register-then-join
// round trip required. Closes the gap where a school_admin could only hand
// out a join_code and wait; this mirrors the existing App-Admin
// /api/admin/create-teacher pattern (same validation, same "send the
// plaintext password once via email, never store or log it" approach), but
// scoped to the school_admin's own school_id and allowing role: student too.
const bcrypt = require('bcryptjs');
const crypto2 = require('crypto');
const { validateEmail, validatePassword, validateName, normaliseEmail, normaliseName } = require('../utils/registrationValidators');
router.post('/me/invite', protect, requireSchoolAdmin, async (req, res) => {
  const email      = normaliseEmail(req.body.email);
  const password   = req.body.password;
  const first_name = normaliseName(req.body.first_name || '');
  const last_name  = normaliseName(req.body.last_name || '');
  const role       = req.body.role;

  if (role !== 'teacher' && role !== 'student') {
    return res.status(400).json({ success: false, error: "role must be 'teacher' or 'student'" });
  }
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return res.status(400).json({ success: false, error: emailCheck.error });
  const passCheck = validatePassword(password);
  if (!passCheck.valid) return res.status(400).json({ success: false, error: passCheck.error });
  const fnCheck = validateName(first_name, 'First name');
  if (!fnCheck.valid) return res.status(400).json({ success: false, error: fnCheck.error });

  try {
    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(12));
    const verificationToken        = crypto2.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 86400000);

    // ON CONFLICT DO NOTHING — same TOCTOU-safe pattern as /api/admin/create-teacher.
    // school_id set to the CALLER's school_id directly (from their own verified
    // JWT via requireSchoolAdmin), never trusted from the request body — a
    // school_admin can only ever create accounts inside their own school.
    const rows = await sequelize.query(
      `INSERT INTO users
         (email, password, first_name, last_name, role,
          verification_token, verification_token_expires,
          is_active, is_verified, subscription_status,
          subscription_expires_at, pending_exam_board_ids,
          school_id, created_at, updated_at)
       VALUES
         (:email, :password, :first_name, :last_name, :role,
          :verificationToken, :verificationTokenExpires,
          true, true, 'free_trial',
          NOW() + INTERVAL '14 days', '{}',
          :schoolId, NOW(), NOW())
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, first_name, last_name, role, school_id, created_at`,
      {
        replacements: {
          email, password: hashed, first_name, last_name: last_name || first_name,
          role, verificationToken, verificationTokenExpires, schoolId: req.user.school_id,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!rows || rows.length === 0) {
      return res.status(409).json({ success: false, error: 'An account with that email already exists' });
    }

    try {
      const emailSvc = require('../services/emailService');
      const schoolRows = await q(`SELECT name FROM schools WHERE id = $1`, [req.user.school_id]);
      await emailSvc.sendSchoolMemberWelcomeEmail({
        email: rows[0].email, first_name: rows[0].first_name, password, // plaintext, pre-hash, sent once
        role: rows[0].role, school_name: schoolRows[0]?.name,
      });
    } catch (emailErr) {
      console.warn('[schools] /me/invite welcome email failed:', emailErr.message);
    }

    return res.status(201).json({ success: true, data: { user: rows[0] } });
  } catch (err) {
    console.error('[schools] POST /me/invite', err.message);
    return res.status(500).json({ success: false, error: 'Could not create account' });
  }
});

// ─── PHASE 2 — School-Owned Classes ─────────────────────────────────────────
// Lets a school_admin create and manage classes that belong to their school,
// with teacher assignment optional. Entirely additive on top of the existing
// `classes` / `class_memberships` tables (migration_007_school_classes.sql) —
// every endpoint below is scoped to req.user.school_id and never trusts a
// school_id from the request body. Teacher-owned classes created via
// server/routes/teacherRoutes.js (school_id IS NULL) are untouched by any of
// this — that file's routes/behavior are unmodified.

// ─── POST /api/schools/me/classes ───────────────────────────────────────────
// school_admin only. Creates a class owned by the caller's school. teacher_id
// is optional; if provided, the target user must be a teacher in the same
// school.
router.post('/me/classes', protect, requireSchoolAdmin, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const { teacher_id } = req.body || {};

  if (!name) {
    return res.status(400).json({ success: false, error: 'name is required' });
  }

  try {
    if (teacher_id) {
      const teacherCheck = await q(
        `SELECT id FROM users WHERE id = $1 AND role = 'teacher' AND school_id = $2`,
        [teacher_id, req.user.school_id]
      );
      if (!teacherCheck.length) {
        return res.status(400).json({ success: false, error: 'teacher_id must be a teacher in your school' });
      }
    }

    // Ensure a unique join code (retry a few times on the rare collision) —
    // same approach as POST /register above. classes.join_code is UNIQUE at
    // the DB level, so this can never create a duplicate — but fail clearly
    // if all retries collide rather than falling through to a generic 500.
    let joinCode, attempts = 0, joinCodeFound = false;
    do {
      joinCode = generateJoinCode();
      const existing = await q(`SELECT 1 FROM classes WHERE join_code = $1`, [joinCode]);
      if (existing.length === 0) { joinCodeFound = true; break; }
      attempts++;
    } while (attempts < 5);

    if (!joinCodeFound) {
      return res.status(503).json({ success: false, error: 'Could not generate a unique join code — please try again.' });
    }

    const [inserted] = await sequelize.query(
      `INSERT INTO classes (school_id, created_by, teacher_id, name, join_code, subject_ids, created_at)
       VALUES ($1, $2, $3, $4, $5, '[]', NOW())
       RETURNING id, school_id, teacher_id, name, join_code, created_at`,
      {
        bind: [req.user.school_id, req.user.id, teacher_id || null, name, joinCode],
        type: sequelize.QueryTypes.INSERT,
      }
    );
    const cls = inserted[0] || inserted; // pg returns rows directly for RETURNING
    return res.status(201).json({ success: true, data: { ...cls, student_count: 0 } });
  } catch (err) {
    console.error('[schools] POST /me/classes', err.message);
    return res.status(500).json({ success: false, error: 'Could not create class' });
  }
});

// ─── GET /api/schools/me/classes ────────────────────────────────────────────
// school_admin only. Lists the caller's school's classes with student count
// and assigned teacher name (if any).
router.get('/me/classes', protect, requireSchoolAdmin, async (req, res) => {
  try {
    const rows = await q(
      `SELECT c.id, c.name, c.join_code, c.teacher_id, c.created_at,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              COUNT(cm.student_id)::INTEGER AS student_count
         FROM classes c
         LEFT JOIN users t ON t.id = c.teacher_id
         LEFT JOIN class_memberships cm ON cm.class_id = c.id
        WHERE c.school_id = $1
        GROUP BY c.id, t.first_name, t.last_name
        ORDER BY c.created_at DESC`,
      [req.user.school_id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[schools] GET /me/classes', err.message);
    return res.status(500).json({ success: false, error: 'Could not load classes' });
  }
});

// ─── PATCH /api/schools/me/classes/:id ──────────────────────────────────────
// school_admin only, own school's classes. Updates name and/or teacher_id.
// Ownership is verified BEFORE any update — a class from a different school
// (or a teacher-owned class with school_id NULL) returns 404, never touched.
router.patch('/me/classes/:id', protect, requireSchoolAdmin, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const teacherIdProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'teacher_id');
  const teacher_id = teacherIdProvided ? req.body.teacher_id : undefined;

  if (name === undefined && teacher_id === undefined) {
    return res.status(400).json({ success: false, error: 'Nothing to update — provide name and/or teacher_id' });
  }
  if (name !== undefined && !name) {
    return res.status(400).json({ success: false, error: 'name cannot be empty' });
  }

  try {
    const owned = await q(`SELECT id FROM classes WHERE id = $1 AND school_id = $2`, [req.params.id, req.user.school_id]);
    if (!owned.length) {
      return res.status(404).json({ success: false, error: 'Class not found in your school' });
    }

    if (teacherIdProvided && teacher_id) {
      const teacherCheck = await q(
        `SELECT id FROM users WHERE id = $1 AND role = 'teacher' AND school_id = $2`,
        [teacher_id, req.user.school_id]
      );
      if (!teacherCheck.length) {
        return res.status(400).json({ success: false, error: 'teacher_id must be a teacher in your school' });
      }
    }

    const rows = await q(
      `UPDATE classes SET
         name       = COALESCE($1, name),
         teacher_id = CASE WHEN $2 THEN $3 ELSE teacher_id END
       WHERE id = $4 AND school_id = $5
       RETURNING id, school_id, teacher_id, name, join_code, created_at`,
      [name ?? null, teacherIdProvided, teacher_id || null, req.params.id, req.user.school_id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[schools] PATCH /me/classes/:id', err.message);
    return res.status(500).json({ success: false, error: 'Could not update class' });
  }
});

// ─── DELETE /api/schools/me/classes/:id ─────────────────────────────────────
// school_admin only, own school's classes. Ownership verified first; delete
// cascades to class_memberships per the existing FK (ON DELETE CASCADE).
router.delete('/me/classes/:id', protect, requireSchoolAdmin, async (req, res) => {
  try {
    const owned = await q(`SELECT id FROM classes WHERE id = $1 AND school_id = $2`, [req.params.id, req.user.school_id]);
    if (!owned.length) {
      return res.status(404).json({ success: false, error: 'Class not found in your school' });
    }
    await sequelize.query(
      `DELETE FROM classes WHERE id = $1 AND school_id = $2`,
      { bind: [req.params.id, req.user.school_id], type: sequelize.QueryTypes.DELETE }
    );
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('[schools] DELETE /me/classes/:id', err.message);
    return res.status(500).json({ success: false, error: 'Could not delete class' });
  }
});

// ─── POST /api/schools/me/classes/:id/students ──────────────────────────────
// school_admin only. Adds one or more students to a class the caller's
// school owns. Every student_id must belong to the caller's school — if any
// don't, the WHOLE request is rejected (400, listing which ids failed) and
// nothing is added, rather than partially adding the valid ones.
router.post('/me/classes/:id/students', protect, requireSchoolAdmin, async (req, res) => {
  const studentIds = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
  if (!studentIds.length) {
    return res.status(400).json({ success: false, error: 'student_ids must be a non-empty array' });
  }

  try {
    const owned = await q(`SELECT id FROM classes WHERE id = $1 AND school_id = $2`, [req.params.id, req.user.school_id]);
    if (!owned.length) {
      return res.status(404).json({ success: false, error: 'Class not found in your school' });
    }

    const validStudents = await q(
      `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'student' AND school_id = $2`,
      [studentIds, req.user.school_id]
    );
    const validIds = new Set(validStudents.map(s => s.id));
    const failedIds = studentIds.filter(id => !validIds.has(id));
    if (failedIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Some student_ids are not students in your school',
        failed_ids: failedIds,
      });
    }

    const t = await sequelize.transaction();
    try {
      for (const studentId of studentIds) {
        await sequelize.query(
          `INSERT INTO class_memberships (class_id, student_id, joined_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (class_id, student_id) DO NOTHING`,
          { bind: [req.params.id, studentId], type: sequelize.QueryTypes.INSERT, transaction: t }
        );
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return res.status(201).json({ success: true, data: { added: studentIds.length } });
  } catch (err) {
    console.error('[schools] POST /me/classes/:id/students', err.message);
    return res.status(500).json({ success: false, error: 'Could not add students to class' });
  }
});

// ─── DELETE /api/schools/me/classes/:id/students/:studentId ────────────────
// school_admin only. Removes one membership row; class ownership is verified
// first (same as every other /me/classes/:id endpoint above).
router.delete('/me/classes/:id/students/:studentId', protect, requireSchoolAdmin, async (req, res) => {
  try {
    const owned = await q(`SELECT id FROM classes WHERE id = $1 AND school_id = $2`, [req.params.id, req.user.school_id]);
    if (!owned.length) {
      return res.status(404).json({ success: false, error: 'Class not found in your school' });
    }
    await sequelize.query(
      `DELETE FROM class_memberships WHERE class_id = $1 AND student_id = $2`,
      { bind: [req.params.id, req.params.studentId], type: sequelize.QueryTypes.DELETE }
    );
    return res.json({ success: true, data: { removed: true } });
  } catch (err) {
    console.error('[schools] DELETE /me/classes/:id/students/:studentId', err.message);
    return res.status(500).json({ success: false, error: 'Could not remove student from class' });
  }
});

// ─── GET /api/schools/me/classes/:id/students ───────────────────────────────
// school_admin only. Lists a class's members via join to users. Ownership of
// the class is verified first, same as the other :id endpoints above.
router.get('/me/classes/:id/students', protect, requireSchoolAdmin, async (req, res) => {
  try {
    const owned = await q(`SELECT id FROM classes WHERE id = $1 AND school_id = $2`, [req.params.id, req.user.school_id]);
    if (!owned.length) {
      return res.status(404).json({ success: false, error: 'Class not found in your school' });
    }
    const rows = await q(
      `SELECT u.id, u.first_name, u.last_name, u.email, cm.joined_at
         FROM class_memberships cm
         JOIN users u ON u.id = cm.student_id
        WHERE cm.class_id = $1
        ORDER BY cm.joined_at DESC`,
      [req.params.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[schools] GET /me/classes/:id/students', err.message);
    return res.status(500).json({ success: false, error: 'Could not load class students' });
  }
});

// ─── POST /api/schools/students/:studentId/assign-exam-type ────────────────
// Phase 3 Step 3. Shared by both admin surfaces: a school_admin can only
// target a student in their own school; App Admin can target any student
// (including standalone students with no school_id). Body:
// { exam_board_id, subject_ids: [int, ...] }.
router.post('/students/:studentId/assign-exam-type', protect, requireSchoolAdminOrAppAdmin, async (req, res) => {
  const { studentId } = req.params;
  const { exam_board_id } = req.body || {};
  const requestedSubjectIds = Array.isArray(req.body?.subject_ids)
    ? req.body.subject_ids.map(id => parseInt(id)).filter(Number.isInteger)
    : [];

  if (!exam_board_id) {
    return res.status(400).json({ success: false, error: 'exam_board_id is required' });
  }

  try {
    // Verify the target is actually a student, and (for school_admin
    // callers) that the student belongs to the caller's own school.
    const studentRows = await q(
      `SELECT id, school_id FROM users WHERE id = $1 AND role = 'student'`,
      [studentId]
    );
    if (!studentRows.length) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    if (req.user.role === 'school_admin' && studentRows[0].school_id !== req.user.school_id) {
      return res.status(403).json({ success: false, error: 'That student is not in your school' });
    }

    // Look up the board's limit config — same columns Step 2 taught
    // studentRoutes.js's POST /subjects to read from.
    const boardRows = await q(
      `SELECT id, name, max_subjects, requires_all_subjects
         FROM exam_boards WHERE id = $1 AND is_active = true`,
      [exam_board_id]
    );
    if (!boardRows.length) {
      return res.status(404).json({ success: false, error: 'Exam board not found' });
    }
    const board = boardRows[0];

    let subjectIds = requestedSubjectIds;
    if (board.requires_all_subjects) {
      // Ignore whatever subject_ids were passed — use every active subject
      // for this board instead, same rule OnboardingPage.jsx applies for
      // self-service onboarding on IELTS/TOEFL/SAT-style boards.
      const allSubjects = await q(
        `SELECT id FROM subjects WHERE exam_board_id = $1 AND is_active = true`,
        [board.id]
      );
      subjectIds = allSubjects.map(s => s.id);
    } else {
      if (!subjectIds.length) {
        return res.status(400).json({ success: false, error: 'subject_ids must be a non-empty array' });
      }
      if (board.max_subjects !== null && subjectIds.length > board.max_subjects) {
        return res.status(400).json({
          success: false,
          error: `You can only assign ${board.max_subjects} subjects for ${board.name}. You have reached the limit.`,
          code: 'SUBJECT_LIMIT_REACHED',
          limit: board.max_subjects,
          current: subjectIds.length,
        });
      }
      // Confirm every requested subject actually belongs to this board —
      // never trust subject_ids blindly against a different board's rows.
      const validSubjects = await q(
        `SELECT id FROM subjects WHERE id = ANY($1::int[]) AND exam_board_id = $2 AND is_active = true`,
        [subjectIds, board.id]
      );
      if (validSubjects.length !== subjectIds.length) {
        return res.status(400).json({ success: false, error: 'One or more subject_ids do not belong to this exam board' });
      }
    }

    const t = await sequelize.transaction();
    try {
      // Same ON CONFLICT pattern as studentRoutes.js's POST /subjects, with
      // enrollment_source = 'admin_assigned' instead of 'explicit'.
      await sequelize.query(
        `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = $3`,
        { bind: [studentId, board.id, ENROLLMENT_STATUS.APPROVED], type: sequelize.QueryTypes.INSERT, transaction: t }
      );

      for (const subjectId of subjectIds) {
        await sequelize.query(
          `INSERT INTO student_subjects (student_id, subject_id, is_active, status, enrollment_source)
           VALUES ($1, $2, true, $3, $4)
           ON CONFLICT (student_id, subject_id) DO UPDATE
             SET is_active         = true,
                 status            = $3,
                 enrollment_source = COALESCE(student_subjects.enrollment_source, $4)`,
          {
            bind: [studentId, subjectId, ENROLLMENT_STATUS.APPROVED, ENROLLMENT_SOURCE.ADMIN_ASSIGNED],
            type: sequelize.QueryTypes.INSERT,
            transaction: t,
          }
        );
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return res.status(200).json({
      success: true,
      data: { student_id: studentId, exam_board_id: board.id, subject_ids: subjectIds },
    });
  } catch (err) {
    console.error('[schools] POST /students/:studentId/assign-exam-type', err.message);
    return res.status(500).json({ success: false, error: 'Could not assign exam type' });
  }
});

module.exports = router;
