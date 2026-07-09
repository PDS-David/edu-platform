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
      `INSERT INTO schools (name, join_code, contact_email)
       VALUES ($1, $2, $3)
       RETURNING id, name, join_code`,
      { bind: [school_name.trim(), joinCode, admin_email.trim().toLowerCase()],
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
        school: { id: schoolRow.id, name: schoolRow.name, join_code: schoolRow.join_code },
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
      `SELECT id, name FROM schools WHERE join_code = $1 AND is_active = true`,
      [join_code.trim().toUpperCase()]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Invalid or inactive join code' });
    }
    const school = rows[0];
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
              sc.is_active, sc.created_at,
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
      `SELECT id, name, join_code, address, contact_email, created_at
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
      `SELECT id, email, first_name, last_name, role, created_at
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
      `SELECT id, email, first_name, last_name, role, created_at
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

module.exports = router;
