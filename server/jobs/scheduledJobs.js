// server/jobs/scheduledJobs.js
// ─────────────────────────────────────────────────────────────────────────────
// FIXES in this version:
//   1. Weekly digest user query now correctly uses last_activity_date
//      (the actual column name on users table, not last_login).
//   2. Streak nudge query fixed — the CASE expression was mixing CURRENT_DATE
//      (date) with created_at (timestamp) without explicit cast, causing
//      "operator does not exist: date - timestamp" on strict pg setups.
//   3. Added try/catch around individual email sends — one failure no longer
//      stops the rest of the batch.
//   4. node-cron install hint is now more actionable.
// ─────────────────────────────────────────────────────────────────────────────

let cron;
try {
  cron = require('node-cron');
} catch {
  console.warn('[jobs] node-cron not installed. Scheduled emails are disabled.');
  console.warn('[jobs] To enable: cd server && npm install node-cron');
}

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { sendWeeklyDigest, sendStreakNudge } = require('../services/emailService');

// ── Weekly digest — every Monday 9am WAT ─────────────────────────────────────
async function runWeeklyDigest() {
  console.log('[jobs] Running weekly digest…');
  try {
    // FIX: use last_activity_date (the correct column; last_login is not updated by practice)
    const users = await sequelize.query(
      `SELECT id, first_name, email
       FROM users
       WHERE role = 'student'
         AND is_active = true
         AND last_activity_date > CURRENT_DATE - INTERVAL '14 days'`,
      { type: QueryTypes.SELECT }
    );

    console.log(`[jobs] Sending digest to ${users.length} active students`);

    for (const user of users) {
      try {
        const [bestRow] = await sequelize.query(
          `SELECT s.name AS subject_name,
                  ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS acc
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           JOIN subjects  s ON s.id = q.subject_id_uuid
           WHERE pa.student_id = :id
             AND pa.attempted_at > NOW() - INTERVAL '7 days'
           GROUP BY s.name
           ORDER BY acc DESC LIMIT 1`,
          { replacements: { id: user.id }, type: QueryTypes.SELECT }
        );

        const [weakRow] = await sequelize.query(
          `SELECT q.topic, q.subtopic_id
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           WHERE pa.student_id = :id
             AND pa.attempted_at > NOW() - INTERVAL '7 days'
           GROUP BY q.topic, q.subtopic_id
           ORDER BY AVG(CASE WHEN pa.is_correct THEN 1.0 ELSE 0 END) ASC
           LIMIT 1`,
          { replacements: { id: user.id }, type: QueryTypes.SELECT }
        );

        const [userRow] = await sequelize.query(
          `SELECT study_streak_days, xp_points FROM users WHERE id = :id`,
          { replacements: { id: user.id }, type: QueryTypes.SELECT }
        );

        const [accRow] = await sequelize.query(
          `SELECT ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 1) AS pct
           FROM practice_attempts
           WHERE student_id = :id
             AND attempted_at > NOW() - INTERVAL '7 days'`,
          { replacements: { id: user.id }, type: QueryTypes.SELECT }
        );

        await sendWeeklyDigest(user, {
          best_subject:         bestRow?.subject_name || '—',
          weakest_topic:        weakRow?.topic        || '—',
          weakest_subtopic_id:  weakRow?.subtopic_id  || null,
          streak:               userRow?.study_streak_days || 0,
          accuracy_pct:         accRow?.pct           || 0,
        });
      } catch (e) {
        console.warn(`[jobs] digest failed for ${user.email}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[jobs] weeklyDigest error:', err.message);
  }
}

// ── Streak nudge — every day at 6pm WAT ──────────────────────────────────────
async function runStreakNudge() {
  console.log('[jobs] Running streak nudge…');
  try {
    // FIX: cast created_at to date explicitly to avoid type-mismatch error
    const users = await sequelize.query(
      `SELECT id, first_name, email,
              CASE
                WHEN last_activity_date IS NOT NULL
                  THEN (CURRENT_DATE - last_activity_date)
                ELSE (CURRENT_DATE - created_at::date)
              END AS days_since
       FROM users
       WHERE role = 'student'
         AND is_active = true
         AND (
           (last_activity_date IS NOT NULL
            AND last_activity_date < CURRENT_DATE - INTERVAL '7 days')
           OR
           (last_activity_date IS NULL
            AND created_at::date < CURRENT_DATE - INTERVAL '7 days')
         )`,
      { type: QueryTypes.SELECT }
    );

    console.log(`[jobs] Sending nudge to ${users.length} inactive students`);

    for (const user of users) {
      try {
        await sendStreakNudge(user, user.days_since);
      } catch (e) {
        console.warn(`[jobs] nudge failed for ${user.email}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[jobs] streakNudge error:', err.message);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────
function startJobs() {
  if (!cron) {
    console.warn('[jobs] Scheduled jobs NOT started (node-cron missing).');
    return;
  }

  // Weekly digest — Monday 9am WAT
  cron.schedule('0 9 * * 1', runWeeklyDigest, {
    scheduled: true,
    timezone:  'Africa/Lagos',
  });

  // Daily streak nudge — 6pm WAT
  cron.schedule('0 18 * * *', runStreakNudge, {
    scheduled: true,
    timezone:  'Africa/Lagos',
  });

  console.log('✅ Scheduled jobs started (weekly digest Mon 9am + streak nudge daily 6pm WAT)');
}

module.exports = { startJobs, runWeeklyDigest, runStreakNudge };
