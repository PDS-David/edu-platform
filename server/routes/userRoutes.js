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
         WHERE (:role = '' OR u.role::text = :role)
           AND (:search = '' OR u.email      ILIKE :searchLike
                             OR u.first_name ILIKE :searchLike
                             OR u.last_name  ILIKE :searchLike)`,
        { replacements: { role, search, searchLike }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           u.id, u.email, u.first_name, u.last_name, u.role::text AS role,
           u.is_active, u.subscription_status::text AS subscription_status, u.created_at,
           0::INTEGER AS questions_submitted
         FROM users u
         WHERE (:role = '' OR u.role::text = :role)
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
    // Try a minimal query as fallback
    try {
      const fallback = await sequelize.query(
        `SELECT id, email, first_name, last_name, role,
                is_active, subscription_status::text AS subscription_status, created_at,
                0::INTEGER AS questions_submitted
         FROM users
         ORDER BY created_at DESC
         LIMIT :limit OFFSET :offset`,
        { replacements: { limit, offset }, type: QueryTypes.SELECT }
      );
      const countFallback = await sequelize.query(
        `SELECT COUNT(*)::INTEGER AS total FROM users`,
        { type: QueryTypes.SELECT }
      );
      return res.status(200).json({
        success: true,
        total:   countFallback[0]?.total || 0,
        page, limit,
        data:    fallback,
      });
    } catch (fallbackErr) {
      console.error('[GET /users] fallback also failed:', fallbackErr.message);
      return res.status(500).json({ success: false, error: err.message });
    }
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
// Called by OnboardingPage (goal/schedule only) and SettingsPage — saves
// daily_goal, study_days, study_time, and marks onboarding complete.
// Body: { daily_goal: 50, preferred_study_days: '["Mon","Tue"]',
//         preferred_study_time: 'evening' }
//
// SELF-SERVICE LOCKDOWN, closing a gap the Phase 3 exam-type/subject
// lockdown missed: this endpoint used to also accept `exam_boards` and
// `subject_ids` and write them straight into student_exam_types /
// student_subjects, with NO role check beyond being logged in, no limit
// enforcement, and — critically — no guard against being called again after
// onboarding. Every other self-service path into those two tables was
// closed (POST /subjects, DELETE /subjects/:subjectId, POST
// /exam-types/:examTypeId/join all 403 a student — see studentRoutes.js),
// but a student could always revisit /onboarding (that route is
// deliberately exempt from the onboarding-redirect check, since it IS the
// onboarding page) and silently re-enroll themselves into ANY exam board or
// subject via this route, completely undermining the lockdown and, by
// extension, the past-papers exam-board restriction (which trusts
// student_exam_types as the source of truth). exam_boards/subject_ids in
// the request body are now ignored entirely — assignment is exclusively
// via POST /api/schools/students/:studentId/assign-exam-type (school_admin
// or App Admin). OnboardingPage.jsx no longer sends these fields; if an
// older client still does, they're silently no-ops now rather than errors,
// so nothing breaks, they just stop having any effect.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/preferences', protect, async (req, res) => {
  const { daily_goal, preferred_study_days, preferred_study_time } = req.body;
  // SettingsPage sends preferred_study_days as a JSON string directly
  if (preferred_study_days !== undefined) req.body.study_days = JSON.parse(preferred_study_days || '[]');
  if (preferred_study_time !== undefined) req.body.study_time = preferred_study_time;
  const userId = req.user.id;

  try {
    // 1. Save daily_goal
    if (daily_goal != null) {
      await sequelize.query(
        `UPDATE users SET daily_goal = :daily_goal, updated_at = NOW() WHERE id = :userId`,
        { replacements: { daily_goal: Number(daily_goal), userId }, type: QueryTypes.UPDATE }
      );
    }

    // 2. Save study_days + study_time
    if (Array.isArray(req.body.study_days)) {
      await sequelize.query(
        `UPDATE users
         SET preferred_study_days = :days,
             preferred_study_time = :time,
             updated_at           = NOW()
         WHERE id = :userId`,
        {
          replacements: {
            days:   JSON.stringify(req.body.study_days),
            time:   req.body.study_time || 'evening',
            userId,
          },
          type: QueryTypes.UPDATE,
        }
      );
    }

    // 3. Mark onboarding complete
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
