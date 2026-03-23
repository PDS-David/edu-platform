// server/middleware/xpMiddleware.js
// Called AFTER a successful answer or quiz submission.
// Awards XP, updates study streak, checks badge thresholds.
// Usage:
//   const { awardXP } = require('../middleware/xpMiddleware');
//   await awardXP(userId, 'answer', { is_correct: true });
//   await awardXP(userId, 'quiz_completed');

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

const XP_VALUES = {
  correct_answer: 10,
  wrong_answer:    2,   // participation XP
  quiz_completed: 50,
};

// Badge definitions — checked after every XP award.
// Codes must match GamificationBar.jsx BADGE_META keys.
const BADGES = [
  {
    code:  'first_answer',
    check: (s) => s.total_attempts >= 1,
  },
  {
    code:  'streak_3',
    check: (s) => s.study_streak_days >= 3,
  },
  {
    code:  'streak_7',
    check: (s) => s.study_streak_days >= 7,
  },
  {
    code:  'streak_30',
    check: (s) => s.study_streak_days >= 30,
  },
  {
    code:  'accuracy_80',
    check: (s) => s.accuracy_pct >= 80 && s.total_attempts >= 20,
  },
  {
    // Awarded after completing first quiz (quiz_count = 1) per spec
    code:  'quiz_master',
    check: (s) => s.quiz_count >= 1,
  },
  {
    code:  'xp_100',
    check: (s) => s.xp_points >= 100,
  },
  {
    code:  'xp_500',
    check: (s) => s.xp_points >= 500,
  },
];

// ── Core function — call this from anywhere ────────────────────────────────
async function awardXP(userId, eventType, extras = {}) {
  if (!userId) return;

  try {
    // ── 1. Determine XP delta ────────────────────────────────────────────────
    let xpToAdd = 0;
    if (eventType === 'answer') {
      xpToAdd = extras.is_correct ? XP_VALUES.correct_answer : XP_VALUES.wrong_answer;
    } else if (eventType === 'quiz_completed') {
      xpToAdd = XP_VALUES.quiz_completed;
    }

    // ── 2. Single UPDATE: XP + streak + last_activity_date ──────────────────
    // Streak CASE:
    //   same day        → no change
    //   yesterday       → streak + 1
    //   older / NULL    → reset to 1
    await sequelize.query(
      `UPDATE users
       SET xp_points = COALESCE(xp_points, 0) + :xpToAdd,
           study_streak_days = CASE
             WHEN last_activity_date = CURRENT_DATE
               THEN study_streak_days
             WHEN last_activity_date = CURRENT_DATE - INTERVAL '1 day'
               THEN COALESCE(study_streak_days, 0) + 1
             ELSE 1
           END,
           last_activity_date = CURRENT_DATE
       WHERE id = :userId`,
      { replacements: { xpToAdd, userId }, type: QueryTypes.UPDATE }
    );

    // ── 3. Badge checks (fire-and-forget) ────────────────────────────────────
    checkBadges(userId).catch(() => {});

  } catch (err) {
    // Never crash the calling route
    console.warn('[xpMiddleware] awardXP error:', err.message);
  }
}

// ── Badge check — runs after every XP award ───────────────────────────────────
async function checkBadges(userId) {
  try {
    // Gather current user + attempt stats in one query
    const stats = await sequelize.query(
      `SELECT
         u.xp_points,
         COALESCE(u.study_streak_days, 0)                                      AS study_streak_days,
         COUNT(pa.id)::INTEGER                                                  AS total_attempts,
         COALESCE(
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END))::INTEGER,
           0
         )                                                                      AS accuracy_pct,
         (SELECT COUNT(*)::INTEGER
          FROM subtopic_quiz_attempts
          WHERE student_id = :userId)                                           AS quiz_count
       FROM users u
       LEFT JOIN practice_attempts pa ON pa.student_id = u.id
       WHERE u.id = :userId
       GROUP BY u.id`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    if (!stats.length) return;
    const s = stats[0];

    // Fetch already-earned badges to avoid re-awarding
    const earned = await sequelize.query(
      `SELECT badge_code FROM user_badges WHERE user_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    const earnedSet = new Set(earned.map(e => e.badge_code));

    for (const badge of BADGES) {
      if (earnedSet.has(badge.code)) continue;
      if (badge.check(s)) {
        await sequelize.query(
          `INSERT INTO user_badges (id, user_id, badge_code, earned_at)
           VALUES (gen_random_uuid(), :userId, :code, NOW())
           ON CONFLICT (user_id, badge_code) DO NOTHING`,
          { replacements: { userId, code: badge.code }, type: QueryTypes.INSERT }
        ).catch(() => {});
      }
    }
  } catch {
    // Silently ignore badge errors — never block the caller
  }
}

// ── Express middleware version (optional) ─────────────────────────────────────
// Reads req.xpEvent = { userId, eventType, is_correct } set by the handler.
const xpMiddleware = async (req, _res, next) => {
  const { userId, eventType, is_correct } = req.xpEvent || {};
  if (userId && eventType) {
    awardXP(userId, eventType, { is_correct }).catch(() => {});
  }
  next();
};

module.exports = { awardXP, xpMiddleware };
