'use strict';

/**
 * server/routes/users.js
 *
 * Security hardening (2026-06):
 *   - Soft delete (sets deleted_at) instead of hard DELETE
 *   - Recovery endpoint: POST /api/users/:id/restore
 *   - Last-admin protection enforced at DB trigger level; application layer
 *     pre-checks to return a clean 400 instead of a 500 on constraint violation
 *   - Full audit logging on all write operations
 *   - DELETE requires X-Admin-Action: 1 confirmation header
 */

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect, authorize }  = require('../middleware/auth');
const { success, error, paginated } = require('../utils/response');
const { adminActionLimiter } = require('../middleware/rateLimiter');
const { requireAdminConfirm } = require('../middleware/confirmDestructive');
const audit = require('../services/auditLogger');
const { ENROLLMENT_SOURCE, ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');
const { ensureEnrollmentColumns } = require('./studentRoutes');

// ─────────────────────────────────────────────
// GET /api/users/stats
// ─────────────────────────────────────────────
router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         COUNT(*)                                          AS total,
         COUNT(*) FILTER (WHERE role = 'student')         AS students,
         COUNT(*) FILTER (WHERE role = 'teacher')         AS teachers,
         COUNT(*) FILTER (WHERE role = 'admin')           AS admins,
         COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)   AS soft_deleted
       FROM users`,
      { type: QueryTypes.SELECT }
    );
    return success(res, rows[0]);
  } catch (err) {
    console.error('[users.stats]', err.message);
    return error(res, 'Failed to fetch stats');
  }
});

// ─────────────────────────────────────────────
// GET /api/users (paginated)
// ─────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const isAdmin   = req.user.role === 'admin';
  const isTeacher = req.user.role === 'teacher';
  if (!isAdmin && !isTeacher) return error(res, 'Access denied', 403);

  let role = (req.query.role || '').trim();
  if (isTeacher) role = 'student';
  const validRoles = ['student', 'teacher', 'admin'];
  if (role && !validRoles.includes(role)) role = '';

  // Admins can see soft-deleted users with ?include_deleted=1
  const includeDeleted = isAdmin && req.query.include_deleted === '1';

  const search = req.query.search || '';
  const page   = Math.max(parseInt(req.query.page  || '1',  10), 1);
  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = (page - 1) * limit;

  const roleClause    = role ? `AND role::text = '${role}'` : '';
  const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';
  const searchClause  = search
    ? `AND (email ILIKE :searchLike OR first_name ILIKE :searchLike OR last_name ILIKE :searchLike)`
    : '';

  try {
    const searchLike = search ? '%' + search + '%' : '%';
    const replacements = { searchLike };

    const [countRows, users] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total FROM users
         WHERE 1=1 ${deletedClause} ${roleClause} ${searchClause}`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT id, email, first_name, last_name, role, is_active,
                created_at, deleted_at
         FROM users
         WHERE 1=1 ${deletedClause} ${roleClause} ${searchClause}
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements: { ...replacements, limit, offset }, type: QueryTypes.SELECT }
      ),
    ]);

    return paginated(res, users, { total: countRows[0].total, page, limit });
  } catch (err) {
    console.error('[users.list]', err.message);
    return error(res, 'Failed to fetch users');
  }
});

// ─────────────────────────────────────────────
// PUT /api/users/:id/role
// ─────────────────────────────────────────────
router.put('/:id/role', protect, authorize('admin'), adminActionLimiter, async (req, res) => {
  const { role } = req.body;
  const targetId = req.params.id;

  if (!['student', 'teacher', 'admin'].includes(role)) {
    return error(res, 'Invalid role', 400);
  }

  try {
    // Pre-check: is this a last-admin demotion?
    if (role !== 'admin') {
      const [target] = await sequelize.query(
        `SELECT role FROM users WHERE id = :id LIMIT 1`,
        { replacements: { id: targetId }, type: QueryTypes.SELECT }
      );
      if (target?.role === 'admin') {
        const [countRow] = await sequelize.query(
          `SELECT COUNT(*)::int AS cnt FROM users
           WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL`,
          { type: QueryTypes.SELECT }
        );
        if (parseInt(countRow?.cnt) <= 1) {
          return error(res, 'Cannot demote the last active admin', 400);
        }
      }
    }

    const [prev] = await sequelize.query(
      `SELECT role, email FROM users WHERE id = :id`, { replacements: { id: targetId }, type: QueryTypes.SELECT }
    );

    const rows = await sequelize.query(
      `UPDATE users SET role = :role, updated_at = NOW()
       WHERE id = :id AND deleted_at IS NULL
       RETURNING id, email, role`,
      { replacements: { role, id: targetId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) return error(res, 'User not found', 404);

    await audit.log(req, audit.ACTIONS.ROLE_CHANGE, {
      targetType: 'user', targetId, targetEmail: prev?.email,
      severity: 'warning',
      metadata: { old_role: prev?.role, new_role: role },
    });

    return success(res, rows[0]);
  } catch (err) {
    if (err.message.includes('LAST_ADMIN_PROTECTION')) {
      return error(res, err.message.replace('LAST_ADMIN_PROTECTION: ', ''), 400);
    }
    console.error('[users.role]', err.message);
    return error(res, 'Failed to update role');
  }
});

// ─────────────────────────────────────────────
// PUT /api/users/:id/profile
// Issue 3: admin can fix a typo'd name or email — no destructive action,
// purely a profile field correction. Validates email format and uniqueness
// before writing, matching the same error convention used at registration
// ("An account with that email already exists", 409).
// ─────────────────────────────────────────────
router.put('/:id/profile', protect, authorize('admin'), adminActionLimiter, async (req, res) => {
  const targetId = req.params.id;
  const first_name = typeof req.body.first_name === 'string' ? req.body.first_name.trim() : undefined;
  const last_name  = typeof req.body.last_name  === 'string' ? req.body.last_name.trim()  : undefined;
  const email      = typeof req.body.email      === 'string' ? req.body.email.trim().toLowerCase() : undefined;

  if (first_name === undefined && last_name === undefined && email === undefined) {
    return error(res, 'Nothing to update — provide first_name, last_name, and/or email', 400);
  }
  if (first_name !== undefined && !first_name) {
    return error(res, 'First name cannot be empty', 400);
  }
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return error(res, 'Invalid email format', 400);
  }

  try {
    const [target] = await sequelize.query(
      `SELECT id, email, first_name, last_name FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1`,
      { replacements: { id: targetId }, type: QueryTypes.SELECT }
    );
    if (!target) return error(res, 'User not found', 404);

    // Email uniqueness pre-check (same message/status as registration flow)
    if (email !== undefined && email !== target.email) {
      const [dup] = await sequelize.query(
        `SELECT id FROM users WHERE email = :email AND id != :id LIMIT 1`,
        { replacements: { email, id: targetId }, type: QueryTypes.SELECT }
      );
      if (dup) return error(res, 'An account with that email already exists', 409);
    }

    const setClauses = ['updated_at = NOW()'];
    const replacements = { id: targetId };
    if (first_name !== undefined) { setClauses.push('first_name = :first_name'); replacements.first_name = first_name; }
    if (last_name  !== undefined) { setClauses.push('last_name = :last_name');   replacements.last_name  = last_name; }
    if (email      !== undefined) { setClauses.push('email = :email');           replacements.email      = email; }

    const rows = await sequelize.query(
      `UPDATE users SET ${setClauses.join(', ')}
       WHERE id = :id AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name`,
      { replacements, type: QueryTypes.SELECT }
    );
    if (!rows.length) return error(res, 'User not found', 404);

    await audit.log(req, audit.ACTIONS.USER_UPDATE, {
      targetType: 'user', targetId, targetEmail: rows[0].email,
      metadata: {
        old: { first_name: target.first_name, last_name: target.last_name, email: target.email },
        new: { first_name: rows[0].first_name, last_name: rows[0].last_name, email: rows[0].email },
      },
    });

    return success(res, rows[0]);
  } catch (err) {
    // Defensive fallback: DB-level unique constraint violation (race condition
    // between the pre-check above and the UPDATE) surfaces as a Postgres
    // error with code 23505 — map it to the same clean message rather than
    // letting a raw constraint error reach the client.
    if (err.original?.code === '23505' || /unique/i.test(err.message)) {
      return error(res, 'An account with that email already exists', 409);
    }
    console.error('[users.profile]', err.message);
    return error(res, 'Failed to update profile');
  }
});

// ─────────────────────────────────────────────
// PUT /api/users/:id/deactivate
// ─────────────────────────────────────────────
router.put('/:id/deactivate', protect, authorize('admin'), adminActionLimiter, async (req, res) => {
  const { is_active } = req.body;
  const targetId = req.params.id;

  if (typeof is_active !== 'boolean') return error(res, 'is_active must be boolean', 400);

  try {
    // Pre-check last-admin deactivation
    if (!is_active) {
      const [target] = await sequelize.query(
        `SELECT role, email FROM users WHERE id = :id LIMIT 1`,
        { replacements: { id: targetId }, type: QueryTypes.SELECT }
      );
      if (target?.role === 'admin') {
        const [countRow] = await sequelize.query(
          `SELECT COUNT(*)::int AS cnt FROM users
           WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL`,
          { type: QueryTypes.SELECT }
        );
        if (parseInt(countRow?.cnt) <= 1) {
          return error(res, 'Cannot deactivate the last active admin', 400);
        }
      }
    }

    const rows = await sequelize.query(
      `UPDATE users SET is_active = :is_active, updated_at = NOW()
       WHERE id = :id AND deleted_at IS NULL
       RETURNING id, email, is_active`,
      { replacements: { is_active, id: targetId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) return error(res, 'User not found', 404);

    const action = is_active ? audit.ACTIONS.USER_REACTIVATE : audit.ACTIONS.USER_DEACTIVATE;
    await audit.log(req, action, {
      targetType: 'user', targetId, targetEmail: rows[0].email, severity: 'warning',
    });

    return success(res, rows[0]);
  } catch (err) {
    if (err.message.includes('LAST_ADMIN_PROTECTION')) {
      return error(res, err.message.replace('LAST_ADMIN_PROTECTION: ', ''), 400);
    }
    console.error('[users.deactivate]', err.message);
    return error(res, 'Failed to update status');
  }
});

// ─────────────────────────────────────────────
// PATCH /api/users/preferences  (must stay before /:id routes)
// ─────────────────────────────────────────────
router.patch('/preferences', protect, async (req, res) => {
  const { exam_boards, subject_ids, daily_goal,
          preferred_study_days, preferred_study_time } = req.body;
  const studyDays = preferred_study_days != null
    ? (typeof preferred_study_days === 'string'
        ? JSON.parse(preferred_study_days || '[]')
        : preferred_study_days)
    : req.body.study_days;
  const studyTime = preferred_study_time || req.body.study_time;
  const userId = req.user.id;

  try {
    // Bug 1 fix: self-heal status/enrollment_source columns before any
    // INSERT into student_subjects/student_exam_types below.
    await ensureEnrollmentColumns();

    if (Array.isArray(exam_boards) && exam_boards.length > 0) {
      for (const raw of exam_boards) {
        if (raw == null) continue;
        let board;
        try {
          if (typeof raw === 'string' && /^[A-Za-z]+$/.test(raw)) {
            // Board code, e.g. "WAEC" / "JAMB"
            board = await sequelize.query(
              `SELECT id FROM exam_boards WHERE code = :code LIMIT 1`,
              { replacements: { code: raw.toUpperCase() }, type: QueryTypes.SELECT }
            );
          } else {
            // OnboardingPage sends board IDs, not codes — .toUpperCase() on
            // a non-string here threw a TypeError that propagated to the
            // outer catch as a generic 500.
            board = await sequelize.query(
              `SELECT id FROM exam_boards WHERE id::text = :id LIMIT 1`,
              { replacements: { id: String(raw) }, type: QueryTypes.SELECT }
            );
          }
        } catch (lookupErr) {
          console.error('[PATCH /users/preferences] exam_boards lookup failed for value', raw, lookupErr.message);
          continue; // skip this board rather than fail the whole request
        }
        if (board?.[0]) {
          try {
            await sequelize.query(
              `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
               VALUES (:userId, :boardId, true, :approvedStatus)
               ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = :approvedStatus`,
              { replacements: { userId, boardId: board[0].id, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.RAW }
            );
          } catch (insertErr) {
            console.error('[PATCH /users/preferences] student_exam_types insert failed:', insertErr.message);
          }
        }
      }
    }

    if (Array.isArray(subject_ids) && subject_ids.length > 0) {
      for (const sid of subject_ids) {
        const safeId = parseInt(sid);
        if (!safeId) continue;
        try {
          await sequelize.query(
            `INSERT INTO student_subjects (student_id, subject_id, is_active, status, enrollment_source)
             VALUES (:userId, :subjectId, true, :approvedStatus, :enrollmentSource)
             ON CONFLICT (student_id, subject_id) DO UPDATE
               SET is_active = true, status = :approvedStatus,
                   enrollment_source = COALESCE(student_subjects.enrollment_source, :enrollmentSource)`,
            { replacements: { userId, subjectId: safeId, enrollmentSource: ENROLLMENT_SOURCE.EXPLICIT, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.RAW }
          );
        } catch (_e) {}
      }

      // Back-fill the exam boards those subjects belong to. Previously used
      // `= ANY(:subjectIds::int[])` with a plain JS array replacement, which
      // Sequelize does not reliably bind to a Postgres array literal — threw
      // a type-mismatch error that was NOT caught here, killing the whole
      // request even though the student_subjects inserts above had already
      // succeeded. IN (:subjectIds) is the pattern already used safely
      // elsewhere in this codebase; also wrapped so a failure here degrades
      // gracefully instead of discarding the subject enrollment just saved.
      try {
        const safeSubjectIds = subject_ids.map(Number).filter(Boolean);
        if (safeSubjectIds.length > 0) {
          const boardRows = await sequelize.query(
            `SELECT DISTINCT exam_board_id FROM subjects
             WHERE id IN (:subjectIds) AND is_active = true AND exam_board_id IS NOT NULL`,
            { replacements: { subjectIds: safeSubjectIds }, type: QueryTypes.SELECT }
          );
          for (const row of boardRows) {
            try {
              await sequelize.query(
                `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
                 VALUES (:userId, :boardId, true, :approvedStatus)
                 ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = :approvedStatus`,
                { replacements: { userId, boardId: row.exam_board_id, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.RAW }
              );
            } catch (insertErr) {
              console.error('[PATCH /users/preferences] board backfill insert failed:', insertErr.message);
            }
          }
        }
      } catch (boardLookupErr) {
        console.error('[PATCH /users/preferences] board lookup from subjects failed', boardLookupErr.message);
      }
    }

    if (daily_goal != null) {
      try {
        await sequelize.query(
          `UPDATE users SET daily_goal = :g, updated_at = NOW() WHERE id = :userId`,
          { replacements: { g: Number(daily_goal), userId }, type: QueryTypes.RAW }
        );
      } catch (e) { console.error('[PATCH /users/preferences] daily_goal update failed:', e.message); }
    }

    if (Array.isArray(studyDays)) {
      try {
        await sequelize.query(
          `UPDATE users SET preferred_study_days = :days, preferred_study_time = :time, updated_at = NOW() WHERE id = :userId`,
          { replacements: { days: JSON.stringify(studyDays), time: studyTime || 'evening', userId }, type: QueryTypes.RAW }
        );
      } catch (e) { console.error('[PATCH /users/preferences] study schedule update failed:', e.message); }
    }

    try {
      await sequelize.query(
        `UPDATE users SET onboarding_complete = true, updated_at = NOW() WHERE id = :userId`,
        { replacements: { userId }, type: QueryTypes.RAW }
      );
    } catch (e) { console.error('[PATCH /users/preferences] onboarding_complete update failed:', e.message); }

    await audit.log(req, audit.ACTIONS.SETTINGS_CHANGE, {
      targetType: 'user', targetId: userId,
      metadata: { changed: Object.keys(req.body) },
    });

    return res.status(200).json({ success: true, message: 'Preferences saved' });
  } catch (err) {
    console.error('[PATCH /users/preferences]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save preferences' });
  }
});

// ─────────────────────────────────────────────
// GET /api/users/:id
// ─────────────────────────────────────────────
router.get('/:id', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  if (!id?.trim()) return error(res, 'User ID is required', 400);
  try {
    const rows = await sequelize.query(
      `SELECT id, email, first_name, last_name, role, is_active,
              subscription_status, subscription_expires_at, created_at,
              last_login, xp_points, study_streak_days, onboarding_complete,
              avatar_url, phone, country, deleted_at, deleted_by, delete_reason
       FROM users WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return error(res, 'User not found', 404);
    return success(res, rows[0]);
  } catch (err) {
    console.error('[GET /users/:id]', err.message);
    return error(res, 'Failed to fetch user');
  }
});

// ─────────────────────────────────────────────
// DELETE /api/users/:id  — SOFT DELETE
// Requires X-Admin-Action: 1 confirmation header.
// ─────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), adminActionLimiter, requireAdminConfirm, async (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.user.id) {
    return error(res, 'Cannot delete yourself', 400);
  }

  try {
    // Pre-check last-admin deletion
    const [target] = await sequelize.query(
      `SELECT role, email FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1`,
      { replacements: { id: targetId }, type: QueryTypes.SELECT }
    );
    if (!target) return error(res, 'User not found', 404);

    if (target.role === 'admin') {
      const [countRow] = await sequelize.query(
        `SELECT COUNT(*)::int AS cnt FROM users
         WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL`,
        { type: QueryTypes.SELECT }
      );
      if (parseInt(countRow?.cnt) <= 1) {
        return error(res, 'Cannot delete the last active admin', 400);
      }
    }

    const reason = req.body?.reason || null;

    await sequelize.query(
      `UPDATE users
       SET deleted_at    = NOW(),
           deleted_by    = :deletedBy,
           delete_reason = :reason,
           is_active     = false,
           updated_at    = NOW()
       WHERE id = :id AND deleted_at IS NULL`,
      { replacements: { id: targetId, deletedBy: req.user.id, reason }, type: QueryTypes.UPDATE }
    );

    await audit.log(req, audit.ACTIONS.USER_DELETE, {
      targetType: 'user', targetId, targetEmail: target.email,
      severity: 'warning',
      metadata: { reason, soft_delete: true },
    });

    return success(res, { message: 'User soft-deleted', id: targetId });
  } catch (err) {
    if (err.message.includes('LAST_ADMIN_PROTECTION')) {
      return error(res, err.message.replace('LAST_ADMIN_PROTECTION: ', ''), 400);
    }
    console.error('[users.delete]', err.message);
    return error(res, 'Failed to delete user');
  }
});

// ─────────────────────────────────────────────
// POST /api/users/:id/restore  — recovery workflow
// ─────────────────────────────────────────────
router.post('/:id/restore', protect, authorize('admin'), adminActionLimiter, async (req, res) => {
  const targetId = req.params.id;
  try {
    const rows = await sequelize.query(
      `UPDATE users
       SET deleted_at    = NULL,
           deleted_by    = NULL,
           delete_reason = NULL,
           is_active     = true,
           updated_at    = NOW()
       WHERE id = :id AND deleted_at IS NOT NULL
       RETURNING id, email, role`,
      { replacements: { id: targetId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) return error(res, 'User not found or not deleted', 404);

    await audit.log(req, audit.ACTIONS.USER_RESTORE, {
      targetType: 'user', targetId, targetEmail: rows[0].email,
      metadata: { restored_by: req.user.id },
    });

    return success(res, { message: 'User restored', user: rows[0] });
  } catch (err) {
    console.error('[users.restore]', err.message);
    return error(res, 'Failed to restore user');
  }
});

module.exports = router;
