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
// Codes MUST match GamificationBar.jsx BADGE_META keys exactly.
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
    // FIX: was 'quiz_master' — GamificationBar.jsx BADGE_META key is 'quiz_master_10'
    // Mismatch meant badge was saved in DB but never rendered in the UI.
    // Threshold is 10 completed quizzes — >= 1 would fire on the very first quiz.
    code:  'quiz_master_10',
    check: (s) => s.quiz_count >= 10,
  },
  {
    // NEW: awarded when student hits 90%+ accuracy in any subject with 10+ attempts
    code:  'subject_complete',
    check: (s) => s.best_subject_accuracy >= 90 && s.best_subject_attempts >= 10,
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
    // Guard: skip the UPDATE entirely if there's nothing to add (unrecognised
    // event type). quiz_completed always runs even though xpToAdd is set above,
    // so the guard correctly allows it through.
    if (xpToAdd === 0 && eventType !== 'quiz_completed') return;

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
    // NEW: also pulls best_subject_accuracy / best_subject_attempts for subject_complete badge
    const stats = await sequelize.query(
      `SELECT
         u.xp_points,
         COALESCE(u.study_streak_days, 0)                                      AS study_streak_days,
         COUNT(pa.id)::INTEGER                                                  AS total_attempts,
         COALESCE(
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END))::INTEGER,
           0
         )                                                                      AS accuracy_pct,
         -- quiz_count: sum across both quiz surfaces (subtopic quizzes + submitted test assignments)
         (
           SELECT COUNT(*)::INTEGER FROM subtopic_quiz_attempts WHERE student_id = :userId
         ) + (
           SELECT COUNT(*)::INTEGER FROM test_assignments
           WHERE student_id = :userId AND is_submitted = true
         )                                                                      AS quiz_count,
         -- best subject accuracy and attempt count for subject_complete badge
         COALESCE((
           SELECT ROUND(AVG(CASE WHEN pa2.is_correct THEN 100.0 ELSE 0 END))::INTEGER
           FROM practice_attempts pa2
           JOIN questions q2 ON q2.id = pa2.question_id
           WHERE pa2.student_id = :userId
           GROUP BY q2.subject_id_uuid
           ORDER BY AVG(CASE WHEN pa2.is_correct THEN 100.0 ELSE 0 END) DESC
           LIMIT 1
         ), 0)                                                                  AS best_subject_accuracy,
         COALESCE((
           SELECT COUNT(pa2.id)::INTEGER
           FROM practice_attempts pa2
           JOIN questions q2 ON q2.id = pa2.question_id
           WHERE pa2.student_id = :userId
           GROUP BY q2.subject_id_uuid
           ORDER BY AVG(CASE WHEN pa2.is_correct THEN 100.0 ELSE 0 END) DESC
           LIMIT 1
         ), 0)                                                                  AS best_subject_attempts
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
