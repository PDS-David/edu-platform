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
const User    = require('../models/User');
const sequelize = require('../config/database');

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
router.post('/register', protect, authorize('admin'), async (req, res) => {
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
  const enableAISchoolonair = req.body.enable_aischoolonair !== false;
  const enableEM            = req.body.enable_em === true;
  if (!enableAISchoolonair && !enableEM) {
    return res.status(400).json({
      success: false,
      error: 'A school must be registered for at least one of AISchoolonair or English Masterclass',
    });
  }

  const t = await sequelize.transaction();
  try {
    // Ensure a unique join code (retry a few times on the rare collision)
    let joinCode, attempts = 0;
    do {
      joinCode = generateJoinCode();
      const existing = await sequelize.query(
        `SELECT 1 FROM schools WHERE join_code = $1`,
        { bind: [joinCode], type: sequelize.QueryTypes.SELECT, transaction: t }
      );
      if (existing.length === 0) break;
      attempts++;
    } while (attempts < 5);

    const [school] = await sequelize.query(
      `INSERT INTO schools (name, join_code, contact_email, enable_aischoolonair, enable_em)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, join_code, enable_aischoolonair, enable_em`,
      { bind: [school_name.trim(), joinCode, admin_email.trim().toLowerCase(), enableAISchoolonair, enableEM],
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
        },
        admin:  adminUser.toSafeJSON(),
      },
    });
  } catch (err) {
    await t.rollback();
    console.error('[schools] POST /register', err.message);
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, error: 'That admin email is already registered' });
    }
    return res.status(500).json({ success: false, error: 'Could not register school' });
  }
});

// ─── POST /api/schools/join ─────────────────────────────────────────────────
// Auth required. An existing teacher or student links their own account to a
// school by entering its join_code. Purely opt-in — never touches an account
// that doesn't explicitly call this.
router.post('/join', protect, async (req, res) => {
  const { join_code } = req.body || {};
  if (!join_code) {
    return res.status(400).json({ success: false, error: 'join_code is required' });
  }
  try {
    const rows = await q(
      `SELECT id, name, enable_aischoolonair FROM schools WHERE join_code = $1 AND is_active = true`,
      [join_code.trim().toUpperCase()]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Invalid or inactive join code' });
    }
    const school = rows[0];
    // Distinct from "invalid code" on purpose: the code is real, but this
    // school registered for English Masterclass only, not AISchoolonair.
    if (!school.enable_aischoolonair) {
      return res.status(400).json({
        success: false,
        error: `${school.name} has not been registered for AISchoolonair. Contact your school admin or App Admin.`,
      });
    }
    await sequelize.query(
      `UPDATE users SET school_id = $1 WHERE id = $2`,
      { bind: [school.id, req.user.id], type: sequelize.QueryTypes.UPDATE }
    );
    return res.json({ success: true, data: { school_id: school.id, school_name: school.name } });
  } catch (err) {
    console.error('[schools] POST /join', err.message);
    return res.status(500).json({ success: false, error: 'Could not join school' });
  }
});

// ─── Middleware: only school_admin, only within their own school ──────────
function requireSchoolAdmin(req, res, next) {
  if (req.user?.role !== 'school_admin' || !req.user?.school_id) {
    return res.status(403).json({ success: false, error: 'School admin access required' });
  }
  next();
}

// ─── GET /api/schools ────────────────────────────────────────────────────────
// App Admin only. Lists every tenant school with basic roster counts, so App
// Admin can see all schools — the one role that isn't confined to a single
// school's data, per the isolation model.
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await q(
      `SELECT sc.id, sc.name, sc.join_code, sc.address, sc.contact_email,
              sc.is_active, sc.enable_aischoolonair, sc.enable_em, sc.created_at,
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
              enable_aischoolonair, enable_em, created_at
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
router.patch('/:id/services', protect, authorize('admin'), async (req, res) => {
  const enableAISchoolonair = req.body.enable_aischoolonair;
  const enableEM            = req.body.enable_em;
  if (typeof enableAISchoolonair !== 'boolean' || typeof enableEM !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'enable_aischoolonair and enable_em must both be provided as true/false',
    });
  }
  if (!enableAISchoolonair && !enableEM) {
    return res.status(400).json({
      success: false,
      error: 'A school must be registered for at least one of AISchoolonair or English Masterclass',
    });
  }
  try {
    const rows = await q(
      `UPDATE schools SET enable_aischoolonair = $1, enable_em = $2, updated_at = NOW()
        WHERE id = $3
       RETURNING id, name, enable_aischoolonair, enable_em`,
      [enableAISchoolonair, enableEM, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'School not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[schools] PATCH /:id/services', err.message);
    return res.status(500).json({ success: false, error: 'Could not update school services' });
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
      `SELECT id, name FROM schools WHERE id = $1 FOR UPDATE`,
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

module.exports = router;
