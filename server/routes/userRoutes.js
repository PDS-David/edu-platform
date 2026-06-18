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
// Called by OnboardingPage — saves exam board selections, subject_ids, daily goal.
// Body: { exam_boards: ['JAMB','WAEC'], subject_ids: [uuid,...],
//         daily_goal: 50, study_days: ['Mon','Tue'], study_time: 'evening' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/preferences', protect, async (req, res) => {
  const { exam_boards, subject_ids, daily_goal,
          preferred_study_days, preferred_study_time } = req.body;
  // SettingsPage sends preferred_study_days as a JSON string directly
  if (preferred_study_days !== undefined) req.body.study_days = JSON.parse(preferred_study_days || '[]');
  if (preferred_study_time !== undefined) req.body.study_time = preferred_study_time;
  const userId = req.user.id;

  try {
    // 1. Save exam_boards → student_exam_types
    // exam_boards may arrive as either board CODES (strings, e.g. "WAEC") or
    // board IDs (numbers/UUID strings) — OnboardingPage.jsx specifically
    // sends IDs (it reads them from pending_exam_board_ids / a matched
    // board's .id), while the original code here assumed codes and called
    // code.toUpperCase() unconditionally. Calling .toUpperCase() on a
    // non-string ID throws a TypeError that was NOT caught by the inner
    // per-item try/catch below — it propagated to the outer catch and
    // returned a generic 500 with no indication of the real cause. This is
    // why "Set your study schedule" / Let's go! was failing with
    // "Failed to save preferences" in production.
    if (Array.isArray(exam_boards) && exam_boards.length > 0) {
      for (const raw of exam_boards) {
        if (raw == null) continue;
        let board;
        try {
          if (typeof raw === 'string' && /^[A-Za-z]+$/.test(raw)) {
            // Looks like a board code (letters only, e.g. "WAEC", "JAMB")
            board = await sequelize.query(
              `SELECT id FROM exam_boards WHERE code = :code LIMIT 1`,
              { replacements: { code: raw.toUpperCase() }, type: QueryTypes.SELECT }
            );
          } else {
            // Numeric or UUID — treat as an exam_board.id directly
            board = await sequelize.query(
              `SELECT id FROM exam_boards WHERE id::text = :id LIMIT 1`,
              { replacements: { id: String(raw) }, type: QueryTypes.SELECT }
            );
          }
        } catch (lookupErr) {
          console.error('[PATCH /users/preferences] exam_boards lookup failed for value', raw, lookupErr.message);
          continue; // skip this one board rather than fail the whole request
        }

        if (board?.[0]) {
          await sequelize.query(
            `INSERT INTO student_exam_types (student_id, exam_board_id, is_active)
             VALUES (:userId, :boardId, true)
             ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true`,
            { replacements: { userId, boardId: board[0].id }, type: QueryTypes.INSERT }
          );
        }
      }
    }

    // 2. Save subject_ids — upsert into student_subjects AND student_exam_types
    if (Array.isArray(subject_ids) && subject_ids.length > 0) {
      // Ensure student_subjects table exists (idempotent)
      await sequelize.query(
        `CREATE TABLE IF NOT EXISTS student_subjects (
           id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
           student_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           subject_id INTEGER     NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
           is_active  BOOLEAN     NOT NULL DEFAULT true,
           added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           UNIQUE(student_id, subject_id)
         )`,
        { type: QueryTypes.RAW }
      );

      // Save each selected subject.
      // FIX 2026-06-18: explicitly set status = 'approved' here (not just
      // is_active = true). resourceRoutes.js's assign-users entitlement
      // check filters recipients by `student_subjects.status = 'approved'`,
      // while this onboarding insert previously only set is_active and
      // relied on the column's model-level DEFAULT 'approved' — which is
      // NOT guaranteed by the inline CREATE TABLE IF NOT EXISTS fallback
      // above (it has no status column at all). Setting it explicitly here
      // means a student who enrolls in a subject via onboarding is
      // immediately visible to staff pushing assigned files/quizzes/tests
      // for that subject, regardless of which code path created the row.
      for (const sid of subject_ids) {
        const safeId = parseInt(sid);
        if (!safeId) continue;
        await sequelize.query(
          `INSERT INTO student_subjects (student_id, subject_id, is_active, status)
           VALUES (:userId, :subjectId, true, 'approved')
           ON CONFLICT (student_id, subject_id) DO UPDATE
             SET is_active = true,
                 status    = 'approved'`,
          { replacements: { userId, subjectId: safeId }, type: QueryTypes.INSERT }
        );
      }

      // Also save the boards those subjects belong to in student_exam_types
      //
      // FIX 2026-06-18: this previously used `id = ANY(:subjectIds)` with a
      // plain JS array passed as a Sequelize named replacement. Sequelize's
      // raw-query replacement binding does not reliably coerce a JS array
      // into a Postgres array literal for ANY() — it throws a type-mismatch
      // error ("operator does not exist: integer = integer[]" or similar)
      // depending on the pg/Sequelize version. That error was NOT caught by
      // any inner try/catch (unlike the exam_boards loop above), so it
      // propagated straight to the outer catch and killed the whole
      // request with a generic 500 ("Failed to save preferences"), even
      // though the student_subjects rows above had already been inserted.
      // This is the exact failure seen in production when a student
      // selected subjects (e.g. Chemistry), set a study goal/schedule, and
      // clicked "Let's go!" — DevTools showed
      // `PATCH api/users/preferences` → 500, and the student was stuck on
      // the final onboarding screen with onboarding_complete never set.
      //
      // Fix: use IN (:subjectIds), which Sequelize reliably expands for
      // raw replacements (this pattern is already used safely elsewhere in
      // this codebase). Also guard the empty-array case, since `IN ()` is
      // invalid SQL, and wrap the whole block in its own try/catch so a
      // failure here degrades gracefully — the subject enrollment itself
      // (already inserted above) is not lost just because the board
      // back-fill failed.
      try {
        const safeSubjectIds = subject_ids.map(Number).filter(Boolean);
        if (safeSubjectIds.length > 0) {
          const boardRows = await sequelize.query(
            `SELECT DISTINCT exam_board_id FROM subjects
             WHERE id IN (:subjectIds) AND is_active = true AND exam_board_id IS NOT NULL`,
            { replacements: { subjectIds: safeSubjectIds }, type: QueryTypes.SELECT }
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
      } catch (boardLookupErr) {
        console.error('[PATCH /users/preferences] board lookup from subjects failed', boardLookupErr.message);
        // Don't fail the whole request — subjects are already saved above,
        // and the exam_boards loop in step 1 (if the client sent
        // detectedBoards) already covers the common case.
      }

      // Persist individual subject selections into student_subjects.
      // NOTE: this previously inserted a `source` column that does not
      // exist anywhere in the schema (student_subjects has
      // `enrollment_source` instead, added by the enrollment-approval
      // migration, with allowed values 'explicit' | 'auto_enrolled' |
      // 'cascade'). That meant this INSERT threw on every single call —
      // harmless only because it was wrapped in its own try/catch, but it
      // silently meant enrollment_source was NEVER being set during
      // onboarding. Still wrapped defensively here because it's not
      // guaranteed every environment has run that migration yet — if the
      // column doesn't exist, this fails closed and the enrollment itself
      // (already inserted above, in the loop with `is_active`) is
      // unaffected.
      for (const sid of subject_ids) {
        try {
          await sequelize.query(
            `INSERT INTO student_subjects (student_id, subject_id, enrollment_source)
             VALUES (:userId, :sid, 'explicit')
             ON CONFLICT (student_id, subject_id) DO UPDATE SET enrollment_source = 'explicit'`,
            { replacements: { userId, sid }, type: QueryTypes.INSERT }
          );
        } catch (_e) {
          // enrollment_source column may not exist yet in this environment
          // (migration not yet run) — skip silently, enrollment itself
          // already succeeded via the is_active upsert above.
        }
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
            days:   JSON.stringify(req.body.study_days),
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
