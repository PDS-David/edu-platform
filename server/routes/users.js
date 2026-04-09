// server/routes/users.js
// GET  /api/users              — paginated list (admin)
// GET  /api/users/stats        — counts (admin)
// PUT  /api/users/:id/role     — change role (admin)
// PUT  /api/users/:id/deactivate — toggle active (admin)
// PATCH /api/users/preferences — save onboarding prefs (student)

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/stats
// Must be defined BEFORE /:id to avoid "stats" being treated as an ID
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         COUNT(*)                                                        AS total,
         COUNT(*) FILTER (WHERE role = 'student')                       AS students,
         COUNT(*) FILTER (WHERE role = 'teacher')                       AS teachers,
         COUNT(*) FILTER (WHERE role = 'admin')                         AS admins,
         COUNT(*) FILTER (WHERE subscription_status = 'active')         AS active_subscriptions
       FROM users`,
      { type: QueryTypes.SELECT }
    );
    const s = rows[0] || {};
    return res.status(200).json({
      success: true,
      data: {
        total:                parseInt(s.total)                || 0,
        students:             parseInt(s.students)            || 0,
        teachers:             parseInt(s.teachers)            || 0,
        admins:               parseInt(s.admins)              || 0,
        active_subscriptions: parseInt(s.active_subscriptions)|| 0,
      },
    });
  } catch (err) {
    console.error('[GET /users/stats]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users
// Query params: role, search, page (default 1), limit (default 20)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, authorize('admin'), async (req, res) => {
  const role   = req.query.role   || '';
  const search = req.query.search || '';
  const page   = Math.max(parseInt(req.query.page  || '1',  10), 1);
  const limit  = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const offset = (page - 1) * limit;
  const searchLike = `%${search}%`;

  try {
    const [countRows, users] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM users u
         WHERE (:role = '' OR u.role = :role)
           AND (:search = '' OR u.email      ILIKE :searchLike
                             OR u.first_name ILIKE :searchLike
                             OR u.last_name  ILIKE :searchLike)`,
        { replacements: { role, search, searchLike }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           u.id, u.email, u.first_name, u.last_name, u.role,
           u.is_active, u.subscription_status, u.created_at, u.last_login,
           0::INTEGER AS questions_submitted
         FROM users u
         WHERE (:role = '' OR u.role = :role)
           AND (:search = '' OR u.email      ILIKE :searchLike
                             OR u.first_name ILIKE :searchLike
                             OR u.last_name  ILIKE :searchLike)
         ORDER BY u.created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements: { role, search, searchLike, limit, offset }, type: QueryTypes.SELECT }
      ),
    ]);

    return res.status(200).json({
      success: true,
      total:   countRows[0]?.total || 0,
      page,
      limit,
      data:    users,
    });
  } catch (err) {
    console.error('[GET /users]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id/role
// Body: { role: 'student'|'teacher'|'admin' }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/role', protect, authorize('admin'), async (req, res) => {
  const { role } = req.body;
  const userId   = req.params.id;

  if (!['student', 'teacher', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'role must be student, teacher, or admin' });
  }

  try {
    const result = await sequelize.query(
      `UPDATE users SET role = :role, updated_at = NOW()
       WHERE id = :userId
       RETURNING id, email, role`,
      { replacements: { role, userId }, type: QueryTypes.SELECT }
    );
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.status(200).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[PUT /users/:id/role]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id/deactivate
// Body: { is_active: true|false }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/deactivate', protect, authorize('admin'), async (req, res) => {
  const isActive = req.body.is_active;
  const userId   = req.params.id;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, error: 'is_active must be a boolean' });
  }

  try {
    const result = await sequelize.query(
      `UPDATE users SET is_active = :isActive, updated_at = NOW()
       WHERE id = :userId
       RETURNING id, email, is_active`,
      { replacements: { isActive, userId }, type: QueryTypes.SELECT }
    );
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.status(200).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[PUT /users/:id/deactivate]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update user status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/preferences
// Must be defined BEFORE /:id — otherwise Express treats "preferences" as an ID.
// Called by OnboardingPage — saves exam board selections, subject_ids, daily goal.
// Body: { exam_boards: ['JAMB','WAEC'], subject_ids: [uuid,...],
//         daily_goal: 50, study_days: ['Mon','Tue'], study_time: 'evening' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/preferences', protect, async (req, res) => {
  const { exam_boards, subject_ids, daily_goal } = req.body;
  const userId = req.user.id;

  try {
    // 1. Save exam_boards via code lookup → student_exam_types
    if (Array.isArray(exam_boards) && exam_boards.length > 0) {
      for (const code of exam_boards) {
        const board = await sequelize.query(
          `SELECT id FROM exam_boards WHERE code = :code LIMIT 1`,
          { replacements: { code: code.toUpperCase() }, type: QueryTypes.SELECT }
        );
        if (board[0]) {
          await sequelize.query(
            `INSERT INTO student_exam_types (student_id, exam_board_id, is_active)
             VALUES (:userId, :boardId, true)
             ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true`,
            { replacements: { userId, boardId: board[0].id }, type: QueryTypes.INSERT }
          );
        }
      }
    }

    // 2. Save subject_ids — look up their exam_board_ids and upsert into student_exam_types
    if (Array.isArray(subject_ids) && subject_ids.length > 0) {
      const boardRows = await sequelize.query(
        `SELECT DISTINCT exam_board_id FROM subjects
         WHERE id = ANY(:subjectIds) AND is_active = true AND exam_board_id IS NOT NULL`,
        { replacements: { subjectIds: subject_ids }, type: QueryTypes.SELECT }
      );
      for (const row of boardRows) {
        await sequelize.query(
          `INSERT INTO student_exam_types (student_id, exam_board_id, is_active)
           VALUES (:userId, :boardId, true)
           ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true`,
          { replacements: { userId, boardId: row.exam_board_id }, type: QueryTypes.INSERT }
        );
      }
    }

    // 3. Save daily_goal
    if (daily_goal != null) {
      await sequelize.query(
        `UPDATE users SET daily_goal = :daily_goal, updated_at = NOW() WHERE id = :userId`,
        { replacements: { daily_goal: Number(daily_goal), userId }, type: QueryTypes.UPDATE }
      );
    }

    // 4. Save study_days + study_time
    if (Array.isArray(req.body.study_days)) {
      await sequelize.query(
        `UPDATE users
         SET preferred_study_days = :days,
             preferred_study_time = :time,
             updated_at           = NOW()
         WHERE id = :userId`,
        {
          replacements: {
            days:   req.body.study_days,
            time:   req.body.study_time || 'evening',
            userId,
          },
          type: QueryTypes.UPDATE,
        }
      );
    }

    // 5. Mark onboarding complete
    await sequelize.query(
      `UPDATE users SET onboarding_complete = true, updated_at = NOW() WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({ success: true, message: 'Preferences saved' });
  } catch (err) {
    console.error('[PATCH /users/preferences]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save preferences' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:id
// Must stay AFTER all named sub-routes (stats, preferences).
// Restricted to admin only.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, authorize('admin'), async (req, res) => {
  const userId = req.params.id;

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return res.status(400).json({ success: false, error: 'User ID is required' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         id, email, first_name, last_name, role, is_active,
         subscription_status, subscription_expires_at, created_at,
         last_login, xp_points, study_streak_days, onboarding_complete,
         avatar_url, phone, country
       FROM users
       WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[GET /users/:id]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/:id
// Permanently removes a user and their related data.
// Restricted to admin only. Cannot delete your own account.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  const userId = req.params.id;

  if (!userId || userId.trim() === '') {
    return res.status(400).json({ success: false, error: 'User ID is required' });
  }

  // Prevent admin from deleting their own account
  if (userId === req.user.id) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT id, email, role FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Delete the user (CASCADE handles related rows if FK constraints are set up)
    await sequelize.query(
      `DELETE FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.DELETE }
    );

    console.log(`[DELETE /users/:id] Admin ${req.user.id} deleted user ${userId} (${rows[0].email})`);
    return res.status(200).json({ success: true, message: `User ${rows[0].email} deleted successfully` });
  } catch (err) {
    console.error('[DELETE /users/:id]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

module.exports = router;