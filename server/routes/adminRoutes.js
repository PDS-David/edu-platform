'use strict';
// server/routes/adminRoutes.js

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect }  = require('../middleware/auth');
const { generate } = require('../services/ai');
const { adminActionLimiter } = require('../middleware/rateLimiter');
const {
  normaliseEmail,
  validateEmail,
  validatePassword,
  normaliseName,
  validateName,
} = require('../utils/registrationValidators');
const { success, error } = require('../utils/response');
const { ENROLLMENT_SOURCE, ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');
const { ensureEnrollmentColumns } = require('./studentRoutes');
const audit = require('../services/auditLogger');
const { requireConfirmHeader, requireAdminConfirm } = require('../middleware/confirmDestructive');

// ─────────────────────────────────────────────
// AI JSON SANITIZER
// Gemini sometimes pretty-prints its JSON response with real newline/tab
// bytes used both as structural whitespace (between tokens, fine for JSON)
// AND inside string values (e.g. a multi-line explanation — invalid for
// JSON, which requires \n escaped inside strings). A naive global
// replace of every newline corrupts the structural whitespace too,
// producing exactly the malformed text seen in production:
//   "[\n{\n \"question_text\"..."
// — the literal two-character sequence \n sitting where a real newline
// used to be between tokens, which JSON.parse cannot tolerate either.
//
// This sanitizer walks the string character-by-character, tracking
// whether we are currently inside a double-quoted JSON string (respecting
// escape sequences), and only escapes control characters when inside a
// string. Structural whitespace outside strings is left completely alone.
// ─────────────────────────────────────────────
function sanitizeAiJson(raw) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        result += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        result += ch;
        inString = false;
        continue;
      }
      // Inside a string: escape raw control characters instead of
      // dropping or passing them through unescaped.
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { continue; } // drop bare \r — \n (if present) already escaped above
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch.charCodeAt(0) <= 0x1F) { continue; } // drop other control chars
      result += ch;
      continue;
    }

    // Outside a string — structural JSON whitespace is left untouched.
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    result += ch;
  }

  return result;
}

// ─────────────────────────────────────────────
// ADMIN GUARD
// ─────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return error(res, 'Admin access required', 403);
  }
  next();
};

// ─────────────────────────────────────────────
// POST /api/admin/create-teacher
// Admin-only. Creates a teacher account directly (no email verification required).
// Body: { email, password, first_name, last_name }
// ─────────────────────────────────────────────
router.post('/create-teacher', protect, adminOnly, adminActionLimiter, async (req, res) => {
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');

  // R-04: normalise email before any DB operation
  const email      = normaliseEmail(req.body.email);
  const password   = req.body.password;
  const first_name = normaliseName(req.body.first_name || '');
  const last_name  = normaliseName(req.body.last_name  || '');

  // Validate all inputs (R-04, R-05)
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return error(res, emailCheck.error, 400);

  const passCheck = validatePassword(password);
  if (!passCheck.valid) return error(res, passCheck.error, 400);

  const fnCheck = validateName(first_name, 'First name');
  if (!fnCheck.valid) return error(res, fnCheck.error, 400);

  try {
    const salt   = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(password, salt);
    const verificationToken        = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 86400000);

    // R-03: ON CONFLICT eliminates TOCTOU race; no preceding SELECT needed.
    const rows = await sequelize.query(
      `INSERT INTO users
         (email, password, first_name, last_name, role,
          verification_token, verification_token_expires,
          is_active, is_verified, subscription_status,
          subscription_expires_at, pending_exam_board_ids,
          created_at, updated_at)
       VALUES
         (:email, :password, :first_name, :last_name, 'teacher',
          :verificationToken, :verificationTokenExpires,
          true, true, 'free_trial',
          NOW() + INTERVAL '14 days', '{}',
          NOW(), NOW())
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, first_name, last_name, role, is_active, created_at`,
      {
        replacements: {
          email,
          password:                hashed,
          first_name,
          last_name:               last_name || first_name,
          verificationToken,
          verificationTokenExpires,
        },
        type: QueryTypes.SELECT,
      }
    );

    // 0 rows ⟹ email already existed
    if (!rows || rows.length === 0) {
      return error(res, 'An account with that email already exists', 409);
    }

    await audit.log(req, audit.ACTIONS.TEACHER_CREATE, {
      targetType: 'user', targetId: rows[0].id, targetEmail: rows[0].email,
      metadata: { first_name: rows[0].first_name, last_name: rows[0].last_name },
    });

    // T3: send welcome email to the new teacher (non-fatal — account is already created)
    try {
      const emailSvc = require('../services/emailService');
      await emailSvc.sendTeacherWelcomeEmail({
        email:      rows[0].email,
        first_name: rows[0].first_name,
        password:   password,   // plain-text password before hashing, safe to send once
      });
    } catch (emailErr) {
      console.warn('[create-teacher] welcome email failed:', emailErr.message);
    }

    return success(res, { user: rows[0] }, null, 201);
  } catch (err) {
    console.error('[POST /admin/create-teacher]', err.message);
    // R-03: catch stray 23505 and translate — never leak raw DB errors
    if (err.parent?.code === '23505' || err.original?.code === '23505' || err.message?.includes('23505')) {
      return error(res, 'An account with that email already exists', 409);
    }
    return error(res, 'Failed to create teacher account');
  }
});
// Powers PlatformAnalyticsPanel in AdminDashboard.
// Returns: { users, questions, revenue, top_subjects, daily_activity }
// All queries use practice_attempts as the primary activity source.
// quiz_attempts is only consulted as a fallback for daily_activity.
// ─────────────────────────────────────────────
router.get('/platform-stats', protect, adminOnly, async (req, res) => {
  try {
    // ── User stats ────────────────────────────────────────────────────────────
    // role::text cast avoids enum comparison issues on strict PG configs.
    // COALESCE(last_login, created_at) guards against NULL last_login for new accounts.
    // Isolated try/catch: a users-table failure returns zero defaults while
    // the remaining sections (questions, revenue, top_subjects, daily_activity)
    // still execute and return real data.
    let userRow = { students: 0, active_today: 0, new_this_week: 0 };
    try {
      const [_userRow] = await sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE role::text = 'student')                                        AS students,
          COUNT(*) FILTER (WHERE role::text = 'student'
                             AND COALESCE(last_login, created_at) >= NOW() - INTERVAL '1 day')  AS active_today,
          COUNT(*) FILTER (WHERE role::text = 'student'
                             AND created_at >= NOW() - INTERVAL '7 days')                       AS new_this_week
        FROM users
      `, { type: QueryTypes.SELECT });
      if (_userRow) userRow = _userRow;
    } catch (e) {
      console.warn('[platform-stats] users stats fallback:', e.message.slice(0, 80));
    }

    // ── Question / attempt stats ──────────────────────────────────────────────
    // Source: practice_attempts (always present, one row per answered question).
    // quiz_attempts is NOT used here — it aggregates full quiz sessions, not
    // individual question events, so its COUNT overstates daily question volume.
    // total_pending: AI-generated questions awaiting admin approval.
    let qRow = { answered_today: 0, answered_this_week: 0, total_pending: 0 };
    try {
      const [_qRow] = await sequelize.query(`
        SELECT
          -- Distinct questions answered in the last 24 hours
          COUNT(*) FILTER (WHERE attempted_at >= NOW() - INTERVAL '1 day')   AS answered_today,
          -- Distinct questions answered in the last 7 days
          COUNT(*) FILTER (WHERE attempted_at >= NOW() - INTERVAL '7 days')  AS answered_this_week,
          -- AI questions not yet approved/active
          (SELECT COUNT(*) FROM questions
            WHERE COALESCE(status, 'pending') NOT IN ('approved','active','rejected'))::INTEGER AS total_pending
        FROM practice_attempts
      `, { type: QueryTypes.SELECT });
      if (_qRow) qRow = _qRow;
    } catch (e) {
      // practice_attempts may not exist in early deployments — log and keep zeros
      console.warn('[platform-stats] question stats fallback:', e.message.slice(0, 80));
    }

    // ── Revenue / subscription stats ──────────────────────────────────────────
    // subscription_status column may be enum; cast defensively.
    let revRow = { total_active_subs: 0, new_subs_this_month: 0 };
    try {
      const [_revRow] = await sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE subscription_status::text = 'active')                        AS total_active_subs,
          COUNT(*) FILTER (WHERE subscription_status::text = 'active'
                             AND created_at >= NOW() - INTERVAL '30 days')                    AS new_subs_this_month
        FROM users
      `, { type: QueryTypes.SELECT });
      if (_revRow) revRow = _revRow;
    } catch (e) {
      console.warn('[platform-stats] revenue stats fallback:', e.message.slice(0, 80));
    }

    // ── Top subjects by activity (last 30 days) ───────────────────────────────
    // Source: practice_attempts via the canonical content hierarchy:
    //   practice_attempts → questions → subtopics → topics → subjects
    // This replaces the old path through quiz_attempts + student_answers which
    // depends on two tables that may be empty or nonexistent.
    // A subject only appears here when at least one of its questions has been
    // attempted in the last 30 days (HAVING count >= 1 is implicit via JOIN).
    let topSubjects = [];
    try {
      topSubjects = await sequelize.query(`
        SELECT
          s.name,
          COUNT(pa.id)::INTEGER                                                         AS attempt_count,
          ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END), 1)               AS avg_accuracy
        FROM practice_attempts pa
        -- Traverse full content chain — questions have no direct subject_id column
        JOIN questions  q  ON q.id  = pa.question_id
        JOIN subtopics  st ON st.id = q.subtopic_id
        JOIN topics     t  ON t.id  = st.topic_id
        JOIN subjects   s  ON s.id  = t.subject_id
        WHERE pa.attempted_at >= NOW() - INTERVAL '30 days'
        GROUP BY s.id, s.name
        ORDER BY attempt_count DESC, avg_accuracy DESC
        LIMIT 5
      `, { type: QueryTypes.SELECT });
    } catch (e) {
      console.warn('[platform-stats] top subjects fallback:', e.message.slice(0, 80));
    }

    // ── Daily activity — last 14 days ─────────────────────────────────────────
    // Primary source: practice_attempts.attempted_at (one row per question event).
    // Fallback: quiz_attempts.created_at if practice_attempts is unavailable.
    // Response shape: [{ date: "YYYY-MM-DD", attempt_count: N }]
    let dailyActivity = [];
    try {
      dailyActivity = await sequelize.query(`
        SELECT
          TO_CHAR(attempted_at::DATE, 'YYYY-MM-DD') AS date,
          COUNT(*)::INTEGER                          AS attempt_count
        FROM practice_attempts
        WHERE attempted_at >= NOW() - INTERVAL '14 days'
        GROUP BY attempted_at::DATE
        ORDER BY attempted_at::DATE ASC
      `, { type: QueryTypes.SELECT });
    } catch (_) {
      // practice_attempts unavailable — try quiz_attempts as a secondary source
      try {
        dailyActivity = await sequelize.query(`
          SELECT
            TO_CHAR(created_at::DATE, 'YYYY-MM-DD') AS date,
            COUNT(*)::INTEGER                        AS attempt_count
          FROM quiz_attempts
          WHERE created_at >= NOW() - INTERVAL '14 days'
          GROUP BY created_at::DATE
          ORDER BY created_at::DATE ASC
        `, { type: QueryTypes.SELECT });
      } catch (e) {
        console.warn('[platform-stats] daily activity fallback exhausted:', e.message.slice(0, 80));
      }
    }

    return res.json({
      success: true,
      data: {
        users: {
          students:      parseInt(userRow?.students)      || 0,
          active_today:  parseInt(userRow?.active_today)  || 0,
          new_this_week: parseInt(userRow?.new_this_week) || 0,
        },
        questions: {
          answered_today:      parseInt(qRow.answered_today)      || 0,
          answered_this_week:  parseInt(qRow.answered_this_week)  || 0,
          total_pending:       parseInt(qRow.total_pending)        || 0,
        },
        revenue: {
          total_active_subs:    parseInt(revRow.total_active_subs)    || 0,
          new_subs_this_month:  parseInt(revRow.new_subs_this_month)  || 0,
        },
        top_subjects:   topSubjects,
        daily_activity: dailyActivity,
      },
    });
  } catch (err) {
    console.error('[GET /admin/platform-stats]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/students
// Lists STANDALONE students only — role='student' AND school_id IS NULL,
// i.e. people using the app directly rather than through a tenant school.
// Tenant students already have an equivalent view (a school_admin's own
// roster, GET /api/schools/me/roster) — this is the App Admin's
// equivalent for the population that has no school_admin looking after
// them at all. Optional ?search= filters by name/email (simple ILIKE,
// matching the scale expected here — this is not meant to paginate
// millions of rows, just make a reasonably-sized standalone-student list
// findable).
// ─────────────────────────────────────────────
router.get('/students', protect, adminOnly, async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const params = {};
    let searchClause = '';
    if (search) {
      searchClause = `AND (first_name ILIKE :search OR last_name ILIKE :search OR email ILIKE :search)`;
      params.search = `%${search}%`;
    }
    const rows = await sequelize.query(
      `SELECT id, first_name, last_name, email, created_at, last_login
         FROM users
        WHERE role::text = 'student' AND school_id IS NULL
        ${searchClause}
        ORDER BY created_at DESC
        LIMIT 200`,
      { replacements: params, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /admin/students]', err.message);
    return res.status(500).json({ success: false, error: 'Could not load students' });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/subjects
// Flat list for the AI question generator subject dropdown.
// ─────────────────────────────────────────────
router.get('/subjects', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, name FROM subjects WHERE COALESCE(is_active, true) = true ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /admin/subjects]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/questions/pending-count
// Badge count for AI-generated questions awaiting review.
// ─────────────────────────────────────────────
router.get('/questions/pending-count', protect, adminOnly, async (req, res) => {
  try {
    const [row] = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM questions
       WHERE COALESCE(status, 'pending') NOT IN ('approved', 'active', 'rejected')`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, count: row.count || 0 });
  } catch (err) {
    console.error('[GET /admin/questions/pending-count]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// QUESTION REVIEW ROUTES
// ─────────────────────────────────────────────

// GET /api/admin/questions/pending  — list questions awaiting review
router.get('/questions/pending', protect, adminOnly, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '10', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);

    const rows = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.options, q.correct_answer,
         q.difficulty, q.explanation, q.status, q.is_ai_generated,
         q.created_at,
         u.first_name, u.last_name, u.email AS submitted_by_email,
         s.name AS subject_name, st.name AS subtopic_name
       FROM questions q
       LEFT JOIN users      u  ON q.submitted_by  = u.id
       LEFT JOIN subtopics  st ON q.subtopic_id   = st.id
       LEFT JOIN subjects   s  ON st.subject_id   = s.id
       WHERE COALESCE(q.status, 'pending') NOT IN ('approved', 'active', 'rejected')
       ORDER BY q.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { limit, offset }, type: QueryTypes.SELECT }
    );

    const [countRow] = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM questions
       WHERE COALESCE(status, 'pending') NOT IN ('approved', 'active', 'rejected')`,
      { type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: rows, total: countRow?.count || 0 });
  } catch (err) {
    console.error('[GET /admin/questions/pending]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});


// ── GET /api/admin/questions/orphaned ─────────────────────────────────────────
// Lists approved/active questions with no subtopic_id — these were silently
// excluded from every subject's practice pool by the cross-subject
// contamination fix in questionsRoutes.js. Surfaced here so admin can
// manually reassign a subtopic_id (the only safe way to recover them —
// confirmed via direct DB query that no automated inference is possible:
// 54% have no submitted_by at all, 36% belong to the generic Platform
// Admin account, and every teacher who submitted the rest is assigned to
// multiple subjects, so no single-subject inference can be made safely).
router.get('/questions/orphaned', protect, adminOnly, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '20', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);

    const rows = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.options, q.correct_answer,
         q.difficulty, q.explanation, q.created_at,
         u.first_name, u.last_name, u.email AS submitted_by_email
       FROM questions q
       LEFT JOIN users u ON q.submitted_by = u.id
       WHERE q.subtopic_id IS NULL
         AND q.is_active = true
         AND COALESCE(q.status, 'pending') IN ('approved', 'active')
       ORDER BY q.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { limit, offset }, type: QueryTypes.SELECT }
    );

    const [countRow] = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM questions
       WHERE subtopic_id IS NULL
         AND is_active = true
         AND COALESCE(status, 'pending') IN ('approved', 'active')`,
      { type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: rows, total: countRow?.count || 0 });
  } catch (err) {
    console.error('[GET /admin/questions/orphaned]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/admin/questions/:id/assign-subtopic ──────────────────────────────
// Manually assigns a subtopic_id to an orphaned question, making it eligible
// for that subtopic's subject practice/quiz pool going forward.
router.put('/questions/:id/assign-subtopic', protect, adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { subtopic_id } = req.body;
    if (!subtopic_id) {
      return res.status(400).json({ success: false, error: 'subtopic_id is required' });
    }

    const subtopicCheck = await sequelize.query(
      `SELECT id FROM subtopics WHERE id = :subtopic_id LIMIT 1`,
      { replacements: { subtopic_id }, type: QueryTypes.SELECT }
    );
    if (!subtopicCheck.length) {
      return res.status(404).json({ success: false, error: 'Subtopic not found' });
    }

    await sequelize.query(
      `UPDATE questions SET subtopic_id = :subtopic_id, updated_at = NOW() WHERE id = :id`,
      { replacements: { subtopic_id, id }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true, message: 'Question reassigned to subtopic' });
  } catch (err) {
    console.error('[PUT /admin/questions/:id/assign-subtopic]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/questions/:id/review  — approve or reject a question
router.put('/questions/:id/review', protect, adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const { action, feedback } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be "approve" or "reject"' });
    }
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await sequelize.query(
      `UPDATE questions
       SET status = :status,
           review_feedback = :feedback,
           reviewed_by = :reviewer,
           reviewed_at = NOW(),
           updated_at  = NOW()
       WHERE id = :id`,
      {
        replacements: {
          status:   newStatus,
          feedback: feedback?.trim() || null,
          reviewer: req.user.id,
          id:       req.params.id,
        },
        type: QueryTypes.UPDATE,
      }
    );

    const qAction = req.body.action === 'approve' ? audit.ACTIONS.QUESTION_APPROVE : audit.ACTIONS.QUESTION_REJECT;
    await audit.log(req, qAction, {
      targetType: 'question', targetId: req.params.id,
      metadata: { status: newStatus, feedback: feedback?.trim() || null },
    });

    return res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('[PUT /admin/questions/:id/review]', err.message);
    // Column might not exist yet — try without the optional columns
    try {
      const newStatus = req.body.action === 'approve' ? 'approved' : 'rejected';
      await sequelize.query(
        `UPDATE questions SET status = :status, updated_at = NOW() WHERE id = :id`,
        { replacements: { status: newStatus, id: req.params.id }, type: QueryTypes.UPDATE }
      );
      return res.json({ success: true, status: newStatus });
    } catch (err2) {
      return res.status(500).json({ success: false, error: err2.message });
    }
  }
});

// ─────────────────────────────────────────────
// POST /api/admin/send-weekly-digest
// Manually triggers the same weekly digest the Monday 9am WAT cron job runs
// (server/jobs/scheduledJobs.js::runWeeklyDigest) — useful for an admin who
// wants to send it now rather than wait for the schedule, or to verify it
// actually works. Reuses the exact same function as the cron job so there
// is only one implementation of "what a weekly digest is" to keep correct,
// not two that can drift apart.
// ─────────────────────────────────────────────
router.post('/send-weekly-digest', protect, adminOnly, async (req, res) => {
  try {
    const { runWeeklyDigest } = require('../jobs/scheduledJobs');
    console.log(`[admin] Weekly digest manually triggered by admin ${req.user.id} at ${new Date().toISOString()}`);
    const result = await runWeeklyDigest();
    return res.json({
      success: true,
      message: `Weekly digest sent to ${result.sent} of ${result.total} eligible student(s)${result.failed ? ` (${result.failed} failed)` : ''}.`,
      ...result,
    });
  } catch (err) {
    console.error('[POST /admin/send-weekly-digest]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/admin/send-notification
// Sends an in-app notification to all users, students only, or teachers only.
// Body: { target: 'all'|'students'|'teachers', title: string, message: string }
// ─────────────────────────────────────────────
router.post('/send-notification', protect, adminOnly, adminActionLimiter, async (req, res) => {
  try {
    const { target = 'all', title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'title and message are required' });
    }

    const roleMap = { students: 'student', teachers: 'teacher' };
    const roleFilter = roleMap[target] ? ` AND role = '${roleMap[target]}'` : '';

    const users = await sequelize.query(
      `SELECT id FROM users WHERE is_active = true${roleFilter}`,
      { type: QueryTypes.SELECT }
    );

    if (users.length === 0) {
      return success(res, { sent: 0, message: 'No matching users found' });
    }

    // Check if notifications table has updated_at column
    const cols = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND column_name='updated_at'`,
      { type: QueryTypes.SELECT }
    );
    const hasUpdatedAt = cols.length > 0;

    await Promise.all(users.map(u =>
      sequelize.query(
        hasUpdatedAt
          ? `INSERT INTO notifications (user_id, title, message, type, created_at, updated_at) VALUES (:uid, :title, :msg, 'info', NOW(), NOW())`
          : `INSERT INTO notifications (user_id, title, message, type, created_at) VALUES (:uid, :title, :msg, 'info', NOW())`,
        { replacements: { uid: u.id, title, msg: message }, type: QueryTypes.INSERT }
      )
    ));

    console.log(`[admin] Notification sent to ${users.length} users by admin ${req.user.id}`);
    await audit.log(req, audit.ACTIONS.NOTIFICATION_SEND, {
      metadata: { target, title, sent_count: users.length },
    });
    // A6 fix: this endpoint only ever writes in-app notification rows — it
    // never sends email. The admin UI previously had no way to know that,
    // so a "Notification sent" success message implied email delivery that
    // never happened. Surface whether email is even configured on this
    // server, so the frontend can show an accurate message.
    const emailEnabled = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER);
    return success(res, { sent: users.length, email_enabled: emailEnabled });
  } catch (err) {
    console.error('[POST /admin/send-notification]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// AI QUESTION GENERATION
// ─────────────────────────────────────────────
router.post('/generate-questions', protect, adminOnly, async (req, res) => {
  const rawCount = req.body.count;
  const count = Math.min(Math.max(parseInt(rawCount) || 10, 1), 15);
  const { subject_id, topic, subtopic_id, difficulty = 'medium' } = req.body;

  if (!subject_id || !topic) {
    return error(res, 'subject_id and topic are required', 400);
  }

  try {
    const subjectRows = await sequelize.query(
      `SELECT name FROM subjects WHERE id = :id`,
      { replacements: { id: subject_id }, type: QueryTypes.SELECT }
    );

    if (!subjectRows.length) return error(res, 'Subject not found', 404);

    // Resolve subtopic_id: if none provided, try to find a subtopic whose
    // name matches the typed topic text so AI-generated questions are
    // discoverable on the student quiz page (which JOINs on subtopic_id).
    let resolvedSubtopicId = subtopic_id || null;
    if (!resolvedSubtopicId && topic.trim()) {
      const stRows = await sequelize.query(
        `SELECT st.id FROM subtopics st
           JOIN topics t ON t.id = st.topic_id
          WHERE t.subject_id = :subjectId
            AND LOWER(st.name) = LOWER(:name)
          LIMIT 1`,
        { replacements: { subjectId: subject_id, name: topic.trim() }, type: QueryTypes.SELECT }
      ).catch(() => []);
      resolvedSubtopicId = stRows[0]?.id || null;
    }

    const prompt = `Generate ${count} ${difficulty} multiple-choice questions on the topic "${topic}" for the subject "${subjectRows[0].name}". Return ONLY a valid JSON array, no markdown. Each object must have: question_text (string), options (array of 4 strings), correct_answer (string matching one option exactly), explanation (string).`;

    const raw     = await generate(prompt, 'generate-questions');
    const cleaned = raw.replace(/```json|```/g, '').trim();

    // BUG FIX: Gemini occasionally emits raw, unescaped control characters
    // (literal newlines/tabs/carriage returns) inside JSON string values —
    // e.g. when writing a multi-line explanation or a stacked equation. The
    // JSON spec requires these to be escaped as \n/\t inside strings;
    // JSON.parse throws "Bad control character in string literal" and the
    // ENTIRE batch generation fails, even though only one field in one
    // question is malformed. sanitizeAiJson() only escapes control
    // characters that fall INSIDE a quoted JSON string — structural
    // whitespace between tokens (which a naive global regex previously
    // corrupted) is left untouched.
    const sanitized = sanitizeAiJson(cleaned);

    let questions;
    try {
      questions = JSON.parse(sanitized);
    } catch (parseErr) {
      // Sanitization couldn't fix it — give the admin a clearer error than
      // a raw JSON.parse stack trace with a byte offset.
      return error(res, `AI returned malformed data and could not be parsed: ${parseErr.message}. Try generating again or reduce the question count.`, 502);
    }

    let inserted = 0;
    let skipped  = 0;
    const skippedReasons = [];

    // Same Unicode-aware normalization used by the grading endpoints
    // (questionsRoutes.js POST /:id/answer, quizzes.js POST /attempt) so
    // that is_correct is flagged using the identical comparison that will
    // later be used to grade against it — eliminates the class of bug where
    // insert-time matching and grading-time matching disagree.
    const normalizeForMatch = (s) =>
      String(s ?? '')
        .replace(/[\u2018\u2019\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201F]/g, '"')
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    for (const q of questions) {
      if (!q.question_text) { skipped++; continue; }

      const rawOptions = Array.isArray(q.options) ? q.options : [];
      const normOptions = rawOptions.map(opt => {
        if (typeof opt === 'string') {
          return {
            option_text: opt,
            is_correct:  normalizeForMatch(opt) === normalizeForMatch(q.correct_answer || ''),
          };
        }
        return { option_text: opt.option_text || opt.text || String(opt), is_correct: !!opt.is_correct };
      }).filter(o => o.option_text && o.option_text.trim()); // drop blank/garbage entries

      const anyCorrect = normOptions.some(o => o.is_correct);
      if (!anyCorrect && q.correct_answer) {
        normOptions.forEach(o => {
          o.is_correct = normalizeForMatch(o.option_text) === normalizeForMatch(q.correct_answer);
        });
      }

      // BUG FIX: Gemini occasionally omits/malforms the options array for a
      // question in a batch (wrong key name, fewer than 4, no option marked
      // correct). The old code silently inserted these with options: [] —
      // they passed validation (only question_text was checked), reached
      // 'pending', and an admin could approve them in the Review Queue
      // without any visual warning (the review UI also just renders an
      // empty grid for zero options). Students then hit a question with no
      // answer choices at all. Now: skip and report instead of saving
      // broken data. The admin sees exactly how many were skipped and can
      // retry generation for that slot.
      if (normOptions.length < 2) {
        skipped++;
        skippedReasons.push(`"${q.question_text.slice(0, 60)}..." — only ${normOptions.length} usable option(s)`);
        continue;
      }
      if (!normOptions.some(o => o.is_correct)) {
        skipped++;
        skippedReasons.push(`"${q.question_text.slice(0, 60)}..." — no correct option identified`);
        continue;
      }

      // POLICY: AI-generated questions always require admin review before
      // reaching students — status='pending', not 'approved', even when an
      // admin is the one triggering generation. A prior commit (194383c)
      // changed this to 'approved' to work around questions being invisible
      // on the student quiz page, but the actual cause was twofold: (1) no
      // subtopic_id was being saved, so the hard JOIN in /questions/random
      // excluded them entirely — now fixed above (resolvedSubtopicId); and
      // (2) the review queue wasn't being used at all. Skipping review was
      // the wrong fix for that visibility bug. The real fix is: save
      // subtopic_id correctly (kept), and have the admin actually approve
      // generated batches from the Question Review Queue — which takes one
      // click per question and is the explicit, audited record that this
      // admin reviewed and approved this specific content before students
      // see it, exactly like every other AI-generated question in the
      // system (quiz fallback, remediation engine, etc).
      await sequelize.query(
        `INSERT INTO questions
           (question_text, options, correct_answer, explanation, difficulty,
            subtopic_id, type, is_active, is_ai_generated, status, created_at, updated_at)
         VALUES (:q, :o::jsonb, :c, :e, :d,
                 :subtopicId, 'mcq', true, true, 'pending', NOW(), NOW())`,
        {
          replacements: {
            q: q.question_text,
            o: JSON.stringify(normOptions),
            c: q.correct_answer  || null,
            e: q.explanation     || null,
            d: difficulty,
            subtopicId: resolvedSubtopicId,
          },
          type: QueryTypes.INSERT,
        }
      );
      inserted++;
    }

    return success(res, {
      generated: questions.length,
      inserted,
      skipped,
      skipped_reasons: skippedReasons,
      questions,
      subtopic_id: resolvedSubtopicId,
      message: skipped > 0
        ? `${inserted} question(s) saved for review, ${skipped} skipped due to missing/invalid options.`
        : `${inserted} question(s) saved for review.`,
    });
  } catch (err) {
    console.error('[admin.generate]', err.message);
    return error(res, 'AI generation failed: ' + err.message);
  }
});

// ─────────────────────────────────────────────
// TEACHER ASSIGNMENTS
// ─────────────────────────────────────────────
router.get('/teacher-assignments', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ts.id,
              u.id         AS teacher_id,
              u.email,
              u.first_name || ' ' || COALESCE(u.last_name, '') AS teacher_name,
              u.first_name,
              u.last_name,
              s.id         AS subject_id,
              s.name       AS subject_name,
              eb.code      AS exam_board_code,
              eb.name      AS exam_board_name,
              ts.is_active,
              ts.assigned_at
       FROM teacher_subjects ts
       JOIN users       u  ON u.id::text  = ts.teacher_id::text
       JOIN subjects    s  ON s.id::text  = ts.subject_id::text
       LEFT JOIN exam_boards eb ON eb.id::text = s.exam_board_id::text
       WHERE ts.is_active = true
       ORDER BY u.last_name ASC, s.name ASC`,
      { type: QueryTypes.SELECT }
    );
    return success(res, rows);
  } catch (err) {
    // Return empty list so the frontend can still render the teachers dropdown
    console.error('[GET /admin/teacher-assignments]', err.message);
    return success(res, []);
  }
});

router.post('/teacher-assignments', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id } = req.body;
  if (!teacher_id || !subject_id) return error(res, 'teacher_id and subject_id required', 400);

  try {
    await sequelize.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, is_active)
       VALUES (:t, :s, true)
       ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true`,
      { replacements: { t: teacher_id, s: subject_id }, type: QueryTypes.INSERT }
    );
    return success(res, { message: 'Assignment saved' });
  } catch (err) {
    console.error('[POST /admin/teacher-assignments]', err.message);
    return error(res, 'Failed to save assignment');
  }
});

router.delete('/teacher-assignments/:id', protect, adminOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active = false WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
    );
    return success(res, { message: 'Assignment removed' });
  } catch (err) {
    console.error('[DELETE /admin/teacher-assignments/:id]', err.message);
    return error(res, 'Failed to delete assignment');
  }
});

// Issue 2: edit an existing assignment's subject (swap subject_id on the
// same row instead of forcing delete + recreate). teacher_id is immutable
// here — the row's owner doesn't change, only which subject they cover.
router.put('/teacher-assignments/:id', protect, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { subject_id } = req.body;
  if (!subject_id) return error(res, 'subject_id required', 400);

  try {
    const existing = await sequelize.query(
      `SELECT id, teacher_id FROM teacher_subjects WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!existing.length) return error(res, 'Assignment not found', 404);

    // Guard against creating a duplicate (teacher_id, subject_id) pair —
    // the table already has a UNIQUE/ON CONFLICT constraint on that combo
    // (see POST handler above), so check first to return a clear error
    // instead of a raw constraint-violation message.
    const dup = await sequelize.query(
      `SELECT id FROM teacher_subjects
        WHERE teacher_id = :teacherId AND subject_id = :subjectId AND id != :id`,
      { replacements: { teacherId: existing[0].teacher_id, subjectId: subject_id, id }, type: QueryTypes.SELECT }
    );
    if (dup.length) return error(res, 'This teacher is already assigned to that subject', 409);

    await sequelize.query(
      `UPDATE teacher_subjects SET subject_id = :subjectId, is_active = true WHERE id = :id`,
      { replacements: { subjectId: subject_id, id }, type: QueryTypes.UPDATE }
    );
    return success(res, { message: 'Assignment updated' });
  } catch (err) {
    console.error('[PUT /admin/teacher-assignments/:id]', err.message);
    return error(res, 'Failed to update assignment');
  }
});

// ─────────────────────────────────────────────
// TEACHER-SUBJECTS ALIASES
// TeacherAssignmentPage calls /admin/teacher-subjects — alias to same handlers
// ─────────────────────────────────────────────
router.get('/teacher-subjects', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ts.id, u.email, u.first_name, u.last_name, s.name AS subject
       FROM teacher_subjects ts
       JOIN users    u ON u.id = ts.teacher_id
       JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.is_active = true
       ORDER BY u.email, s.name`,
      { type: QueryTypes.SELECT }
    );
    return success(res, rows);
  } catch (err) {
    console.error('[GET /admin/teacher-subjects]', err.message);
    return error(res, 'Failed to fetch assignments');
  }
});

router.post('/teacher-subjects', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id, exam_board_id } = req.body;
  if (!teacher_id || !subject_id) return error(res, 'teacher_id and subject_id required', 400);
  try {
    await sequelize.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, is_active)
       VALUES (:t, :s, true)
       ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true`,
      { replacements: { t: teacher_id, s: subject_id }, type: QueryTypes.INSERT }
    );
    return success(res, { message: 'Assignment saved' });
  } catch (err) {
    console.error('[POST /admin/teacher-subjects]', err.message);
    return error(res, 'Failed to save assignment');
  }
});

router.delete('/teacher-subjects/:id', protect, adminOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active = false WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
    );
    return success(res, { message: 'Assignment removed' });
  } catch (err) {
    console.error('[DELETE /admin/teacher-subjects/:id]', err.message);
    return error(res, 'Failed to delete assignment');
  }
});

module.exports = router;

// ── POST /api/admin/generate-topics ──────────────────────────────────────────
// Uses Gemini AI to generate curriculum-appropriate topics and subtopics for a
// given subject, then inserts them into the database.
// Body: { subject_id, subject_name, exam_board_code }
router.post('/generate-topics', protect, adminOnly, async (req, res) => {
  const { subject_id, subject_name, exam_board_code = 'WAEC' } = req.body;
  if (!subject_id || !subject_name) {
    return res.status(400).json({ success: false, error: 'subject_id and subject_name are required' });
  }

  // Check if topics already exist
  const existing = await sequelize.query(
    `SELECT COUNT(*)::int AS cnt FROM topics WHERE subject_id = :subjectId AND is_active = true`,
    { replacements: { subjectId: parseInt(subject_id) }, type: QueryTypes.SELECT }
  );
  if (existing[0]?.cnt > 0) {
    return res.json({ success: true, message: 'Topics already exist', already_exists: true });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ success: false, error: 'AI not configured — set GEMINI_API_KEY' });
  }

  try {
    const prompt = `You are a Nigerian secondary school curriculum expert.
Generate a structured list of topics and subtopics for ${exam_board_code} ${subject_name}.

Return ONLY valid JSON — no markdown, no preamble:
{
  "topics": [
    {
      "name": "Topic name",
      "subtopics": ["Subtopic 1", "Subtopic 2", "Subtopic 3"]
    }
  ]
}

Rules:
- Produce 8-12 topics, each with 3-6 subtopics
- Topics must match the official ${exam_board_code} ${subject_name} syllabus
- Names must be concise (3-7 words)
- Order topics from foundational to advanced`;

    const raw     = await generate(prompt, 'generate-questions');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const sanitized = sanitizeAiJson(cleaned);

    let parsed;
    try {
      parsed = JSON.parse(sanitized);
    } catch (parseErr) {
      return res.status(502).json({
        success: false,
        error: `AI returned malformed data and could not be parsed: ${parseErr.message}. Try generating again.`,
      });
    }
    const topicsArr = parsed.topics || [];

    if (!topicsArr.length) {
      return res.status(500).json({ success: false, error: 'AI returned no topics' });
    }

    let created = 0;
    for (let i = 0; i < topicsArr.length; i++) {
      const t = topicsArr[i];
      const [topicRow] = await sequelize.query(
        `INSERT INTO topics (subject_id, name, order_index, is_active, created_at, updated_at)
         VALUES (:subjectId, :name, :order, true, NOW(), NOW())
         RETURNING id`,
        { replacements: { subjectId: parseInt(subject_id), name: t.name, order: i }, type: QueryTypes.SELECT }
      );
      const topicId = topicRow?.id;
      if (!topicId) continue;

      for (let j = 0; j < (t.subtopics || []).length; j++) {
        await sequelize.query(
          `INSERT INTO subtopics (topic_id, subject_id, name, order_index, is_active, created_at, updated_at)
           VALUES (:topicId, :subjectId, :name, :order, true, NOW(), NOW())`,
          { replacements: { topicId, subjectId: parseInt(subject_id), name: t.subtopics[j], order: j }, type: QueryTypes.INSERT }
        ).catch(() => {}); // ignore subtopic insert errors
      }
      created++;
    }

    return res.json({ success: true, message: `Generated ${created} topics with subtopics`, count: created });
  } catch (err) {
    console.error('[POST /admin/generate-topics]', err.message);
    return res.status(500).json({ success: false, error: 'Topic generation failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/health
// One-shot smoke check of the 15-step onboarding workflow.
//   ?full=1 → in addition to schema/seed checks, runs a live walkthrough
//             (creates throw-away exam type, subject, topic, subtopic,
//              question, resource and a synthetic student) to verify every
//              step end-to-end. Cleans up after itself.
// Always admin-only.
// ─────────────────────────────────────────────
router.get('/health', protect, adminOnly, async (req, res) => {
  const checks = [];
  const t0 = Date.now();
  const ok = (name, info = '') => checks.push({ name, ok: true, info });
  const ko = (name, info = '') => checks.push({ name, ok: false, info });

  // ── 1. DB connectivity ────────────────────────────────────────
  try {
    await sequelize.authenticate();
    ok('db.connect');
  } catch (e) {
    ko('db.connect', e.message);
    return res.status(503).json({ success: false, checks, duration_ms: Date.now() - t0 });
  }

  // ── 2. Required tables present ────────────────────────────────
  // These tables must exist for the platform to function.
  // quiz_attempts is intentionally excluded: it is only consulted as a
  // last-resort fallback in platform-stats when practice_attempts is
  // unavailable. Every primary query path uses practice_attempts instead.
  const requiredTables = [
    'users', 'exam_boards', 'subjects', 'teacher_subjects',
    'topics', 'subtopics', 'resources', 'questions',
    'student_subjects', 'student_exam_types',
    'subtopic_progress', 'practice_attempts',
  ];
  const present = new Set();
  for (const t of requiredTables) {
    const r = await sequelize.query(
      `SELECT to_regclass(:fq) IS NOT NULL AS exists`,
      { replacements: { fq: `public.${t}` }, type: QueryTypes.SELECT }
    );
    if (r[0]?.exists) { present.add(t); ok(`schema.table.${t}`); }
    else ko(`schema.table.${t}`, 'missing');
  }

  // Optional tables — used only as fallbacks. Missing is acceptable and
  // does not affect the overall health result. Checked here for visibility.
  const optionalTables = [
    'quiz_attempts',   // fallback data source in platform-stats daily_activity
  ];
  for (const t of optionalTables) {
    const r = await sequelize.query(
      `SELECT to_regclass(:fq) IS NOT NULL AS exists`,
      { replacements: { fq: `public.${t}` }, type: QueryTypes.SELECT }
    );
    // ok() in both cases — absence is not a failure, just informational.
    ok(`schema.table.${t} (optional)`, r[0]?.exists ? 'present' : 'absent — fallback only');
  }

  // ── 3. Critical columns we rely on ────────────────────────────
  const requiredColumns = [
    ['users',              'pending_exam_board_ids'],
    ['users',              'last_activity_date'],
    ['subtopic_progress',  'last_accessed'],
    ['practice_attempts',  'student_id'],
    ['student_exam_types', 'student_id'],
  ];
  for (const [table, column] of requiredColumns) {
    const r = await sequelize.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = :table AND column_name = :column`,
      { replacements: { table, column }, type: QueryTypes.SELECT }
    );
    if (!r.length) ko(`schema.column.${table}.${column}`, 'missing');
    else ok(`schema.column.${table}.${column}`, r[0].data_type);
  }

  // student_id columns above must be uuid (we rebuilt them)
  for (const t of ['practice_attempts', 'student_exam_types']) {
    const r = await sequelize.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = :t AND column_name = 'student_id'`,
      { replacements: { t }, type: QueryTypes.SELECT }
    );
    if (r[0]?.data_type === 'uuid') ok(`schema.${t}.student_id is uuid`);
    else ko(`schema.${t}.student_id is uuid`, `got ${r[0]?.data_type || 'missing'}`);
  }

  // ── 4. Seed data sanity ──────────────────────────────────────
  const counts = {};
  for (const tbl of ['exam_boards', 'subjects', 'questions']) {
    if (!present.has(tbl)) continue;
    const r = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM ${tbl}`, { type: QueryTypes.SELECT }
    );
    counts[tbl] = r[0].n;
    r[0].n > 0 ? ok(`seed.${tbl}`, `${r[0].n} rows`) : ko(`seed.${tbl}`, '0 rows');
  }

  // ── 5. Optional: live 15-step walkthrough (?full=1) ──────────
  let walkthrough = null;
  if (req.query.full === '1') {
    walkthrough = { steps: [], passed: 0, failed: 0 };
    const stamp = Date.now();
    const created = { boardId: null, subjectId: null, topicId: null,
                      subtopicId: null, questionId: null, studentId: null };
    const w = (name, okFlag, info = '') => {
      walkthrough.steps.push({ name, ok: okFlag, info });
      okFlag ? walkthrough.passed++ : walkthrough.failed++;
    };
    const adminId = req.user.id;
    try {
      // 1. exam type
      const [b] = await sequelize.query(
        `INSERT INTO exam_boards (name, code, country, is_active, created_at, updated_at)
         VALUES (:n, :c, 'Nigeria', true, NOW(), NOW()) RETURNING id`,
        { replacements: { n: `HEALTH-${stamp}`, c: `HC${stamp.toString().slice(-6)}` },
          type: QueryTypes.SELECT });
      created.boardId = b.id;
      w('1. create exam type', true, `id=${b.id}`);

      // 2. subject
      const [s] = await sequelize.query(
        `INSERT INTO subjects (exam_board_id, name, code, is_active, created_at, updated_at)
         VALUES (:b, :n, :c, true, NOW(), NOW()) RETURNING id`,
        { replacements: { b: created.boardId, n: `Health Subj ${stamp}`,
                          c: `HS${stamp.toString().slice(-6)}` }, type: QueryTypes.SELECT });
      created.subjectId = s.id;
      w('2. create subject', true, `id=${s.id}`);

      // 3-4. find a teacher and assign
      const [teacher] = await sequelize.query(
        `SELECT id FROM users WHERE role='teacher' AND is_active=true LIMIT 1`,
        { type: QueryTypes.SELECT });
      if (!teacher) throw new Error('no active teacher exists');
      await sequelize.query(
        `INSERT INTO teacher_subjects (teacher_id, subject_id, exam_board_id,
            assigned_by, assigned_at, is_active)
         VALUES (:t, :s, :b, :a, NOW(), true)
         ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true`,
        { replacements: { t: teacher.id, s: created.subjectId,
                          b: created.boardId, a: adminId }, type: QueryTypes.INSERT });
      w('4. assign teacher → subject', true, `teacher=${teacher.id}`);

      // 5. topic
      const [tp] = await sequelize.query(
        `INSERT INTO topics (subject_id, name, description, order_index, is_active, created_at, updated_at)
         VALUES (:s, 'Health Topic', 'health check', 0, true, NOW(), NOW()) RETURNING id`,
        { replacements: { s: created.subjectId }, type: QueryTypes.SELECT });
      created.topicId = tp.id;
      w('5. create topic', true, `id=${tp.id}`);

      // 6. subtopic
      const [st] = await sequelize.query(
        `INSERT INTO subtopics (topic_id, subject_id, name, description, order_index,
            is_active, created_at, updated_at)
         VALUES (:t, :s, 'Health Sub', 'health check', 0, true, NOW(), NOW()) RETURNING id`,
        { replacements: { t: created.topicId, s: created.subjectId },
          type: QueryTypes.SELECT });
      created.subtopicId = st.id;
      w('6. create subtopic', true, `id=${st.id}`);

      // 7. resource (mirror real upload route — only topic/subtopic FK)
      const [rs] = await sequelize.query(
        `INSERT INTO resources (title, resource_type, file_url, is_active, is_free,
            uploaded_by, subtopic_id, topic_id, created_at, updated_at)
         VALUES (:title, 'pdf', '/uploads/resources/_health.pdf', true, true,
                 :uploader, :sub, :top, NOW(), NOW()) RETURNING id`,
        { replacements: { title: `health-${stamp}`, uploader: teacher.id,
                          sub: created.subtopicId, top: created.topicId },
          type: QueryTypes.SELECT });
      w('7. create resource', true, `id=${rs.id}`);

      // 8. question (mirror real teacher question route)
      const [q] = await sequelize.query(
        `INSERT INTO questions (subtopic_id, submitted_by, question_text,
            options, correct_answer, explanation, difficulty, type, marks,
            is_active, created_at, updated_at)
         VALUES (:sub, :creator, 'Health: 1+1=?',
                 '[{"option_text":"1","is_correct":false},{"option_text":"2","is_correct":true}]'::jsonb,
                 '2', 'basic', 'easy', 'mcq', 1, true, NOW(), NOW()) RETURNING id`,
        { replacements: { sub: created.subtopicId, creator: teacher.id },
          type: QueryTypes.SELECT });
      created.questionId = q.id;
      w('8. create question', true, `id=${q.id}`);

      // 9. synthetic student
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('Healthcheck1!', 10);
      const [u] = await sequelize.query(
        `INSERT INTO users (email, password, first_name, last_name, role,
            is_active, is_verified, subscription_status, pending_exam_board_ids,
            created_at, updated_at)
         VALUES (:email, :pw, 'Health', 'Check', 'student',
                 true, true, 'free_trial', ARRAY[:board]::integer[], NOW(), NOW())
         RETURNING id`,
        { replacements: { email: `health-${stamp}@check.local`, pw: hash,
                          board: created.boardId }, type: QueryTypes.SELECT });
      created.studentId = u.id;
      w('9. register student', true, `id=${u.id}`);

      // 10. enrol
      await ensureEnrollmentColumns();
      await sequelize.query(
        `INSERT INTO student_subjects (student_id, subject_id, is_active, status, enrollment_source)
         VALUES (:s, :sub, true, :approvedStatus, :explicitSource)
         ON CONFLICT (student_id, subject_id) DO UPDATE SET is_active=true, status=:approvedStatus`,
        { replacements: { s: created.studentId, sub: created.subjectId, approvedStatus: ENROLLMENT_STATUS.APPROVED, explicitSource: ENROLLMENT_SOURCE.EXPLICIT },
          type: QueryTypes.INSERT });
      await sequelize.query(
        `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
         VALUES (:s, :b, true, :approvedStatus)
         ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active=true, status=:approvedStatus`,
        { replacements: { s: created.studentId, b: created.boardId, approvedStatus: ENROLLMENT_STATUS.APPROVED },
          type: QueryTypes.INSERT });
      w('10. enrol student → subject', true);

      // 11. visibility
      const [enr] = await sequelize.query(
        `SELECT 1 FROM student_subjects WHERE student_id=:s AND subject_id=:sub`,
        { replacements: { s: created.studentId, sub: created.subjectId },
          type: QueryTypes.SELECT });
      w('11. student sees enrolled subject', !!enr);

      // 12. mark resources complete
      await sequelize.query(
        `INSERT INTO subtopic_progress (student_id, subtopic_id, resources_completed,
            last_accessed, created_at, updated_at)
         VALUES (:s, :sub, true, NOW(), NOW(), NOW())
         ON CONFLICT (student_id, subtopic_id) DO UPDATE SET
           resources_completed=true, last_accessed=NOW(), updated_at=NOW()`,
        { replacements: { s: created.studentId, sub: created.subtopicId },
          type: QueryTypes.INSERT });
      w('12. mark resources completed', true);

      // 13. practice attempt
      await sequelize.query(
        // BUG FIX: created_at/updated_at are NOT NULL with no value
        // supplied here — same root cause confirmed via live production
        // logs in quizzes.js's POST /attempt. This smoke test was reporting
        // '13. record practice attempt' as passing (w('13...', true) is
        // hardcoded, not derived from the query result) while the INSERT
        // itself was almost certainly failing silently the whole time.
        `INSERT INTO practice_attempts (student_id, question_id, is_correct,
            time_taken_seconds, attempted_at, created_at, updated_at)
         VALUES (:s, :q, true, 5, NOW(), NOW(), NOW())`,
        { replacements: { s: created.studentId, q: created.questionId },
          type: QueryTypes.INSERT });
      w('13. record practice attempt', true);

      // 14. quiz pass
      await sequelize.query(
        `UPDATE subtopic_progress SET quiz_completed=true, updated_at=NOW()
         WHERE student_id=:s AND subtopic_id=:sub`,
        { replacements: { s: created.studentId, sub: created.subtopicId },
          type: QueryTypes.UPDATE });
      w('14. record quiz completion', true);

      // 15. dashboard math
      const [dash] = await sequelize.query(
        `SELECT
           (SELECT COUNT(*)::int FROM practice_attempts WHERE student_id=:s) AS attempts,
           (SELECT COUNT(*)::int FROM subtopic_progress
              WHERE student_id=:s AND quiz_completed=true) AS quizzes`,
        { replacements: { s: created.studentId }, type: QueryTypes.SELECT });
      w('15. dashboard reflects activity',
        dash.attempts >= 1 && dash.quizzes >= 1,
        `attempts=${dash.attempts} quizzes=${dash.quizzes}`);
    } catch (err) {
      w('walkthrough error', false, err.message);
    } finally {
      // cleanup — order matters for FKs
      try {
        if (created.studentId)  await sequelize.query(`DELETE FROM users      WHERE id=:id`, { replacements: { id: created.studentId },  type: QueryTypes.DELETE });
        if (created.questionId) await sequelize.query(`DELETE FROM questions  WHERE id=:id`, { replacements: { id: created.questionId }, type: QueryTypes.DELETE });
        if (created.subtopicId) await sequelize.query(`DELETE FROM resources  WHERE subtopic_id=:id`, { replacements: { id: created.subtopicId }, type: QueryTypes.DELETE });
        if (created.subtopicId) await sequelize.query(`DELETE FROM subtopics  WHERE id=:id`, { replacements: { id: created.subtopicId }, type: QueryTypes.DELETE });
        if (created.topicId)    await sequelize.query(`DELETE FROM topics     WHERE id=:id`, { replacements: { id: created.topicId },    type: QueryTypes.DELETE });
        if (created.subjectId)  await sequelize.query(`DELETE FROM teacher_subjects WHERE subject_id=:id`, { replacements: { id: created.subjectId }, type: QueryTypes.DELETE });
        if (created.subjectId)  await sequelize.query(`DELETE FROM subjects   WHERE id=:id`, { replacements: { id: created.subjectId },  type: QueryTypes.DELETE });
        if (created.boardId)    await sequelize.query(`DELETE FROM exam_boards WHERE id=:id`, { replacements: { id: created.boardId },   type: QueryTypes.DELETE });
      } catch (cleanupErr) {
        walkthrough.cleanup_warning = cleanupErr.message;
      }
    }
  }

  const failedSchema = checks.filter(c => !c.ok).length;
  const overall = failedSchema === 0 && (!walkthrough || walkthrough.failed === 0);
  return res.status(overall ? 200 : 503).json({
    success: overall,
    summary: {
      schema_checks: checks.length,
      schema_failed: failedSchema,
      walkthrough_run: !!walkthrough,
      walkthrough_passed: walkthrough?.passed ?? null,
      walkthrough_failed: walkthrough?.failed ?? null,
      seed_counts: counts,
    },
    checks,
    walkthrough,
    duration_ms: Date.now() - t0,
  });
});

// ── POST /api/admin/migrate-to-r2 ────────────────────────────────────────────
// One-time migration: uploads every resource whose file_url is a local
// /uploads/ path to Cloudflare R2 and updates the DB row.
// Protected: admin only. Safe to call multiple times (already-migrated rows
// are skipped). Query param: ?dry=true to preview without making changes.
router.post('/migrate-to-r2', protect, adminOnly, async (req, res) => {
  const fs   = require('fs');
  const path = require('path');
  const mime = (() => { try { return require('mime-types'); } catch { return null; } })();
  const r2   = require('../utils/r2Storage');
  const dry  = req.query.dry === 'true';

  if (!r2.isR2Enabled()) {
    return res.status(503).json({
      success: false,
      error: 'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL in api.env on the Hetzner server.'
    });
  }

  try {
    const rows = await sequelize.query(
      `SELECT id, title, file_url, original_filename, mime_type
         FROM resources
        WHERE file_url IS NOT NULL
          AND (file_url LIKE '/uploads/%' OR file_url LIKE 'uploads/%')
        ORDER BY created_at ASC`,
      { type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return res.json({ success: true, message: 'Nothing to migrate — all resources already on R2.', migrated: 0, skipped: 0, failed: 0, results: [] });
    }

    const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
    const results = [];
    let migrated = 0, skipped = 0, failed = 0;

    for (const row of rows) {
      const relPath  = row.file_url.replace(/^\//, '');
      const fullPath = path.join(UPLOADS_DIR, relPath.replace(/^uploads\//, ''));
      const filename = row.original_filename || path.basename(relPath);

      if (!fs.existsSync(fullPath)) {
        results.push({ id: row.id, title: row.title, status: 'skipped', reason: 'file not found on disk' });
        skipped++;
        continue;
      }

      if (dry) {
        results.push({ id: row.id, title: row.title, status: 'would_migrate', file: relPath });
        migrated++;
        continue;
      }

      try {
        const buffer   = fs.readFileSync(fullPath);
        const mimetype = row.mime_type || (mime ? mime.lookup(fullPath) : null) || 'application/octet-stream';
        const { url }  = await r2.uploadBuffer({ buffer, originalname: filename, mimetype });

        await sequelize.query(
          `UPDATE resources SET file_url = :url, updated_at = NOW() WHERE id = :id`,
          { replacements: { url, id: row.id }, type: QueryTypes.UPDATE }
        );

        results.push({ id: row.id, title: row.title, status: 'migrated', url });
        migrated++;
      } catch (err) {
        results.push({ id: row.id, title: row.title, status: 'failed', reason: err.message });
        failed++;
      }
    }

    return res.json({ success: true, dry, migrated, skipped, failed, total: rows.length, results });
  } catch (err) {
    console.error('[migrate-to-r2]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/admin/purge-all-resources ─────────────────────────────────────
// Deletes ALL resources, their assignments (resource_assignments +
// resource_user_assignments), and any R2 objects. Irreversible.
// Protected: admin only. Requires header  X-Confirm: purge-all-resources
router.delete('/purge-all-resources', protect, adminOnly, adminActionLimiter, requireConfirmHeader('purge-all-resources'), async (req, res) => {
  // Note: confirmation header check is now handled by requireConfirmHeader middleware above.
  // The old inline check below is superseded but kept as belt-and-suspenders comment.

  try {
    const r2 = require('../utils/r2Storage');

    // Fetch all file_url values so we can delete from R2
    const rows = await sequelize.query(
      `SELECT id, file_url FROM resources WHERE file_url IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );

    // Best-effort R2 deletions (don't block on failures)
    if (r2.isR2Enabled()) {
      await Promise.allSettled(rows.map(r => r2.deleteByUrl(r.file_url)));
    }

    // Delete in FK-safe order
    const [, raResult]  = await sequelize.query(`DELETE FROM resource_assignments`, { type: QueryTypes.DELETE });
    const [, ruaResult] = await sequelize.query(`DELETE FROM resource_user_assignments`, { type: QueryTypes.DELETE });
    const [, rResult]   = await sequelize.query(`DELETE FROM resources`, { type: QueryTypes.DELETE });

    await audit.log(req, audit.ACTIONS.RESOURCE_PURGE, {
      severity: 'critical',
      metadata: { resources_deleted: rows.length, r2_attempted: r2.isR2Enabled() ? rows.length : 0 },
    });

    return res.json({
      success: true,
      message: 'All resources and assignments purged.',
      r2_attempted: r2.isR2Enabled() ? rows.length : 0,
      resources_deleted: rows.length,
    });
  } catch (err) {
    console.error('[purge-all-resources]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
