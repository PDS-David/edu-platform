'use strict';

const express = require('express');
const router = express.Router();

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const { protect, authorize } = require('../middleware/auth');
const { success, error, paginated } = require('../utils/response');
const { ENROLLMENT_SOURCE, ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');

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
  let role = (req.query.role || '').trim();
  if (isTeacher) role = 'student';
  const validRoles = ['student', 'teacher', 'admin'];
  if (role && !validRoles.includes(role)) role = '';

  const search = req.query.search || '';
  const page   = Math.max(parseInt(req.query.page  || '1',  10), 1);
  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = (page - 1) * limit;
  // Role clause: only applied when a valid role is present.
  // We inject the literal string (from a strict allowlist) rather than a
  // replacement because Postgres won't cast a $1 placeholder to an enum.
  const roleClause = role ? `AND role::text = '${role}'` : '';
  // Search clause: built conditionally in JS — avoids passing a JS boolean
  // as a SQL parameter (Sequelize maps it to a string 'true'/'false' which
  // Postgres may not short-circuit correctly as a boolean in a WHERE clause).
  const searchClause = search
    ? `AND (email ILIKE :searchLike OR first_name ILIKE :searchLike OR last_name ILIKE :searchLike)`
    : '';

  try {
    const searchLike = search ? '%' + search + '%' : '%';
    const replacements = { searchLike };

    const [countRows, users] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS total
         FROM users
         WHERE 1=1
           ${roleClause}
           ${searchClause}`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT id, email, first_name, last_name, role, is_active, created_at
         FROM users
         WHERE 1=1
           ${roleClause}
           ${searchClause}
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements: { ...replacements, limit, offset }, type: QueryTypes.SELECT }
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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/preferences
// Called by OnboardingPage and SettingsPage.
// Must be defined BEFORE /:id routes — Express would treat "preferences" as an ID.
// Body: { exam_boards: ['JAMB','WAEC'], subject_ids: [1,2], daily_goal: 50,
//         preferred_study_days: '["Mon","Tue"]', preferred_study_time: 'evening' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/preferences', protect, async (req, res) => {
  const { exam_boards, subject_ids, daily_goal,
          preferred_study_days, preferred_study_time } = req.body;
  // SettingsPage sends study_days as a JSON string; normalise here
  const studyDays = preferred_study_days != null
    ? (typeof preferred_study_days === 'string'
        ? JSON.parse(preferred_study_days || '[]')
        : preferred_study_days)
    : req.body.study_days;
  const studyTime = preferred_study_time || req.body.study_time;
  const userId = req.user.id;

  try {
    // 1. Save exam board selections → student_exam_types
    if (Array.isArray(exam_boards) && exam_boards.length > 0) {
      for (const code of exam_boards) {
        const board = await sequelize.query(
          `SELECT id FROM exam_boards WHERE code = :code LIMIT 1`,
          { replacements: { code: code.toUpperCase() }, type: QueryTypes.SELECT }
        );
        if (board[0]) {
          await sequelize.query(
            `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
             VALUES (:userId, :boardId, true, '${ENROLLMENT_STATUS.APPROVED}')
             ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = '${ENROLLMENT_STATUS.APPROVED}'`,
            { replacements: { userId, boardId: board[0].id }, type: QueryTypes.RAW }
          );
        }
      }
    }

    // 2. Save subject selections → student_subjects
    if (Array.isArray(subject_ids) && subject_ids.length > 0) {
      for (const sid of subject_ids) {
        const safeId = parseInt(sid);
        if (!safeId) continue;
        try {
          await sequelize.query(
            `INSERT INTO student_subjects (student_id, subject_id, is_active, status, enrollment_source)
             VALUES (:userId, :subjectId, true, '${ENROLLMENT_STATUS.APPROVED}', :enrollmentSource)
             ON CONFLICT (student_id, subject_id) DO UPDATE
               SET is_active         = true,
                   status            = '${ENROLLMENT_STATUS.APPROVED}',
                   enrollment_source = COALESCE(student_subjects.enrollment_source, :enrollmentSource)`,
            { replacements: { userId, subjectId: safeId, enrollmentSource: ENROLLMENT_SOURCE.EXPLICIT }, type: QueryTypes.RAW }
          );
        } catch (_e) { /* table may not exist yet on very fresh DB */ }
      }

      // Derive and save the exam boards those subjects belong to
      const boardRows = await sequelize.query(
        `SELECT DISTINCT exam_board_id FROM subjects
         WHERE id = ANY(:subjectIds::int[]) AND is_active = true AND exam_board_id IS NOT NULL`,
        { replacements: { subjectIds: subject_ids.map(Number).filter(Boolean) }, type: QueryTypes.SELECT }
      );
      for (const row of boardRows) {
        await sequelize.query(
          `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
           VALUES (:userId, :boardId, true, '${ENROLLMENT_STATUS.APPROVED}')
           ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = '${ENROLLMENT_STATUS.APPROVED}'`,
          { replacements: { userId, boardId: row.exam_board_id }, type: QueryTypes.RAW }
        );
      }
    }

    // 3. Persist daily goal
    if (daily_goal != null) {
      await sequelize.query(
        `UPDATE users SET daily_goal = :g, updated_at = NOW() WHERE id = :userId`,
        { replacements: { g: Number(daily_goal), userId }, type: QueryTypes.RAW }
      );
    }

    // 4. Persist study schedule
    if (Array.isArray(studyDays)) {
      await sequelize.query(
        `UPDATE users
         SET preferred_study_days = :days,
             preferred_study_time = :time,
             updated_at           = NOW()
         WHERE id = :userId`,
        { replacements: { days: JSON.stringify(studyDays), time: studyTime || 'evening', userId }, type: QueryTypes.RAW }
      );
    }

    // 5. Mark onboarding complete
    await sequelize.query(
      `UPDATE users SET onboarding_complete = true, updated_at = NOW() WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.RAW }
    );

    return res.status(200).json({ success: true, message: 'Preferences saved' });
  } catch (err) {
    console.error('[PATCH /users/preferences]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save preferences' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id  — fetch single user detail (admin only)
// Must stay AFTER all named sub-routes (stats, preferences).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  if (!id || !id.trim()) {
    return error(res, 'User ID is required', 400);
  }
  try {
    const rows = await sequelize.query(
      `SELECT id, email, first_name, last_name, role, is_active,
              subscription_status, subscription_expires_at, created_at,
              last_login, xp_points, study_streak_days, onboarding_complete,
              avatar_url, phone, country
       FROM users WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (rows.length === 0) return error(res, 'User not found', 404);
    return success(res, rows[0]);
  } catch (err) {
    console.error('[GET /users/:id]', err.message);
    return error(res, 'Failed to fetch user');
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
