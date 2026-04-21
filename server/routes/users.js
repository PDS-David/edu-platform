'use strict';

const express = require('express');
const router = express.Router();

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const { protect, authorize } = require('../middleware/auth');
const { success, error, paginated } = require('../utils/response');

// ─────────────────────────────────────────────
// GET /api/users/stats
// ─────────────────────────────────────────────
router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE role = 'student') AS students,
         COUNT(*) FILTER (WHERE role = 'teacher') AS teachers,
         COUNT(*) FILTER (WHERE role = 'admin') AS admins
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
  // Admins can list all users; teachers can only list students (for resource assignment)
  const isAdmin   = req.user.role === 'admin';
  const isTeacher = req.user.role === 'teacher';
  if (!isAdmin && !isTeacher) {
    return error(res, 'Access denied', 403);
  }

  // Teachers may only query students
  let role = req.query.role || '';
  if (isTeacher) role = 'student';

  const search = req.query.search || '';
  const page   = Math.max(parseInt(req.query.page || '1'), 1);
  const limit  = Math.min(parseInt(req.query.limit || '50'), 200);
  const offset = (page - 1) * limit;

  try {
    const [countRows, users] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total
         FROM users
         WHERE (:role = '' OR role = :role)
           AND (:search = '' OR email ILIKE :search OR first_name ILIKE :search OR last_name ILIKE :search)`,
        {
          replacements: { role, search: `%${search}%` },
          type: QueryTypes.SELECT,
        }
      ),

      sequelize.query(
        `SELECT id, email, first_name, last_name, role, is_active, created_at
         FROM users
         WHERE (:role = '' OR role = :role)
           AND (:search = '' OR email ILIKE :search OR first_name ILIKE :search OR last_name ILIKE :search)
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset`,
        {
          replacements: { role, search: `%${search}%`, limit, offset },
          type: QueryTypes.SELECT,
        }
      ),
    ]);

    return paginated(res, users, {
      total: countRows[0].total,
      page,
      limit,
    });

  } catch (err) {
    console.error('[users.list]', err.message);
    return error(res, 'Failed to fetch users');
  }
});

// ─────────────────────────────────────────────
// PUT /api/users/:id/role
// ─────────────────────────────────────────────
router.put('/:id/role', protect, authorize('admin'), async (req, res) => {
  const { role } = req.body;

  if (!['student', 'teacher', 'admin'].includes(role)) {
    return error(res, 'Invalid role', 400);
  }

  try {
    const rows = await sequelize.query(
      `UPDATE users SET role=:role WHERE id=:id RETURNING id, email, role`,
      {
        replacements: { role, id: req.params.id },
        type: QueryTypes.SELECT,
      }
    );

    if (!rows.length) return error(res, 'User not found', 404);

    return success(res, rows[0]);

  } catch (err) {
    console.error('[users.role]', err.message);
    return error(res, 'Failed to update role');
  }
});

// ─────────────────────────────────────────────
// PUT /api/users/:id/deactivate
// ─────────────────────────────────────────────
router.put('/:id/deactivate', protect, authorize('admin'), async (req, res) => {
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    return error(res, 'is_active must be boolean', 400);
  }

  try {
    const rows = await sequelize.query(
      `UPDATE users SET is_active=:is_active WHERE id=:id RETURNING id, email, is_active`,
      {
        replacements: { is_active, id: req.params.id },
        type: QueryTypes.SELECT,
      }
    );

    if (!rows.length) return error(res, 'User not found', 404);

    return success(res, rows[0]);

  } catch (err) {
    console.error('[users.deactivate]', err.message);
    return error(res, 'Failed to update status');
  }
});

// ─────────────────────────────────────────────
// DELETE /api/users/:id
// ─────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return error(res, 'Cannot delete yourself', 400);
  }

  try {
    await sequelize.query(
      `DELETE FROM users WHERE id=:id`,
      { replacements: { id: req.params.id }, type: QueryTypes.DELETE }
    );

    return success(res, { message: 'User deleted' });

  } catch (err) {
    console.error('[users.delete]', err.message);
    return error(res, 'Failed to delete user');
  }
});

module.exports = router;
